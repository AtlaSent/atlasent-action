import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";

// Same mocking pattern as index.test.ts: @atlasent/enforce's network calls are
// replaced, EnforceError stays the real class so instanceof checks hold.
vi.mock("../evidenceClient", () => ({ emitEvidenceEvent: vi.fn(async () => {}) }));
vi.mock("../insights", () => ({ runInsightsEvaluate: vi.fn(async () => null) }));

vi.mock("@atlasent/enforce", async (importOriginal) => {
  const original = await importOriginal<typeof import("@atlasent/enforce")>();
  return {
    ...original,
    enforce: vi.fn(),
    evaluate: vi.fn(),
    verifyPermit: vi.fn(),
    reverifyPermit: vi.fn(),
    waitForApprovalResolution: vi.fn(),
  };
});

vi.mock("../approvals", () => ({ resolveApprovals: vi.fn() }));

vi.mock("../workloadIdentity", async (importOriginal) => {
  const original = await importOriginal<typeof import("../workloadIdentity")>();
  return {
    ...original,
    mintGithubActionsActorIdentity: vi.fn(),
    mintSupplyChainAssertion: vi.fn(),
  };
});

import {
  enforce,
  evaluate,
  reverifyPermit,
  verifyPermit,
  waitForApprovalResolution,
  EnforceError,
} from "@atlasent/enforce";
import type { Decision, EnforceConfig } from "@atlasent/enforce";
import { resolveApprovals } from "../approvals";
import { WorkloadIdentityError, mintGithubActionsActorIdentity } from "../workloadIdentity";
import { REHEARSAL_CASE_IDS } from "../rehearsal";
import { run } from "../index";

const mockEnforce = enforce as unknown as ReturnType<typeof vi.fn>;
const mockEvaluate = evaluate as unknown as ReturnType<typeof vi.fn>;
const mockVerifyPermit = verifyPermit as unknown as ReturnType<typeof vi.fn>;
const mockReverifyPermit = reverifyPermit as unknown as ReturnType<typeof vi.fn>;
const mockResolveApprovals = resolveApprovals as unknown as ReturnType<typeof vi.fn>;
const mockMint = mintGithubActionsActorIdentity as unknown as ReturnType<typeof vi.fn>;
const mockWait = waitForApprovalResolution as unknown as ReturnType<typeof vi.fn>;

const REQUEST_ID = "3f2c9a1e-7b4d-4c8e-9a6f-0d1e2b3c4d5e";
const ACTOR = "github-actions:repo:123:workflow:rehearse";
const TARGET = "api-service";
const ENVIRONMENT = "production";
const REVISION = "abc123";

class ProcessExitError extends Error {
  constructor(public readonly code: number | string | null | undefined) {
    super(`process.exit(${code})`);
    this.name = "ProcessExitError";
  }
}

let outputFile: string;
let summaryFile: string;
let savedEnv: NodeJS.ProcessEnv;
let exitSpy: { mock: { calls: Array<Array<unknown>> } };
let consoleSpy: { mock: { calls: Array<Array<unknown>> } };

// ── A small stateful stand-in for the runtime ───────────────────────────────
//
// Refuses an actor_identity it has already seen (the broker/runtime refuse a
// replayed credential) and denies a missing identity ACTOR_UNVERIFIED. With a
// verified actor it HOLDS for approval: the action class requires a person's
// approval and never reads a caller-asserted count. The approval wait stands
// in for the person approving in the console: it builds the claim body with
// the action's own builder (so the claim's identity is minted like the real
// one) and returns the claimed permit. Each permit is bound to its target,
// a target mismatch consumes nothing, and the first successful verify
// consumes the permit.

type EvalOverride = (config: EnforceConfig, evaluationId: string) => Decision;

interface FakeRuntime {
  seenAssertions: Set<string>;
  consumed: Set<string>;
  permits: Map<string, { target: string; hash: string }>;
  evalCalls: number;
  verifyCalls: number;
  evalOverrides: Partial<Record<string, EvalOverride>>;
  claimBodies: Array<Record<string, unknown>>;
}

let rt: FakeRuntime;
let mintCount: number;
let mintedAssertions: Array<Record<string, unknown>>;

const CLAIMED_PERMIT = "pt-secret-claimed";
const CLAIMED_HASH = "eh-claimed";
const REEVALUATION_ID = "ev-reevaluation";

function refusal(decision: Decision, code: string): EnforceError {
  return new EnforceError(
    `Permit verification failed (outcome=deny, code=${code})`,
    "verify-permit",
    decision,
    { outcome: "deny", verifyErrorCode: code },
  );
}

function jtiOf(config: EnforceConfig | Record<string, unknown>): string | undefined {
  const c = config as Record<string, unknown>;
  const identity = (c["actorIdentity"] ?? c["actor_identity"]) as Record<string, unknown> | undefined;
  const j = identity?.["jti"];
  return typeof j === "string" ? j : undefined;
}

type WaitConfig = {
  approvalId: string;
  maxWaitMs: number;
  buildClaimBody?: (row: { status: string; claimEnvironment?: string }) => Promise<Record<string, unknown>>;
};

