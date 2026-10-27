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
// replayed credential), denies a missing identity ACTOR_UNVERIFIED, denies
// fewer than one approval INSUFFICIENT_APPROVALS, binds each permit to the
// target it was evaluated for, and consumes a permit on its first successful
// verify. Per-case overrides replace the evaluate answer for one case.

type EvalOverride = (config: EnforceConfig, evaluationId: string) => Decision;

interface FakeRuntime {
  seenAssertions: Set<string>;
  consumed: Set<string>;
  permits: Map<string, { target: string; hash: string }>;
  evalCalls: number;
  verifyCalls: number;
  evalOverrides: Partial<Record<string, EvalOverride>>;
}

let rt: FakeRuntime;
let mintCount: number;
let mintedAssertions: Array<Record<string, unknown>>;

function refusal(decision: Decision, code: string): EnforceError {
  return new EnforceError(
    `Permit verification failed (outcome=deny, code=${code})`,
    "verify-permit",
    decision,
    { outcome: "deny", verifyErrorCode: code },
  );
}

function jtiOf(config: EnforceConfig): string | undefined {
  const j = (config.actorIdentity as Record<string, unknown> | undefined)?.["jti"];
  return typeof j === "string" ? j : undefined;
}

function installFakeRuntime(): void {
  rt = {
    seenAssertions: new Set(),
    consumed: new Set(),
    permits: new Map(),
    evalCalls: 0,
    verifyCalls: 0,
    evalOverrides: {},
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
    const approvals = Number(config.context?.["approvals"] ?? 0);
    if (!(approvals >= 1)) {
      return { decision: "deny", denyCode: "INSUFFICIENT_APPROVALS", evaluationId };
    }
    const permitToken = `pt-secret-${rt.evalCalls}`;
    const executionHashExpected = `eh-${rt.evalCalls}`;
    rt.permits.set(permitToken, { target: config.targetId as string, hash: executionHashExpected });
    return {
      decision: "allow",
      permitToken,
      executionHashExpected,
      proofHash: `proof-secret-${rt.evalCalls}`,
      evaluationId,
    };
  });

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
    expect(c["missing_approval_denied_or_held"]).toMatchObject({ decision: "deny", deny_code: "INSUFFICIENT_APPROVALS", request_id: "ev-2" });
    expect(c["authorized_action_succeeds"]).toMatchObject({ decision: "allow", request_id: "ev-3", verify_outcome: "allow" });
    expect(c["changed_or_replayed_denied"]).toMatchObject({
      decision: null,
      request_id: "ev-3",
      verify_error_code: "PERMIT_ALREADY_USED",
    });
    expect(c["changed_target_denied"]).toMatchObject({
      decision: "allow",
      request_id: "ev-4",
      verify_error_code: "PERMIT_BINDING_MISMATCH",
      control_verify_outcome: "allow",
    });
  });

  it("marks every evaluate with the rehearsal request id and its own case id, applied over everything else", async () => {
    await run();

    const configs = evalConfigs();
    expect(configs).toHaveLength(4);
    expect(configs.map((cfg) => cfg.context?.["rehearsal_case"])).toEqual([
      "unauthorized_denied",
      "missing_approval_denied_or_held",
      "authorized_action_succeeds",
      "changed_target_denied",
    ]);
    for (const cfg of configs) {
      expect(cfg.context?.["rehearsal_request_id"]).toBe(REQUEST_ID);
      expect(cfg.action).toBe("production.deploy");
      expect(cfg.targetId).toBe(TARGET);
      expect(cfg.environment).toBe(ENVIRONMENT);
      // The same broker-derived change_plan on every evaluate, case 1 included.
      expect(cfg.changePlan).toEqual({ operation: "deploy", revision: REVISION });
      expect(cfg.state_snapshot).toEqual({ source: "github-actions", complete: true, run_id: "900" });
      expect(cfg.context).toMatchObject({
        source: "github-action",
        repository: "acme/app",
        sha: REVISION,
        triggering_actor: "github:dispatcher",
        pr_number: 7,
      });
      // Never a caller-supplied raw payload hash for a mandatory action.
      expect(cfg.executionPayloadHash).toBeUndefined();
    }
  });

  it("case 1 presents no actor_identity; every other call presents a freshly minted one", async () => {
    await run();

    const evals = evalConfigs();
    const verifies = verifyConfigs();
    expect(evals[0].actorIdentity).toBeUndefined();
    expect(evals[0].actor).toBe("rehearsal:unverified-actor");

    // 3 evaluates (cases 2, 3, 5) + 4 verifies (case 3, case 4, case 5 x2).
    expect(verifies).toHaveLength(4);
    expect(mockMint).toHaveBeenCalledTimes(7);
    for (const call of mockMint.mock.calls) {
      expect(call[0]).toMatchObject({ actionType: "production.deploy", environment: ENVIRONMENT });
    }

    const presented = [...evals.slice(1), ...verifies].map((cfg) => cfg.actorIdentity);
    // Each one is a minted assertion, and no assertion is presented twice.
    for (const a of presented) expect(mintedAssertions).toContain(a);
    expect(new Set(presented).size).toBe(7);
    for (const cfg of [...evals.slice(1), ...verifies]) expect(cfg.actor).toBe(ACTOR);
  });

  it("case 2 sends approvals 0; cases 1, 3 and 5 send the PR-review-derived approvals", async () => {
    await run();

    const [c1, c2, c3, c5] = evalConfigs();
    expect(c2.context?.["approvals"]).toBe(0);
    expect(c2.context).not.toHaveProperty("approving_reviewers");
    for (const cfg of [c1, c3, c5]) {
      expect(cfg.context?.["approvals"]).toBe(2);
      expect(cfg.context?.["approving_reviewers"]).toEqual(["alice", "bob"]);
    }
    expect(mockResolveApprovals).toHaveBeenCalledTimes(1);
  });

  it("verifies with all bindings; case 5 presents the changed target and then its own", async () => {
    await run();

    const verifies = mockVerifyPermit.mock.calls.map((c) => ({ config: c[0] as EnforceConfig, decision: c[1] as Decision }));
    expect(verifies.map((v) => v.config.targetId)).toEqual([
      TARGET,
      TARGET,
      `${TARGET}--rehearsal-changed`,
      TARGET,
    ]);
    // Case 3 and case 4 present permit 1; case 5's two verifies present permit 2.
    expect(verifies.map((v) => v.decision.permitToken)).toEqual([
      "pt-secret-3",
      "pt-secret-3",
      "pt-secret-4",
      "pt-secret-4",
    ]);
    for (const v of verifies) {
      expect(v.config.environment).toBe(ENVIRONMENT);
      expect(v.config.requiredBindings).toEqual(["environment", "target_id", "payload_hash"]);
      expect(v.decision.executionHashExpected).toMatch(/^eh-/);
    }
  });

  it("never puts a permit token or proof hash in an output, the summary, or a non-mask log line", async () => {
    await run();

    const secrets = ["pt-secret-3", "pt-secret-4", "proof-secret-3", "proof-secret-4"];
    const outputs = fs.readFileSync(outputFile, "utf-8");
    const summary = readSummary();
    expect(summary).toContain("informational");
    expect(summary).toContain(REQUEST_ID);
    for (const s of secrets) {
      expect(outputs).not.toContain(s);
      expect(summary).not.toContain(s);
      expect(logs()).toContain(`::add-mask::${s}`);
      for (const line of logs()) {
        if (line.includes(s)) expect(line).toBe(`::add-mask::${s}`);
      }
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

  it("with approvals-from none, sends no derived approvals (case 2 still sends 0)", async () => {
    setInput("approvals-from", "none");
    rt.evalOverrides["authorized_action_succeeds"] = (cfg, id) => {
      expect(cfg.context).not.toHaveProperty("approvals");
      return { decision: "deny", denyCode: "INSUFFICIENT_APPROVALS", evaluationId: id };
    };
    await runExpectingFailure();

    expect(mockResolveApprovals).not.toHaveBeenCalled();
    expect(evalConfigs()[1].context?.["approvals"]).toBe(0);
    expect(evalConfigs()[0].context).not.toHaveProperty("approvals");
    expect(cases()["authorized_action_succeeds"].status).toBe("unexpected");
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

  it("case 2 allowed with zero approvals → unexpected", async () => {
    rt.evalOverrides["missing_approval_denied_or_held"] = (_cfg, id) => ({
      decision: "allow",
      permitToken: "pt-secret-c2",
      executionHashExpected: "eh-c2",
      evaluationId: id,
    });
    await runExpectingFailure();
    expect(cases()["missing_approval_denied_or_held"].status).toBe("unexpected");
  });

  it("case 2 denied for another reason → unexpected", async () => {
    rt.evalOverrides["missing_approval_denied_or_held"] = (_cfg, id) => ({ decision: "deny", denyCode: "ACTOR_UNVERIFIED", evaluationId: id });
    await runExpectingFailure();
    expect(cases()["missing_approval_denied_or_held"].status).toBe("unexpected");
  });

  it.each(["hold", "escalate"] as const)("case 2 %s is expected and is not waited on", async (decision) => {
    rt.evalOverrides["missing_approval_denied_or_held"] = (_cfg, id) => ({
      decision,
      approvalRequestId: "apr-1",
      evaluationId: id,
    });
    await run();

    expect(exitSpy).not.toHaveBeenCalled();
    expect(cases()["missing_approval_denied_or_held"]).toMatchObject({ status: "expected", decision });
    expect(readOutputs()["rehearsal-verdict"]).toBe("all_expected");
  });

  it("case 3 hold → unexpected, and cases 4 and 5 are not run", async () => {
    rt.evalOverrides["authorized_action_succeeds"] = (_cfg, id) => ({ decision: "hold", approvalRequestId: "apr-3", evaluationId: id });
    await runExpectingFailure();

    const c = cases();
    expect(c["authorized_action_succeeds"]).toMatchObject({ status: "unexpected", decision: "hold" });
    expect(c["changed_or_replayed_denied"].status).toBe("not_run");
    expect(c["changed_target_denied"].status).toBe("not_run");
    expect(mockEvaluate).toHaveBeenCalledTimes(3);
    expect(mockVerifyPermit).not.toHaveBeenCalled();
  });

  it("case 3 denied → cases 4 and 5 not run", async () => {
    rt.evalOverrides["authorized_action_succeeds"] = (_cfg, id) => ({ decision: "deny", denyCode: "INSUFFICIENT_APPROVALS", evaluationId: id });
    await runExpectingFailure();

    const c = cases();
    expect(c["authorized_action_succeeds"].status).toBe("unexpected");
    expect(c["changed_or_replayed_denied"].status).toBe("not_run");
    expect(c["changed_target_denied"].status).toBe("not_run");
    expect(readOutputs()["rehearsal-verdict"]).toBe("unexpected");
  });

  it("case 3 allow without an execution hash → unexpected, never verified", async () => {
    rt.evalOverrides["authorized_action_succeeds"] = (_cfg, id) => ({ decision: "allow", permitToken: "pt-secret-nohash", evaluationId: id });
    await runExpectingFailure();
    expect(cases()["authorized_action_succeeds"].status).toBe("unexpected");
    expect(mockVerifyPermit).not.toHaveBeenCalled();
  });

  it("case 3 verify refused → case 3 unexpected, case 4 not run, case 5 still runs", async () => {
    const defaultVerify = mockVerifyPermit.getMockImplementation()!;
    mockVerifyPermit.mockImplementation(async (cfg: EnforceConfig, decision: Decision) => {
      if (mockVerifyPermit.mock.calls.length === 1) throw refusal(decision, "PAYLOAD_MISMATCH");
      return defaultVerify(cfg, decision);
    });
    await runExpectingFailure();

    const c = cases();
    expect(c["authorized_action_succeeds"]).toMatchObject({ status: "unexpected", verify_error_code: "PAYLOAD_MISMATCH" });
    expect(c["changed_or_replayed_denied"].status).toBe("not_run");
    expect(c["changed_target_denied"].status).toBe("expected");
  });

  it("case 4: the runtime accepts a replayed permit → unexpected", async () => {
    const defaultVerify = mockVerifyPermit.getMockImplementation()!;
    mockVerifyPermit.mockImplementation(async (cfg: EnforceConfig, decision: Decision) => {
      if (mockVerifyPermit.mock.calls.length === 2) return { verified: true, outcome: "allow" };
      return defaultVerify(cfg, decision);
    });
    await runExpectingFailure();
    expect(cases()["changed_or_replayed_denied"]).toMatchObject({ status: "unexpected", verify_outcome: "allow" });
  });

  it("case 4: refused for a reason other than PERMIT_ALREADY_USED → unexpected", async () => {
    const defaultVerify = mockVerifyPermit.getMockImplementation()!;
    mockVerifyPermit.mockImplementation(async (cfg: EnforceConfig, decision: Decision) => {
      if (mockVerifyPermit.mock.calls.length === 2) throw refusal(decision, "PERMIT_EXPIRED");
      return defaultVerify(cfg, decision);
    });
    await runExpectingFailure();
    expect(cases()["changed_or_replayed_denied"]).toMatchObject({ status: "unexpected", verify_error_code: "PERMIT_EXPIRED" });
  });

  it("case 5: the runtime accepts a changed target → unexpected, and no control verify is attempted", async () => {
    const defaultVerify = mockVerifyPermit.getMockImplementation()!;
    mockVerifyPermit.mockImplementation(async (cfg: EnforceConfig, decision: Decision) => {
      if (cfg.targetId === `${TARGET}--rehearsal-changed`) return { verified: true, outcome: "allow" };
      return defaultVerify(cfg, decision);
    });
    await runExpectingFailure();
    expect(cases()["changed_target_denied"]).toMatchObject({ status: "unexpected", verify_outcome: "allow" });
    expect(cases()["changed_target_denied"].control_verify_outcome).toBeUndefined();
    expect(mockVerifyPermit).toHaveBeenCalledTimes(3);
  });

  it("case 5: the own-target control verify is refused → unexpected", async () => {
    const defaultVerify = mockVerifyPermit.getMockImplementation()!;
    mockVerifyPermit.mockImplementation(async (cfg: EnforceConfig, decision: Decision) => {
      if (mockVerifyPermit.mock.calls.length === 4) throw refusal(decision, "PERMIT_EXPIRED");
      return defaultVerify(cfg, decision);
    });
    await runExpectingFailure();
    expect(cases()["changed_target_denied"]).toMatchObject({
      status: "unexpected",
      verify_error_code: "PERMIT_BINDING_MISMATCH",
      control_verify_error_code: "PERMIT_EXPIRED",
    });
  });

  it("case 5: evaluate not allowed → not run, and the step fails", async () => {
    rt.evalOverrides["changed_target_denied"] = (_cfg, id) => ({ decision: "deny", denyCode: "RATE_LIMITED", evaluationId: id });
    await runExpectingFailure();
    expect(cases()["changed_target_denied"]).toMatchObject({ status: "not_run", decision: "deny", deny_code: "RATE_LIMITED" });
    expect(readOutputs()["rehearsal-verdict"]).toBe("unexpected");
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

  it("a later mint failure (case 4 verify) → remaining cases not run, step fails", async () => {
    const defaultMint = mockMint.getMockImplementation()!;
    // Mint order: case 2 evaluate, case 3 evaluate, case 3 verify, then the
    // fourth mint is case 4's verify.
    mockMint.mockImplementation(async (...a: unknown[]) => {
      if (mintCount === 3) throw new WorkloadIdentityError("broker rejected this job (HTTP 403)");
      return defaultMint(...a);
    });
    await runExpectingFailure();

    const c = cases();
    expect(c["authorized_action_succeeds"].status).toBe("expected");
    expect(c["changed_or_replayed_denied"].status).toBe("not_run");
    expect(c["changed_target_denied"].status).toBe("not_run");
    expect(logs().some((l) => l.includes("stopped (fail-closed)"))).toBe(true);
  });

  it("a minted identity naming a different actor → step fails", async () => {
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
    const defaultVerify = mockVerifyPermit.getMockImplementation()!;
    mockVerifyPermit.mockImplementation(async (cfg: EnforceConfig, decision: Decision) => {
      if (mockVerifyPermit.mock.calls.length === 2) {
        throw new EnforceError("verify-permit failed (HTTP 409)", "verify-permit", decision);
      }
      return defaultVerify(cfg, decision);
    });
    await runExpectingFailure();

    expect(cases()["changed_or_replayed_denied"].status).toBe("not_run");
    expect(logs().some((l) => l.includes("verify-permit failed (HTTP 409)"))).toBe(true);
  });

  it("a local MISSING_BINDING refusal is never read as the expected refusal", async () => {
    const defaultVerify = mockVerifyPermit.getMockImplementation()!;
    mockVerifyPermit.mockImplementation(async (cfg: EnforceConfig, decision: Decision) => {
      if (mockVerifyPermit.mock.calls.length === 2) {
        throw new EnforceError("verify-permit refused: required binding(s) absent: target_id", "verify-permit", decision, {
          outcome: "invalid",
          verifyErrorCode: "MISSING_BINDING",
        });
      }
      return defaultVerify(cfg, decision);
    });
    await runExpectingFailure();
    expect(cases()["changed_or_replayed_denied"].status).toBe("not_run");
  });
});