/** The person approved and the claim succeeded: what the real wait returns. */
async function approveAndClaim(config: WaitConfig) {
  let body: Record<string, unknown>;
  try {
    body = await config.buildClaimBody!({ status: "approved_awaiting_claim", claimEnvironment: ENVIRONMENT });
  } catch (err) {
    // The real waitForApprovalResolution wraps an unbuildable body like this.
    throw new EnforceError(
      `Approval claim refused before sending: could not build the claim body (${err instanceof Error ? err.message : String(err)}) — failing closed`,
      "evaluate",
    );
  }
  rt.claimBodies.push(body);
  const jti = jtiOf(body);
  if (!jti || rt.seenAssertions.has(jti)) {
    return { status: "approved_awaiting_claim", claimFailure: "HTTP 403" };
  }
  rt.seenAssertions.add(jti);
  rt.permits.set(CLAIMED_PERMIT, { target: TARGET, hash: CLAIMED_HASH });
  return {
    status: "approved_awaiting_claim",
    reEvaluationDecision: "allow",
    permitToken: CLAIMED_PERMIT,
    executionHashExpected: CLAIMED_HASH,
    reEvaluationId: REEVALUATION_ID,
  };
}

function installFakeRuntime(): void {
  rt = {
    seenAssertions: new Set(),
    consumed: new Set(),
    permits: new Map(),
    evalCalls: 0,
    verifyCalls: 0,
    evalOverrides: {},
    claimBodies: [],
  };

  mockEvaluate.mockImplementation(async (config: EnforceConfig): Promise<Decision> => {
    rt.evalCalls++;
    const evaluationId = `ev-${rt.evalCalls}`;
    const caseId = String(config.context?.["rehearsal_case"] ?? "");
    const override = rt.evalOverrides[caseId];
    if (override) return override(config, evaluationId);

    const jti = jtiOf(config);
    if (!jti || rt.seenAssertions.has(jti)) {
      return { decision: "deny", denyCode: "ACTOR_UNVERIFIED", evaluationId };
    }
    rt.seenAssertions.add(jti);
    if (!config.changePlan?.revision) {
      return { decision: "deny", denyCode: "MISSING_BINDING", evaluationId };
    }
    return { decision: "escalate", approvalRequestId: `apr-${rt.evalCalls}`, evaluationId };
  });

  mockWait.mockImplementation(approveAndClaim);

  mockVerifyPermit.mockImplementation(async (config: EnforceConfig, decision: Decision) => {
    rt.verifyCalls++;
    const jti = jtiOf(config);
    if (!jti || rt.seenAssertions.has(jti)) throw refusal(decision, "ACTOR_UNVERIFIED");
    rt.seenAssertions.add(jti);
    const permit = rt.permits.get(decision.permitToken ?? "");
    if (!permit) throw refusal(decision, "PERMIT_NOT_FOUND");
    if (config.targetId !== permit.target) throw refusal(decision, "PERMIT_BINDING_MISMATCH");
    if (rt.consumed.has(decision.permitToken as string)) throw refusal(decision, "PERMIT_ALREADY_USED");
    if (decision.executionHashExpected !== permit.hash) throw refusal(decision, "PAYLOAD_MISMATCH");
    rt.consumed.add(decision.permitToken as string);
    return { verified: true, outcome: "allow" };
  });
}

function mintedIdentity(n: number, overrides: { actorId?: string; sha?: string } = {}) {
  const assertion = { version: "actor_identity.v1", jti: `jti-${n}`, signature: `runtime-signed-${n}` };
  return {
    actorId: overrides.actorId ?? ACTOR,
    assertion,
    source: {
      issuer: "https://token.actions.githubusercontent.com" as const,
      repository: "acme/app",
      repository_id: "123",
      ref: "refs/heads/main",
      sha: overrides.sha ?? REVISION,
      workflow_ref: "acme/app/.github/workflows/rehearse.yml@refs/heads/main",
      actor: "dispatcher",
      actor_id: "42",
      run_id: "900",
      run_attempt: "1",
      environment: ENVIRONMENT,
    },
  };
}

beforeEach(() => {
  outputFile = path.join(os.tmpdir(), `gha-output-rehearsal-${Date.now()}-${Math.random()}.txt`);
  summaryFile = path.join(os.tmpdir(), `gha-summary-rehearsal-${Date.now()}-${Math.random()}.md`);
  savedEnv = { ...process.env };
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("INPUT_") || key.startsWith("GITHUB_") || key === "ATLASENT_BASE_URL") {
      delete process.env[key];
    }
  }
  process.env["GITHUB_OUTPUT"] = outputFile;
  process.env["GITHUB_STEP_SUMMARY"] = summaryFile;
  process.env["GITHUB_REPOSITORY"] = "acme/app";
  process.env["GITHUB_REF"] = "refs/heads/main";
  process.env["GITHUB_SHA"] = REVISION;
  process.env["GITHUB_RUN_ID"] = "900";
  process.env["GITHUB_RUN_NUMBER"] = "12";
  process.env["GITHUB_WORKFLOW"] = "rehearse";
  process.env["GITHUB_EVENT_NAME"] = "workflow_dispatch";
  process.env["ATLASENT_API_KEY"] = "ask_live_rehearsal_key";

  exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: number | string | null) => {
    throw new ProcessExitError(code);
  }) as unknown as typeof exitSpy;
  consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {}) as unknown as typeof consoleSpy;

  mockEnforce.mockReset();
  mockEvaluate.mockReset();
  mockVerifyPermit.mockReset();
  mockReverifyPermit.mockReset();
  mockResolveApprovals.mockReset();
  mockMint.mockReset();
  mockWait.mockReset();

  installFakeRuntime();
  mintCount = 0;
  mintedAssertions = [];
  mockMint.mockImplementation(async () => {
    mintCount++;
    const id = mintedIdentity(mintCount);
    mintedAssertions.push(id.assertion);
    return id;
  });
  mockResolveApprovals.mockResolvedValue({
    approvals: 2,
    approving_reviewers: ["alice", "bob"],
    pr_number: 7,
    source: "pr-reviews",
  });

  setInput("rehearsal-request-id", REQUEST_ID);
  setInput("action", "production.deploy");
  setInput("target-id", TARGET);
  setInput("environment", ENVIRONMENT);
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) delete process.env[key];
  }
  Object.assign(process.env, savedEnv);
  for (const f of [outputFile, summaryFile]) {
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  }
  vi.restoreAllMocks();
});

function setInput(name: string, value: string): void {
  process.env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`] = value;
}

function clearInput(name: string): void {
  delete process.env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`];
}

function readOutputs(): Record<string, string> {
  if (!fs.existsSync(outputFile)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(outputFile, "utf-8").split("\n").filter(Boolean)) {
    const i = line.indexOf("=");
    if (i !== -1) out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

function readSummary(): string {
  return fs.existsSync(summaryFile) ? fs.readFileSync(summaryFile, "utf-8") : "";
}

function logs(): string[] {
  return consoleSpy.mock.calls.map((c) => String(c[0]));
}

function exitCalls(): unknown[] {
  return exitSpy.mock.calls.map((c) => c[0]);
}

interface CaseOut {
  case_id: string;
  status: string;
  decision: string | null;
  deny_code: string | null;
  request_id: string | null;
  approval_request_id?: string;
  approval_status?: string;
  claim_failure?: string;
  verify_outcome?: string;
  verify_error_code?: string;
  control_verify_outcome?: string;
  control_verify_error_code?: string;
}

function cases(): Record<string, CaseOut> {
  const raw = readOutputs()["rehearsal-cases"];
  expect(raw, "rehearsal-cases output must be set").toBeDefined();
  const parsed = JSON.parse(raw) as CaseOut[];
  return Object.fromEntries(parsed.map((c) => [c.case_id, c]));
}

function evalConfigs(): EnforceConfig[] {
  return mockEvaluate.mock.calls.map((c) => c[0] as EnforceConfig);
}

function verifyConfigs(): EnforceConfig[] {
  return mockVerifyPermit.mock.calls.map((c) => c[0] as EnforceConfig);
}

function verifyCalls(): Array<{ config: EnforceConfig; decision: Decision }> {
  return mockVerifyPermit.mock.calls.map((c) => ({ config: c[0] as EnforceConfig, decision: c[1] as Decision }));
}

/** Replace the n-th (1-based) verify call's answer; every other call keeps the fake runtime's. */
function onVerifyCall(n: number, answer: (cfg: EnforceConfig, decision: Decision) => Promise<unknown>): void {
  const defaultVerify = mockVerifyPermit.getMockImplementation()!;
  mockVerifyPermit.mockImplementation(async (cfg: EnforceConfig, decision: Decision) => {
    if (mockVerifyPermit.mock.calls.length === n) return answer(cfg, decision);
    return defaultVerify(cfg, decision);
  });
}

async function runExpectingFailure(): Promise<void> {
  await expect(run()).rejects.toBeInstanceOf(ProcessExitError);
  expect(exitCalls()).toContain(1);
}

function expectNoNetworkCall(): void {
  expect(mockEvaluate).not.toHaveBeenCalled();
  expect(mockVerifyPermit).not.toHaveBeenCalled();
  expect(mockReverifyPermit).not.toHaveBeenCalled();
  expect(mockEnforce).not.toHaveBeenCalled();
  expect(mockMint).not.toHaveBeenCalled();
  expect(mockResolveApprovals).not.toHaveBeenCalled();
  expect(mockWait).not.toHaveBeenCalled();
}

// ---------------------------------------------------------------------------

describe("rehearsal mode: happy path", () => {
  it("runs all five cases and reports all_expected", async () => {
    await run();

    expect(exitSpy).not.toHaveBeenCalled();
    const out = readOutputs();
    expect(out["rehearsal-verdict"]).toBe("all_expected");
    expect(out["rehearsal-request-id"]).toBe(REQUEST_ID);
    // A rehearsal never authorizes a protected step.
    expect(out["verified"]).toBe("false");

    const c = cases();
    expect(Object.keys(c)).toEqual([...REHEARSAL_CASE_IDS]);
    for (const id of REHEARSAL_CASE_IDS) expect(c[id].status, id).toBe("expected");

    expect(c["unauthorized_denied"]).toMatchObject({ decision: "deny", deny_code: "ACTOR_UNVERIFIED", request_id: "ev-1" });
    expect(c["missing_approval_denied_or_held"]).toMatchObject({
      decision: "escalate",
      deny_code: null,
      request_id: "ev-2",
      approval_request_id: "apr-2",
    });
    expect(c["authorized_action_succeeds"]).toMatchObject({
      decision: "allow",
      request_id: REEVALUATION_ID,
      approval_request_id: "apr-2",
      approval_status: "approved_awaiting_claim",
      verify_outcome: "allow",
    });
    expect(c["changed_or_replayed_denied"]).toMatchObject({
      decision: null,
      request_id: REEVALUATION_ID,
      verify_error_code: "PERMIT_ALREADY_USED",
    });
    expect(c["changed_target_denied"]).toMatchObject({
      decision: "allow",
      request_id: REEVALUATION_ID,
      verify_error_code: "PERMIT_BINDING_MISMATCH",
      control_verify_outcome: "allow",
    });
  });

  it("evaluates only cases 1 and 2, each marked with the request id and its case, and never asserts an approval", async () => {
    setInput("approvals-from", "pr-reviews");
    await run();

    const configs = evalConfigs();
    expect(configs.map((cfg) => cfg.context?.["rehearsal_case"])).toEqual([
      "unauthorized_denied",
      "missing_approval_denied_or_held",
    ]);
    for (const cfg of configs) {
      expect(cfg.context?.["rehearsal_request_id"]).toBe(REQUEST_ID);
      expect(cfg.action).toBe("production.deploy");
      expect(cfg.targetId).toBe(TARGET);
      expect(cfg.environment).toBe(ENVIRONMENT);
      // The same broker-derived change_plan on both, case 1 included.
      expect(cfg.changePlan).toEqual({ operation: "deploy", revision: REVISION });
      expect(cfg.state_snapshot).toEqual({ source: "github-actions", complete: true, run_id: "900" });
      expect(cfg.context).toMatchObject({
        source: "github-action",
        repository: "acme/app",
        sha: REVISION,
        triggering_actor: "github:dispatcher",
        pr_number: null,
        approvals: 0,
      });
      expect(cfg.context).not.toHaveProperty("approving_reviewers");
      // Never a caller-supplied raw payload hash for a mandatory action.
      expect(cfg.executionPayloadHash).toBeUndefined();
    }
    // No approval is derived from PR reviews, whatever approvals-from says.
    expect(mockResolveApprovals).not.toHaveBeenCalled();
    expect(logs().some((l) => l.includes("approvals-from is ignored"))).toBe(true);
  });

  it("waits on case 2's own approval request and claims with a fresh identity and the same change plan", async () => {
    await run();

    expect(mockWait).toHaveBeenCalledTimes(1);
    const waitConfig = mockWait.mock.calls[0][0] as WaitConfig;
    expect(waitConfig).toMatchObject({ approvalId: "apr-2", maxWaitMs: 30 * 60_000 });
    expect(rt.claimBodies).toHaveLength(1);
    // Mint order: case 2 evaluate, the claim, then the three verifies.
    expect(rt.claimBodies[0]).toEqual({
      actor_identity: mintedAssertions[1],
      change_plan: { operation: "deploy", revision: REVISION },
    });
    // The approver is told exactly which request to approve.
    expect(logs().some((l) => l.includes("approval request apr-2") && l.includes("Approve that request only"))).toBe(true);
  });

  it("max-wait-minutes bounds the wait", async () => {
    setInput("max-wait-minutes", "10");
    await run();
    expect((mockWait.mock.calls[0][0] as WaitConfig).maxWaitMs).toBe(10 * 60_000);
  });

  it("case 1 presents no actor_identity; every other call presents a freshly minted one", async () => {
    await run();

    const evals = evalConfigs();
    const verifies = verifyConfigs();
    expect(evals[0].actorIdentity).toBeUndefined();
    expect(evals[0].actor).toBe("rehearsal:unverified-actor");

    // 1 evaluate (case 2) + 1 claim + 3 verifies (case 5, case 3, case 4).
    expect(verifies).toHaveLength(3);
    expect(mockMint).toHaveBeenCalledTimes(5);
    for (const call of mockMint.mock.calls) {
      expect(call[0]).toMatchObject({ actionType: "production.deploy", environment: ENVIRONMENT });
    }

    const presented = [evals[1].actorIdentity, rt.claimBodies[0]["actor_identity"], ...verifies.map((v) => v.actorIdentity)];
    // Each one is a minted assertion, and no assertion is presented twice.
    for (const a of presented) expect(mintedAssertions).toContain(a);
    expect(new Set(presented).size).toBe(5);
    for (const cfg of [evals[1], ...verifies]) expect(cfg.actor).toBe(ACTOR);
  });

  it("presents the claimed permit for a changed target first, then its own, then again", async () => {
    await run();

    const verifies = verifyCalls();
    expect(verifies.map((v) => v.config.targetId)).toEqual([`${TARGET}--rehearsal-changed`, TARGET, TARGET]);
    for (const v of verifies) {
      // Always the claimed permit and its execution hash, never anything from the hold.
      expect(v.decision.permitToken).toBe(CLAIMED_PERMIT);
      expect(v.decision.executionHashExpected).toBe(CLAIMED_HASH);
      expect(v.config.environment).toBe(ENVIRONMENT);
      expect(v.config.requiredBindings).toEqual(["environment", "target_id", "payload_hash"]);
    }
  });

  it("never puts the claimed permit token in an output, the summary, or a non-mask log line", async () => {
    await run();

    const outputs = fs.readFileSync(outputFile, "utf-8");
    const summary = readSummary();
    expect(summary).toContain("informational");
    expect(summary).toContain(REQUEST_ID);
    expect(summary).toContain("apr-2");
    expect(outputs).not.toContain(CLAIMED_PERMIT);
    expect(summary).not.toContain(CLAIMED_PERMIT);
    expect(logs()).toContain(`::add-mask::${CLAIMED_PERMIT}`);
    for (const line of logs()) {
      if (line.includes(CLAIMED_PERMIT)) expect(line).toBe(`::add-mask::${CLAIMED_PERMIT}`);
    }
  });

  // Alias normalization of the action input is the shared canonicalAction
  // path, tested there; the alias literal is banned outside that allowlist.
  it("accepts an uppercase request UUID and sends it lowercased", async () => {
    setInput("rehearsal-request-id", REQUEST_ID.toUpperCase());
    await run();

    expect(exitSpy).not.toHaveBeenCalled();
    expect(readOutputs()["rehearsal-request-id"]).toBe(REQUEST_ID);
    for (const cfg of evalConfigs()) {
      expect(cfg.action).toBe("production.deploy");
      expect(cfg.context?.["rehearsal_request_id"]).toBe(REQUEST_ID);
    }
  });

  it.each(["hold", "escalate"] as const)("case 2 %s with an approval request is approvable", async (decision) => {
    rt.evalOverrides["missing_approval_denied_or_held"] = (cfg, id) => {
      rt.seenAssertions.add(jtiOf(cfg)!);
      return { decision, approvalRequestId: "apr-x", evaluationId: id };
    };
    await run();

    expect(exitSpy).not.toHaveBeenCalled();
    expect(cases()["missing_approval_denied_or_held"]).toMatchObject({ status: "expected", decision });
    expect((mockWait.mock.calls[0][0] as WaitConfig).approvalId).toBe("apr-x");
  });

  it("takes precedence over the single-eval path", async () => {
    await run();
    expect(mockEnforce).not.toHaveBeenCalled();
  });
});

describe("rehearsal mode: a case with the wrong outcome fails the step", () => {
  it("case 1 allowed (no verified actor required) → unexpected", async () => {
    rt.evalOverrides["unauthorized_denied"] = (_cfg, id) => ({
      decision: "allow",
      permitToken: "pt-secret-c1",
      executionHashExpected: "eh-c1",
      evaluationId: id,
    });
    await runExpectingFailure();

    expect(cases()["unauthorized_denied"].status).toBe("unexpected");
    expect(readOutputs()["rehearsal-verdict"]).toBe("unexpected");
    expect(logs().some((l) => l.includes("unauthorized_denied=unexpected"))).toBe(true);
    expect(fs.readFileSync(outputFile, "utf-8")).not.toContain("pt-secret-c1");
  });

  it("case 1 denied for another reason → unexpected", async () => {
    rt.evalOverrides["unauthorized_denied"] = (_cfg, id) => ({ decision: "deny", denyCode: "NO_POLICY", evaluationId: id });
    await runExpectingFailure();
    expect(cases()["unauthorized_denied"]).toMatchObject({ status: "unexpected", deny_code: "NO_POLICY" });
  });

  it("case 2 allowed without an approval → unexpected; nothing is waited on or verified", async () => {
    rt.evalOverrides["missing_approval_denied_or_held"] = (_cfg, id) => ({
      decision: "allow",
      permitToken: "pt-secret-c2",
      executionHashExpected: "eh-c2",
      evaluationId: id,
    });
    await runExpectingFailure();
    const c = cases();
    expect(c["missing_approval_denied_or_held"].status).toBe("unexpected");
    expect(c["authorized_action_succeeds"]).toMatchObject({ status: "unexpected", approval_status: "no_approval_request" });
    expect(c["changed_or_replayed_denied"].status).toBe("not_run");
    expect(c["changed_target_denied"].status).toBe("not_run");
    expect(mockWait).not.toHaveBeenCalled();
    expect(mockVerifyPermit).not.toHaveBeenCalled();
  });

  it("case 2 denied INSUFFICIENT_APPROVALS refuses, but leaves case 3 nothing to approve", async () => {
    rt.evalOverrides["missing_approval_denied_or_held"] = (_cfg, id) => ({
      decision: "deny",
      denyCode: "INSUFFICIENT_APPROVALS",
      evaluationId: id,
    });
    await runExpectingFailure();
    const c = cases();
    expect(c["missing_approval_denied_or_held"].status).toBe("expected");
    expect(c["authorized_action_succeeds"]).toMatchObject({ status: "unexpected", approval_status: "no_approval_request" });
    expect(c["changed_or_replayed_denied"].status).toBe("not_run");
    expect(c["changed_target_denied"].status).toBe("not_run");
    expect(mockWait).not.toHaveBeenCalled();
  });

  it("case 2 held with no approval request → unexpected, nothing is waited on", async () => {
    rt.evalOverrides["missing_approval_denied_or_held"] = (_cfg, id) => ({ decision: "escalate", evaluationId: id });
    await runExpectingFailure();
    expect(cases()["missing_approval_denied_or_held"].status).toBe("unexpected");
    expect(mockWait).not.toHaveBeenCalled();
  });

  it("case 2 denied for another reason → unexpected", async () => {
    rt.evalOverrides["missing_approval_denied_or_held"] = (_cfg, id) => ({ decision: "deny", denyCode: "ACTOR_UNVERIFIED", evaluationId: id });
    await runExpectingFailure();
    expect(cases()["missing_approval_denied_or_held"].status).toBe("unexpected");
  });

  it.each(["denied", "expired", "revoked"])("the approval resolves %s → case 3 unexpected, nothing verified", async (status) => {
    mockWait.mockImplementation(async () => ({ status }));
    await runExpectingFailure();
    const c = cases();
    expect(c["authorized_action_succeeds"]).toMatchObject({
      status: "unexpected",
      approval_request_id: "apr-2",
      approval_status: status,
    });
    expect(c["changed_or_replayed_denied"].status).toBe("not_run");
    expect(c["changed_target_denied"].status).toBe("not_run");
    expect(mockVerifyPermit).not.toHaveBeenCalled();
  });

  it("an approved request whose claim is refused → case 3 unexpected with the claim failure", async () => {
    mockWait.mockImplementation(async () => ({ status: "approved_awaiting_claim", claimFailure: "change_plan_mismatch" }));
    await runExpectingFailure();
    expect(cases()["authorized_action_succeeds"]).toMatchObject({
      status: "unexpected",
      approval_status: "approved_awaiting_claim",
      claim_failure: "change_plan_mismatch",
    });
    expect(mockVerifyPermit).not.toHaveBeenCalled();
  });

  it("a claimed permit with no execution hash → unexpected, masked, never verified", async () => {
    mockWait.mockImplementation(async () => ({
      status: "approved_awaiting_claim",
      permitToken: "pt-secret-nohash",
      reEvaluationId: REEVALUATION_ID,
    }));
    await runExpectingFailure();
    expect(cases()["authorized_action_succeeds"]).toMatchObject({ status: "unexpected", claim_failure: "no_execution_hash" });
    expect(mockVerifyPermit).not.toHaveBeenCalled();
    expect(logs()).toContain("::add-mask::pt-secret-nohash");
    expect(fs.readFileSync(outputFile, "utf-8")).not.toContain("pt-secret-nohash");
  });

  it.each([undefined, "deny", "hold"])(
    "a claimed permit with reevaluation decision %s → unexpected, decision preserved, never verified",
    async (reEvaluationDecision) => {
      mockWait.mockImplementation(async () => ({
        status: "approved_awaiting_claim",
        reEvaluationDecision,
        permitToken: "pt-secret-nonallow",
        executionHashExpected: CLAIMED_HASH,
        reEvaluationId: REEVALUATION_ID,
      }));
      await runExpectingFailure();
      expect(cases()["authorized_action_succeeds"]).toMatchObject({
        status: "unexpected",
        decision: reEvaluationDecision ?? null,
      });
      expect(mockVerifyPermit).not.toHaveBeenCalled();
      expect(logs()).toContain("::add-mask::pt-secret-nonallow");
      expect(fs.readFileSync(outputFile, "utf-8")).not.toContain("pt-secret-nonallow");
    },
  );

  it("nobody approves within max-wait-minutes → case 3 unexpected (timed_out), not a stopped run", async () => {
    const realNow = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(realNow);
    mockWait.mockImplementation(async (cfg: WaitConfig) => {
      clock.mockReturnValue(realNow + cfg.maxWaitMs + 1);
      throw new EnforceError("Approval wait timed out after 1800000ms with no human resolution — failing closed", "evaluate");
    });
    await runExpectingFailure();
    const c = cases();
    expect(c["authorized_action_succeeds"]).toMatchObject({ status: "unexpected", approval_status: "timed_out" });
    expect(c["changed_or_replayed_denied"].status).toBe("not_run");
    expect(c["changed_target_denied"].status).toBe("not_run");
    expect(logs().some((l) => l.includes("stopped (fail-closed)"))).toBe(false);
  });

  it("an approval poll failure before the deadline stops the run", async () => {
    mockWait.mockImplementation(async () => {
      throw new EnforceError("Approval status poll: authentication failed (HTTP 403)", "evaluate");
    });
    await runExpectingFailure();
    const c = cases();
    expect(c["missing_approval_denied_or_held"].status).toBe("expected");
    expect(c["authorized_action_succeeds"].status).toBe("not_run");
    expect(logs().some((l) => l.includes("stopped (fail-closed)") && l.includes("authentication failed"))).toBe(true);
  });

  it("an approval that must be claimed in another environment is never claimed", async () => {
    mockWait.mockImplementation(async (cfg: WaitConfig) => {
      try {
        await cfg.buildClaimBody!({ status: "approved_awaiting_claim", claimEnvironment: "staging" });
      } catch (err) {
        throw new EnforceError(`Approval claim refused before sending: ${(err as Error).message}`, "evaluate");
      }
      throw new Error("the claim body must not be built");
    });
    await runExpectingFailure();
    expect(logs().some((l) => l.includes('claimed for environment "staging"'))).toBe(true);
    expect(cases()["authorized_action_succeeds"].status).toBe("not_run");
    expect(mockVerifyPermit).not.toHaveBeenCalled();
  });

  it("case 5: the runtime accepts a changed target → case 5 and case 3 unexpected, nothing more is verified", async () => {
    onVerifyCall(1, async () => ({ verified: true, outcome: "allow" }));
    await runExpectingFailure();
    const c = cases();
    expect(c["changed_target_denied"]).toMatchObject({ status: "unexpected", verify_outcome: "allow" });
    expect(c["changed_target_denied"].control_verify_outcome).toBeUndefined();
    expect(c["authorized_action_succeeds"].status).toBe("unexpected");
    expect(c["changed_or_replayed_denied"].status).toBe("not_run");
    expect(mockVerifyPermit).toHaveBeenCalledTimes(1);
  });

  it("case 5: the changed target refused for another reason → case 5 unexpected, case 3 still verifies", async () => {
    onVerifyCall(1, async (_cfg, decision) => {
      throw refusal(decision, "PERMIT_EXPIRED");
    });
    await runExpectingFailure();
    const c = cases();
    expect(c["changed_target_denied"]).toMatchObject({ status: "unexpected", verify_error_code: "PERMIT_EXPIRED" });
    expect(c["authorized_action_succeeds"].status).toBe("expected");
    expect(c["changed_or_replayed_denied"].status).toBe("expected");
  });

  it("case 3's own verify refused → case 3 and case 5 unexpected, case 4 not run", async () => {
    onVerifyCall(2, async (_cfg, decision) => {
      throw refusal(decision, "PAYLOAD_MISMATCH");
    });
    await runExpectingFailure();
    const c = cases();
    expect(c["authorized_action_succeeds"]).toMatchObject({ status: "unexpected", verify_error_code: "PAYLOAD_MISMATCH" });
    expect(c["changed_target_denied"]).toMatchObject({
      status: "unexpected",
      verify_error_code: "PERMIT_BINDING_MISMATCH",
      control_verify_error_code: "PAYLOAD_MISMATCH",
    });
    expect(c["changed_or_replayed_denied"].status).toBe("not_run");
  });

  it("case 4: the runtime accepts a replayed permit → unexpected", async () => {
    onVerifyCall(3, async () => ({ verified: true, outcome: "allow" }));
    await runExpectingFailure();
    expect(cases()["changed_or_replayed_denied"]).toMatchObject({ status: "unexpected", verify_outcome: "allow" });
  });

  it("case 4: refused for a reason other than PERMIT_ALREADY_USED → unexpected", async () => {
    onVerifyCall(3, async (_cfg, decision) => {
      throw refusal(decision, "PERMIT_EXPIRED");
    });
    await runExpectingFailure();
    expect(cases()["changed_or_replayed_denied"]).toMatchObject({ status: "unexpected", verify_error_code: "PERMIT_EXPIRED" });
  });
});

describe("rehearsal mode: invalid inputs fail before any network call", () => {
  it.each(["package.release", "artifact.release", "trust_root.publish", "database.migration.apply"])(
    "non-mandatory action %s",
    async (action) => {
      setInput("action", action);
      await runExpectingFailure();
      expectNoNetworkCall();
      expect(logs().some((l) => l.includes("must be one of") && l.includes("No rehearsal call was made"))).toBe(true);
      expect(readOutputs()["rehearsal-verdict"]).toBe("unexpected");
      expect(readOutputs()["verified"]).toBe("false");
    },
  );

  it("missing action", async () => {
    clearInput("action");
    await runExpectingFailure();
    expectNoNetworkCall();
  });

  it.each(["not-a-uuid", "3f2c9a1e7b4d4c8e9a6f0d1e2b3c4d5e", "3f2c9a1e-7b4d-4c8e-9a6f-0d1e2b3c4d5", `${REQUEST_ID}x`])(
    "bad rehearsal-request-id %s",
    async (value) => {
      setInput("rehearsal-request-id", value);
      await runExpectingFailure();
      expectNoNetworkCall();
      expect(logs().some((l) => l.includes("must be a UUID"))).toBe(true);
      expect(readOutputs()["rehearsal-request-id"]).toBeUndefined();
    },
  );

  it("missing target-id", async () => {
    clearInput("target-id");
    await runExpectingFailure();
    expectNoNetworkCall();
    expect(logs().some((l) => l.includes("`target-id` is required"))).toBe(true);
  });

  it("missing environment (never derived)", async () => {
    clearInput("environment");
    await runExpectingFailure();
    expectNoNetworkCall();
    expect(logs().some((l) => l.includes("`environment` is required"))).toBe(true);
  });

  it.each(["0", "51", "2.5", "ten"])("max-wait-minutes %s", async (value) => {
    setInput("max-wait-minutes", value);
    await runExpectingFailure();
    expectNoNetworkCall();
    expect(logs().some((l) => l.includes("`max-wait-minutes` must be a whole number"))).toBe(true);
  });

  it("missing ATLASENT_API_KEY", async () => {
    delete process.env["ATLASENT_API_KEY"];
    await runExpectingFailure();
    expectNoNetworkCall();
  });
});

describe("rehearsal mode: errors stop the run and fail the step", () => {
  it("first identity mint failure → no evaluate, step fails", async () => {
    mockMint.mockReset();
    mockMint.mockRejectedValue(new WorkloadIdentityError("GitHub OIDC is unavailable. Grant this job `permissions: id-token: write`"));
    await runExpectingFailure();

    expect(mockEvaluate).not.toHaveBeenCalled();
    const c = cases();
    for (const id of REHEARSAL_CASE_IDS) expect(c[id].status).toBe("not_run");
    expect(readOutputs()["rehearsal-verdict"]).toBe("unexpected");
    expect(logs().some((l) => l.includes("workload identity mint failed") && l.includes("id-token: write"))).toBe(true);
  });

  it("a later mint failure (case 5 verify) → remaining cases not run, step fails", async () => {
    const defaultMint = mockMint.getMockImplementation()!;
    // Mint order: case 2 evaluate, the claim, then the third mint is case 5's verify.
    mockMint.mockImplementation(async (...a: unknown[]) => {
      if (mintCount === 2) throw new WorkloadIdentityError("broker rejected this job (HTTP 403)");
      return defaultMint(...a);
    });
    await runExpectingFailure();

    const c = cases();
    expect(c["missing_approval_denied_or_held"].status).toBe("expected");
    for (const id of ["authorized_action_succeeds", "changed_or_replayed_denied", "changed_target_denied"]) {
      expect(c[id].status, id).toBe("not_run");
    }
    expect(logs().some((l) => l.includes("stopped (fail-closed)"))).toBe(true);
  });

  it("a claim identity naming a different actor → never claimed, step fails", async () => {
    const defaultMint = mockMint.getMockImplementation()!;
    mockMint.mockImplementation(async (...a: unknown[]) => {
      if (mintCount === 1) {
        mintCount++;
        return mintedIdentity(mintCount, { actorId: "github-actions:repo:999:workflow:other" });
      }
      return defaultMint(...a);
    });
    await runExpectingFailure();
    expect(logs().some((l) => l.includes("names actor"))).toBe(true);
    expect(rt.claimBodies).toHaveLength(0);
    expect(readOutputs()["rehearsal-verdict"]).toBe("unexpected");
  });

  it("a workload identity with no commit SHA → no evaluate, step fails", async () => {
    mockMint.mockReset();
    mockMint.mockResolvedValue(mintedIdentity(1, { sha: "" }));
    await runExpectingFailure();
    expect(mockEvaluate).not.toHaveBeenCalled();
    expect(logs().some((l) => l.includes("did not carry a commit SHA"))).toBe(true);
  });

  it("an evaluate transport/HTTP failure (EnforceError) → step fails, later cases not run", async () => {
    rt.evalOverrides["missing_approval_denied_or_held"] = () => {
      throw new EnforceError("Infrastructure failure (HTTP 503)", "evaluate");
    };
    await runExpectingFailure();

    const c = cases();
    expect(c["unauthorized_denied"].status).toBe("expected");
    for (const id of REHEARSAL_CASE_IDS.slice(1)) expect(c[id].status).toBe("not_run");
    expect(logs().some((l) => l.includes("Infrastructure failure (HTTP 503)"))).toBe(true);
  });

  it("a verify transport failure is never read as the expected refusal", async () => {
    onVerifyCall(3, async (_cfg, decision) => {
      throw new EnforceError("verify-permit failed (HTTP 409)", "verify-permit", decision);
    });
    await runExpectingFailure();

    expect(cases()["changed_or_replayed_denied"].status).toBe("not_run");
    expect(logs().some((l) => l.includes("verify-permit failed (HTTP 409)"))).toBe(true);
  });

  it("a changed-target transport failure is never read as the binding refusal", async () => {
    onVerifyCall(1, async (_cfg, decision) => {
      throw new EnforceError("verify-permit failed (HTTP 502)", "verify-permit", decision);
    });
    await runExpectingFailure();
    expect(cases()["changed_target_denied"].status).toBe("not_run");
    expect(cases()["authorized_action_succeeds"].status).toBe("not_run");
  });

  it("a local MISSING_BINDING refusal is never read as the expected refusal", async () => {
    onVerifyCall(3, async (_cfg, decision) => {
      throw new EnforceError("verify-permit refused: required binding(s) absent: target_id", "verify-permit", decision, {
        outcome: "invalid",
        verifyErrorCode: "MISSING_BINDING",
      });
    });
    await runExpectingFailure();
    expect(cases()["changed_or_replayed_denied"].status).toBe("not_run");
  });
});
