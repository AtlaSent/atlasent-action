/**
 * notifications.test.ts
 *
 * Unit tests for the notification helpers in src/index.ts:
 *   - buildGateDenyComment (pure function, tested via run() side effects and
 *     by inspecting the PR comment body posted through fetch)
 *   - notifySlack (best-effort fetch wrapper)
 *   - postPRComment (best-effort fetch wrapper)
 *   - Batch-deny integration path in run() (v2.1 evaluations input)
 *
 * Because the helpers are not exported we exercise them through the run()
 * integration surface, matching the approach used in index.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";

// ── Module mocks (must be hoisted before imports) ──────────────────────────

vi.mock("../evidenceClient", () => ({ emitEvidenceEvent: vi.fn(async () => {}) }));

vi.mock("@atlasent/enforce", async (importOriginal) => {
  const original = await importOriginal<typeof import("@atlasent/enforce")>();
  return { ...original, enforce: vi.fn() };
});

// Mock runV21 so batch-path tests don't hit real HTTP
vi.mock("../v21", () => ({ runV21: vi.fn() }));

vi.mock("../workloadIdentity", async (importOriginal) => {
  const original = await importOriginal<typeof import("../workloadIdentity")>();
  return { ...original, mintGithubActionsActorIdentity: vi.fn() };
});

import { enforce, EnforceError } from "@atlasent/enforce";
import type { Decision } from "@atlasent/enforce";
import { runV21 } from "../v21";
import { mintGithubActionsActorIdentity } from "../workloadIdentity";
import { run } from "../index";

const mockEnforce = enforce as unknown as ReturnType<typeof vi.fn>;
const mockRunV21 = runV21 as unknown as ReturnType<typeof vi.fn>;
const mockMintWorkloadIdentity = mintGithubActionsActorIdentity as unknown as ReturnType<
  typeof vi.fn
>;

// ── ProcessExit sentinel ────────────────────────────────────────────────────

class ProcessExitError extends Error {
  constructor(public readonly code: number | string | null | undefined) {
    super(`process.exit(${code})`);
    this.name = "ProcessExitError";
  }
}

// ── Test scaffolding ────────────────────────────────────────────────────────

let outputFile: string;
let fetchMock: ReturnType<typeof vi.fn>;
let exitSpy: ReturnType<typeof vi.spyOn>;
let consoleSpy: ReturnType<typeof vi.spyOn>;
let savedEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  outputFile = path.join(
    os.tmpdir(),
    `gha-output-${Date.now()}-${Math.random()}.txt`,
  );
  savedEnv = { ...process.env };

  // Clear all GH-Actions-related env vars.
  for (const key of Object.keys(process.env)) {
    if (
      key.startsWith("INPUT_") ||
      key === "GITHUB_OUTPUT" ||
      key.startsWith("GITHUB_") ||
      key === "ATLASENT_API_KEY" ||
      key === "ATLASENT_BASE_URL"
    ) {
      delete process.env[key];
    }
  }

  process.env["GITHUB_OUTPUT"] = outputFile;

  exitSpy = vi.spyOn(process, "exit").mockImplementation(
    (code?: number | string | null) => {
      throw new ProcessExitError(code);
    },
  ) as unknown as ReturnType<typeof vi.spyOn>;

  consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {}) as unknown as ReturnType<typeof vi.spyOn>;

  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  mockEnforce.mockReset();
  mockRunV21.mockReset();
  mockMintWorkloadIdentity.mockReset();
  mockMintWorkloadIdentity.mockResolvedValue({
    actorId: "github-actions:repo:123:workflow:deploy",
    assertion: { version: "actor_identity.v1", signature: "runtime-signed" },
    source: {
      issuer: "https://token.actions.githubusercontent.com",
      repository: "myorg/myrepo",
      repository_id: "123",
      ref: "refs/heads/main",
      sha: "abc123",
      workflow_ref: "myorg/myrepo/.github/workflows/deploy.yml@refs/heads/main",
      actor: "tester",
      actor_id: "42",
      run_id: "100",
      run_attempt: "1",
      environment: "production",
    },
  });
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) delete process.env[key];
  }
  Object.assign(process.env, savedEnv);

  try {
    fs.unlinkSync(outputFile);
  } catch {
    /* ignore */
  }

  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── Convenience helpers ─────────────────────────────────────────────────────

function setInput(name: string, value: string) {
  process.env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`] = value;
}

function setApiKey(value = "ask_test_key") {
  process.env["ATLASENT_API_KEY"] = value;
}

function getConsoleLogs(): string[] {
  return (consoleSpy as unknown as { mock: { calls: Array<Array<unknown>> } }).mock.calls.map(
    (c) => String(c[0]),
  );
}

function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    decision: "deny",
    evaluationId: "ev-test-1",
    permitToken: "pt-test",
    proofHash: "ph-test",
    riskScore: 10,
    denyReason: "policy violation",
    ...overrides,
  };
}

/** Returns a 200-OK Response that satisfies Slack / GitHub API call expectations. */
function okResp(body = "ok") {
  return new Response(body, { status: 200 });
}

/** Returns a non-200 Response for error-swallowing tests. */
function errResp(status = 500, body = "internal error") {
  return new Response(body, { status });
}

// ── Set up a GitHub context that includes a PR ref ──────────────────────────

function setupGitHubPrContext({
  token = "gh-token-123",
  repo = "myorg/myrepo",
  sha = "abc123",
  runId = "9000",
  prNumber = "42",
}: {
  token?: string;
  repo?: string;
  sha?: string;
  runId?: string;
  prNumber?: string;
} = {}) {
  process.env["GITHUB_TOKEN"] = token;
  process.env["GITHUB_REPOSITORY"] = repo;
  process.env["GITHUB_SHA"] = sha;
  process.env["GITHUB_RUN_ID"] = runId;
  process.env["GITHUB_SERVER_URL"] = "https://github.com";
  process.env["GITHUB_REF"] = `refs/pull/${prNumber}/merge`;
}

// ── Batch-path helper ───────────────────────────────────────────────────────

function makeV21Result(overrides: Record<string, unknown> = {}) {
  return {
    batchId: "batch-xyz",
    failed: true,
    decisions: [
      { id: "ev-1", decision: "deny", reasons: ["policy"], verified: false, verifyOutcome: "" },
    ],
    ...overrides,
  };
}

// =============================================================================
// 1. buildGateDenyComment — exercised via PR comment body captured in fetch
// =============================================================================

describe("buildGateDenyComment", () => {
  // We drive buildGateDenyComment indirectly through the single-eval deny path,
  // capturing the body sent to the GitHub Issues API via fetch.

  async function runDenyAndGetCommentBody(opts: {
    decision?: string;
    denyReason?: string;
    holdReason?: string;
    evaluationId?: string;
    auditHash?: string;
    prNumber?: string;
  } = {}): Promise<string> {
    const {
      decision = "deny",
      denyReason = "test reason",
      holdReason,
      evaluationId = "ev-abc",
      auditHash,
      prNumber = "42",
    } = opts;

    setApiKey();
    setInput("action", "production.deploy");
    setInput("slack-webhook", ""); // no Slack for these tests
    setupGitHubPrContext({ prNumber });

    const decisionObj = makeDecision({
      decision: decision as Decision["decision"],
      denyReason,
      holdReason,
      evaluationId,
      auditHash,
    });

    mockEnforce.mockRejectedValueOnce(
      new EnforceError("blocked", "verify", decisionObj),
    );

    // fetch is called for: commit status (postCommitStatus) then PR comment
    fetchMock
      .mockResolvedValueOnce(okResp()) // commit status
      .mockResolvedValueOnce(okResp()); // PR comment

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    // Find the PR comment call: it targets /issues/{n}/comments
    const prCommentCall = fetchMock.mock.calls.find(
      ([url]) => url.includes("/issues/") && url.includes("/comments"),
    );
    expect(prCommentCall).toBeDefined();

    const body = JSON.parse((prCommentCall![1] as RequestInit).body as string);
    return body.body as string;
  }

  it("uses 🔴 icon and DENIED label for deny decision", async () => {
    const comment = await runDenyAndGetCommentBody({ decision: "deny" });
    expect(comment).toContain("🔴");
    expect(comment).toContain("DENIED");
  });

  it("uses 🟡 icon and ON HOLD label for hold decision", async () => {
    const comment = await runDenyAndGetCommentBody({
      decision: "hold",
      holdReason: "waiting for approval",
    });
    expect(comment).toContain("🟡");
    expect(comment).toContain("ON HOLD");
  });

  it("uses 🚨 icon and ESCALATED label for escalate decision", async () => {
    const comment = await runDenyAndGetCommentBody({ decision: "escalate" });
    expect(comment).toContain("🚨");
    expect(comment).toContain("ESCALATED");
  });

  it("includes evaluationId when present", async () => {
    const comment = await runDenyAndGetCommentBody({ evaluationId: "ev-unique-99" });
    expect(comment).toContain("ev-unique-99");
  });

  it("omits Evaluation ID line when evaluationId is absent", async () => {
    // We need to trigger the path without evaluationId — make a deny decision
    // with no evaluationId set
    setApiKey();
    setInput("action", "production.deploy");
    setInput("slack-webhook", "");
    setupGitHubPrContext({ prNumber: "10" });

    const decisionObj: Decision = {
      decision: "deny",
      denyReason: "no eval id",
    } as Decision;

    mockEnforce.mockRejectedValueOnce(
      new EnforceError("blocked", "verify", decisionObj),
    );

    fetchMock
      .mockResolvedValueOnce(okResp())
      .mockResolvedValueOnce(okResp());

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    const prCommentCall = fetchMock.mock.calls.find(
      ([url]) => url.includes("/issues/") && url.includes("/comments"),
    );
    const body = JSON.parse((prCommentCall![1] as RequestInit).body as string);
    expect(body.body).not.toContain("Evaluation ID");
  });

  it("includes truncated auditHash when present", async () => {
    const comment = await runDenyAndGetCommentBody({
      auditHash: "abcdef1234567890abcdef1234567890",
    });
    // auditHash is sliced to 24 chars + '…'
    expect(comment).toContain("abcdef1234567890abcdef12");
    expect(comment).toContain("…");
  });

  it("omits Audit hash line when auditHash is absent", async () => {
    const comment = await runDenyAndGetCommentBody({ auditHash: undefined });
    expect(comment).not.toContain("Audit hash");
  });

  it("adds console approval link for hold decision", async () => {
    const comment = await runDenyAndGetCommentBody({
      decision: "hold",
      holdReason: "pending",
    });
    expect(comment).toContain("console.atlasent.io/approvals");
    expect(comment).toContain("Next step");
  });

  it("adds console approval link for escalate decision", async () => {
    const comment = await runDenyAndGetCommentBody({ decision: "escalate" });
    expect(comment).toContain("console.atlasent.io/approvals");
  });

  it("links approvals to the configured console (staging gate), not production", async () => {
    setInput("console-base-url", "https://staging.atlasent.io/");
    const comment = await runDenyAndGetCommentBody({ decision: "escalate" });
    expect(comment).toContain("(https://staging.atlasent.io/approvals)");
    expect(comment).not.toContain("console.atlasent.io");
  });

  it("does NOT add console approval link for deny decision", async () => {
    const comment = await runDenyAndGetCommentBody({ decision: "deny" });
    expect(comment).not.toContain("console.atlasent.io/approvals");
  });

  it("includes the workflow run URL", async () => {
    const comment = await runDenyAndGetCommentBody({ decision: "deny" });
    expect(comment).toContain("actions/runs/9000");
    expect(comment).toContain("View workflow run");
  });
});

// =============================================================================
// 2. notifySlack — best-effort fetch wrapper
// =============================================================================

describe("notifySlack", () => {
  async function runWithSlack(opts: {
    decision?: string;
    denyReason?: string;
    holdReason?: string;
    evaluationId?: string;
    auditHash?: string;
    webhookUrl?: string;
  } = {}): Promise<{ calls: Array<[string, RequestInit]> }> {
    const {
      decision = "deny",
      denyReason = "policy breach",
      holdReason,
      evaluationId = "ev-1",
      auditHash,
      webhookUrl = "https://hooks.slack.com/test-webhook",
    } = opts;

    setApiKey();
    setInput("action", "production.deploy");
    setInput("slack-webhook", webhookUrl);
    // No PR context so postPRComment is skipped
    process.env["GITHUB_REPOSITORY"] = "myorg/myrepo";
    process.env["GITHUB_RUN_ID"] = "1234";
    process.env["GITHUB_SERVER_URL"] = "https://github.com";
    // No GITHUB_REF with PR pattern so pr_number is undefined

    const decisionObj = makeDecision({
      decision: decision as Decision["decision"],
      denyReason,
      holdReason,
      evaluationId,
      auditHash,
    });

    mockEnforce.mockRejectedValueOnce(
      new EnforceError("blocked", "verify", decisionObj),
    );

    // commit status call + slack call
    fetchMock.mockResolvedValue(okResp());

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    const slackCalls = fetchMock.mock.calls.filter(
      ([url]) => url === webhookUrl,
    ) as Array<[string, RequestInit]>;

    return { calls: slackCalls };
  }

  it("posts to the webhook URL", async () => {
    const { calls } = await runWithSlack({ webhookUrl: "https://hooks.slack.com/test-webhook" });
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("https://hooks.slack.com/test-webhook");
  });

  it("sends POST with application/json content type", async () => {
    const { calls } = await runWithSlack();
    const init = calls[0][1];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("uses :no_entry: emoji and DENIED label for deny", async () => {
    const { calls } = await runWithSlack({ decision: "deny" });
    const payload = JSON.parse(calls[0][1].body as string);
    expect(payload.text).toContain(":no_entry:");
    expect(payload.text).toContain("DENIED");
    const header = payload.blocks.find((b: { type: string }) => b.type === "header");
    expect(header.text.text).toContain(":no_entry:");
    expect(header.text.text).toContain("DENIED");
  });

  it("uses :hourglass_flowing_sand: emoji and ON HOLD label for hold", async () => {
    const { calls } = await runWithSlack({ decision: "hold", holdReason: "waiting" });
    const payload = JSON.parse(calls[0][1].body as string);
    expect(payload.text).toContain(":hourglass_flowing_sand:");
    expect(payload.text).toContain("ON HOLD");
  });

  it("uses :rotating_light: emoji and ESCALATED label for escalate", async () => {
    const { calls } = await runWithSlack({ decision: "escalate" });
    const payload = JSON.parse(calls[0][1].body as string);
    expect(payload.text).toContain(":rotating_light:");
    expect(payload.text).toContain("ESCALATED");
  });

  it("includes evaluationId field in Slack blocks when present", async () => {
    const { calls } = await runWithSlack({ evaluationId: "ev-unique-42" });
    const payload = JSON.parse(calls[0][1].body as string);
    const sectionWithFields = payload.blocks.find(
      (b: { type: string; fields?: Array<{ text: string }> }) =>
        b.type === "section" && b.fields,
    );
    const evalField = sectionWithFields?.fields?.find((f: { text: string }) =>
      f.text.includes("ev-unique-42"),
    );
    expect(evalField).toBeDefined();
  });

  it("omits evaluationId field when absent", async () => {
    // Use a decision without an evaluationId
    setApiKey();
    setInput("action", "production.deploy");
    setInput("slack-webhook", "https://hooks.slack.com/test-webhook");
    process.env["GITHUB_REPOSITORY"] = "myorg/myrepo";
    process.env["GITHUB_RUN_ID"] = "1234";
    process.env["GITHUB_SERVER_URL"] = "https://github.com";

    const decisionObj: Decision = { decision: "deny", denyReason: "no eval id" } as Decision;
    mockEnforce.mockRejectedValueOnce(
      new EnforceError("blocked", "verify", decisionObj),
    );
    fetchMock.mockResolvedValue(okResp());

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    const slackCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "https://hooks.slack.com/test-webhook",
    );
    expect(slackCalls).toHaveLength(1);
    const payload = JSON.parse(slackCalls[0][1].body as string);
    const sectionWithFields = payload.blocks.find(
      (b: { type: string; fields?: Array<{ text: string }> }) =>
        b.type === "section" && b.fields,
    );
    const evalIdField = sectionWithFields?.fields?.find((f: { text: string }) =>
      f.text.includes("Evaluation ID"),
    );
    expect(evalIdField).toBeUndefined();
  });

  it("includes truncated auditHash field when present", async () => {
    const { calls } = await runWithSlack({
      auditHash: "deadbeef12345678deadbeef12345678",
    });
    const payload = JSON.parse(calls[0][1].body as string);
    const sectionWithFields = payload.blocks.find(
      (b: { type: string; fields?: Array<{ text: string }> }) =>
        b.type === "section" && b.fields,
    );
    const hashField = sectionWithFields?.fields?.find((f: { text: string }) =>
      f.text.includes("Audit hash"),
    );
    expect(hashField).toBeDefined();
    expect(hashField.text).toContain("deadbeef");
    expect(hashField.text).toContain("…");
  });

  it("omits auditHash field when absent", async () => {
    const { calls } = await runWithSlack({ auditHash: undefined });
    const payload = JSON.parse(calls[0][1].body as string);
    const sectionWithFields = payload.blocks.find(
      (b: { type: string; fields?: Array<{ text: string }> }) =>
        b.type === "section" && b.fields,
    );
    const hashField = sectionWithFields?.fields?.find((f: { text: string }) =>
      f.text.includes("Audit hash"),
    );
    expect(hashField).toBeUndefined();
  });

  it("includes a 'View Run' button with the run URL", async () => {
    const { calls } = await runWithSlack();
    const payload = JSON.parse(calls[0][1].body as string);
    const actionsBlock = payload.blocks.find(
      (b: { type: string }) => b.type === "actions",
    );
    expect(actionsBlock).toBeDefined();
    const button = actionsBlock.elements[0];
    expect(button.type).toBe("button");
    expect(button.url).toContain("actions/runs/1234");
  });

  it("swallows Slack non-200 response and emits a warning (does not throw)", async () => {
    setApiKey();
    setInput("action", "production.deploy");
    setInput("slack-webhook", "https://hooks.slack.com/failing-webhook");
    // Set GITHUB_TOKEN so postCommitStatus fires before the Slack call
    process.env["GITHUB_TOKEN"] = "tok";
    process.env["GITHUB_REPOSITORY"] = "myorg/myrepo";
    process.env["GITHUB_SHA"] = "abc123";
    process.env["GITHUB_RUN_ID"] = "1234";
    process.env["GITHUB_SERVER_URL"] = "https://github.com";

    const decisionObj = makeDecision({ decision: "deny" });
    mockEnforce.mockRejectedValueOnce(
      new EnforceError("blocked", "verify", decisionObj),
    );

    // commit status → OK, Slack → 500
    fetchMock
      .mockResolvedValueOnce(okResp()) // commit status
      .mockResolvedValueOnce(errResp(500, "server error")); // Slack

    // Must not throw a network error — run() itself will throw ProcessExitError
    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    const warningLogs = getConsoleLogs().filter((l) => l.includes("::warning::"));
    expect(warningLogs.some((l) => l.toLowerCase().includes("slack"))).toBe(true);
  });

  it("swallows Slack network errors (does not throw)", async () => {
    setApiKey();
    setInput("action", "production.deploy");
    setInput("slack-webhook", "https://hooks.slack.com/network-error-webhook");
    // Set GITHUB_TOKEN so postCommitStatus fires before the Slack call
    process.env["GITHUB_TOKEN"] = "tok";
    process.env["GITHUB_REPOSITORY"] = "myorg/myrepo";
    process.env["GITHUB_SHA"] = "abc123";
    process.env["GITHUB_RUN_ID"] = "1234";
    process.env["GITHUB_SERVER_URL"] = "https://github.com";

    const decisionObj = makeDecision({ decision: "deny" });
    mockEnforce.mockRejectedValueOnce(
      new EnforceError("blocked", "verify", decisionObj),
    );

    fetchMock
      .mockResolvedValueOnce(okResp()) // commit status
      .mockRejectedValueOnce(new Error("ECONNREFUSED")); // Slack network error

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    const warningLogs = getConsoleLogs().filter((l) => l.includes("::warning::"));
    expect(warningLogs.some((l) => l.toLowerCase().includes("slack"))).toBe(true);
  });

  it("does NOT call Slack when slack-webhook input is empty", async () => {
    setApiKey();
    setInput("action", "production.deploy");
    setInput("slack-webhook", ""); // explicitly empty
    process.env["GITHUB_REPOSITORY"] = "myorg/myrepo";
    process.env["GITHUB_RUN_ID"] = "1234";
    process.env["GITHUB_SERVER_URL"] = "https://github.com";

    const decisionObj = makeDecision({ decision: "deny" });
    mockEnforce.mockRejectedValueOnce(
      new EnforceError("blocked", "verify", decisionObj),
    );

    fetchMock.mockResolvedValue(okResp());

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    // Only the commit status call should have gone out — no Slack
    // (commit status URL contains /statuses/, Slack URL would be the webhook)
    const allUrls = fetchMock.mock.calls.map(([url]) => url);
    expect(allUrls.every((u) => u.includes("statuses"))).toBe(true);
  });
});

// =============================================================================
// 2b. notifyTeams — best-effort fetch wrapper (mirrors notifySlack above)
// =============================================================================

describe("notifyTeams", () => {
  async function runWithTeams(opts: {
    decision?: string;
    denyReason?: string;
    holdReason?: string;
    evaluationId?: string;
    auditHash?: string;
    webhookUrl?: string;
  } = {}): Promise<{ calls: Array<[string, RequestInit]> }> {
    const {
      decision = "deny",
      denyReason = "policy breach",
      holdReason,
      evaluationId = "ev-1",
      auditHash,
      webhookUrl = "https://outlook.office.com/webhook/test-webhook",
    } = opts;

    setApiKey();
    setInput("action", "production.deploy");
    setInput("teams-webhook", webhookUrl);
    // No PR context so postPRComment is skipped
    process.env["GITHUB_REPOSITORY"] = "myorg/myrepo";
    process.env["GITHUB_RUN_ID"] = "1234";
    process.env["GITHUB_SERVER_URL"] = "https://github.com";
    // No GITHUB_REF with PR pattern so pr_number is undefined

    const decisionObj = makeDecision({
      decision: decision as Decision["decision"],
      denyReason,
      holdReason,
      evaluationId,
      auditHash,
    });

    mockEnforce.mockRejectedValueOnce(
      new EnforceError("blocked", "verify", decisionObj),
    );

    // commit status call + teams call
    fetchMock.mockResolvedValue(okResp());

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    const teamsCalls = fetchMock.mock.calls.filter(
      ([url]) => url === webhookUrl,
    ) as Array<[string, RequestInit]>;

    return { calls: teamsCalls };
  }

  it("posts to the webhook URL", async () => {
    const { calls } = await runWithTeams({
      webhookUrl: "https://outlook.office.com/webhook/test-webhook",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("https://outlook.office.com/webhook/test-webhook");
  });

  it("sends POST with application/json content type", async () => {
    const { calls } = await runWithTeams();
    const init = calls[0][1];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("sends a MessageCard payload with red theme and DENIED label for deny", async () => {
    const { calls } = await runWithTeams({ decision: "deny" });
    const payload = JSON.parse(calls[0][1].body as string);
    expect(payload["@type"]).toBe("MessageCard");
    expect(payload.themeColor).toBe("D9534F");
    expect(payload.summary).toContain("DENIED");
    expect(payload.sections[0].activityTitle).toContain("DENIED");
  });

  it("uses amber theme and ON HOLD label for hold", async () => {
    const { calls } = await runWithTeams({ decision: "hold", holdReason: "waiting" });
    const payload = JSON.parse(calls[0][1].body as string);
    expect(payload.themeColor).toBe("F0AD4E");
    expect(payload.summary).toContain("ON HOLD");
  });

  it("uses red theme and ESCALATED label for escalate", async () => {
    const { calls } = await runWithTeams({ decision: "escalate" });
    const payload = JSON.parse(calls[0][1].body as string);
    expect(payload.summary).toContain("ESCALATED");
    expect(payload.sections[0].activityTitle).toContain("ESCALATED");
  });

  it("includes evaluationId fact when present", async () => {
    const { calls } = await runWithTeams({ evaluationId: "ev-unique-42" });
    const payload = JSON.parse(calls[0][1].body as string);
    const facts = payload.sections[0].facts as Array<{ name: string; value: string }>;
    const evalFact = facts.find((f) => f.value.includes("ev-unique-42"));
    expect(evalFact).toBeDefined();
    expect(evalFact?.name).toBe("Evaluation ID");
  });

  it("omits evaluationId fact when absent", async () => {
    setApiKey();
    setInput("action", "production.deploy");
    setInput("teams-webhook", "https://outlook.office.com/webhook/test-webhook");
    process.env["GITHUB_REPOSITORY"] = "myorg/myrepo";
    process.env["GITHUB_RUN_ID"] = "1234";
    process.env["GITHUB_SERVER_URL"] = "https://github.com";

    const decisionObj: Decision = { decision: "deny", denyReason: "no eval id" } as Decision;
    mockEnforce.mockRejectedValueOnce(
      new EnforceError("blocked", "verify", decisionObj),
    );
    fetchMock.mockResolvedValue(okResp());

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    const teamsCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "https://outlook.office.com/webhook/test-webhook",
    );
    expect(teamsCalls).toHaveLength(1);
    const payload = JSON.parse(teamsCalls[0][1].body as string);
    const facts = payload.sections[0].facts as Array<{ name: string; value: string }>;
    expect(facts.find((f) => f.name === "Evaluation ID")).toBeUndefined();
  });

  it("includes truncated auditHash fact when present", async () => {
    const { calls } = await runWithTeams({
      auditHash: "deadbeef12345678deadbeef12345678",
    });
    const payload = JSON.parse(calls[0][1].body as string);
    const facts = payload.sections[0].facts as Array<{ name: string; value: string }>;
    const hashFact = facts.find((f) => f.name === "Audit hash");
    expect(hashFact).toBeDefined();
    expect(hashFact?.value).toContain("deadbeef");
    expect(hashFact?.value).toContain("…");
  });

  it("omits auditHash fact when absent", async () => {
    const { calls } = await runWithTeams({ auditHash: undefined });
    const payload = JSON.parse(calls[0][1].body as string);
    const facts = payload.sections[0].facts as Array<{ name: string; value: string }>;
    expect(facts.find((f) => f.name === "Audit hash")).toBeUndefined();
  });

  it("includes a 'View Run' OpenUri action with the run URL", async () => {
    const { calls } = await runWithTeams();
    const payload = JSON.parse(calls[0][1].body as string);
    const action = payload.potentialAction[0];
    expect(action["@type"]).toBe("OpenUri");
    expect(action.name).toBe("View Run");
    expect(action.targets[0].uri).toContain("actions/runs/1234");
  });

  it("swallows Teams non-200 response and emits a warning (does not throw)", async () => {
    setApiKey();
    setInput("action", "production.deploy");
    setInput("teams-webhook", "https://outlook.office.com/webhook/failing-webhook");
    process.env["GITHUB_TOKEN"] = "tok";
    process.env["GITHUB_REPOSITORY"] = "myorg/myrepo";
    process.env["GITHUB_SHA"] = "abc123";
    process.env["GITHUB_RUN_ID"] = "1234";
    process.env["GITHUB_SERVER_URL"] = "https://github.com";

    const decisionObj = makeDecision({ decision: "deny" });
    mockEnforce.mockRejectedValueOnce(
      new EnforceError("blocked", "verify", decisionObj),
    );

    // commit status → OK, Teams → 500
    fetchMock
      .mockResolvedValueOnce(okResp()) // commit status
      .mockResolvedValueOnce(errResp(500, "server error")); // Teams

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    const warningLogs = getConsoleLogs().filter((l) => l.includes("::warning::"));
    expect(warningLogs.some((l) => l.toLowerCase().includes("teams"))).toBe(true);
  });

  it("swallows Teams network errors (does not throw)", async () => {
    setApiKey();
    setInput("action", "production.deploy");
    setInput("teams-webhook", "https://outlook.office.com/webhook/network-error-webhook");
    process.env["GITHUB_TOKEN"] = "tok";
    process.env["GITHUB_REPOSITORY"] = "myorg/myrepo";
    process.env["GITHUB_SHA"] = "abc123";
    process.env["GITHUB_RUN_ID"] = "1234";
    process.env["GITHUB_SERVER_URL"] = "https://github.com";

    const decisionObj = makeDecision({ decision: "deny" });
    mockEnforce.mockRejectedValueOnce(
      new EnforceError("blocked", "verify", decisionObj),
    );

    fetchMock
      .mockResolvedValueOnce(okResp()) // commit status
      .mockRejectedValueOnce(new Error("ECONNREFUSED")); // Teams network error

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    const warningLogs = getConsoleLogs().filter((l) => l.includes("::warning::"));
    expect(warningLogs.some((l) => l.toLowerCase().includes("teams"))).toBe(true);
  });

  it("does NOT call Teams when teams-webhook input is empty", async () => {
    setApiKey();
    setInput("action", "production.deploy");
    setInput("teams-webhook", ""); // explicitly empty
    process.env["GITHUB_REPOSITORY"] = "myorg/myrepo";
    process.env["GITHUB_RUN_ID"] = "1234";
    process.env["GITHUB_SERVER_URL"] = "https://github.com";

    const decisionObj = makeDecision({ decision: "deny" });
    mockEnforce.mockRejectedValueOnce(
      new EnforceError("blocked", "verify", decisionObj),
    );

    fetchMock.mockResolvedValue(okResp());

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    // Only the commit status call should have gone out — no Teams
    const allUrls = fetchMock.mock.calls.map(([url]) => url);
    expect(allUrls.every((u) => u.includes("statuses"))).toBe(true);
  });

  it("fires both Slack and Teams independently when both webhooks are set", async () => {
    setApiKey();
    setInput("action", "production.deploy");
    setInput("slack-webhook", "https://hooks.slack.com/both-test");
    setInput("teams-webhook", "https://outlook.office.com/webhook/both-test");
    process.env["GITHUB_REPOSITORY"] = "myorg/myrepo";
    process.env["GITHUB_RUN_ID"] = "1234";
    process.env["GITHUB_SERVER_URL"] = "https://github.com";

    const decisionObj = makeDecision({ decision: "deny" });
    mockEnforce.mockRejectedValueOnce(
      new EnforceError("blocked", "verify", decisionObj),
    );

    fetchMock.mockResolvedValue(okResp());

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    const slackCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "https://hooks.slack.com/both-test",
    );
    const teamsCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "https://outlook.office.com/webhook/both-test",
    );
    expect(slackCalls).toHaveLength(1);
    expect(teamsCalls).toHaveLength(1);
  });
});

// =============================================================================
// 3. postPRComment — best-effort fetch wrapper
// =============================================================================

describe("postPRComment", () => {
  async function runDenyWithPR(opts: {
    prNumber?: string;
    token?: string;
    repo?: string;
    apiBase?: string;
  } = {}) {
    const {
      prNumber = "55",
      token = "gh-tok-abc",
      repo = "acme/widget",
      apiBase,
    } = opts;

    setApiKey();
    setInput("action", "production.deploy");
    setInput("slack-webhook", ""); // isolate PR comment path
    setupGitHubPrContext({ prNumber, token, repo });
    if (apiBase) {
      process.env["GITHUB_API_URL"] = apiBase;
    }

    const decisionObj = makeDecision({ decision: "deny", denyReason: "test" });
    mockEnforce.mockRejectedValueOnce(
      new EnforceError("blocked", "verify", decisionObj),
    );

    // commit status + PR comment
    fetchMock.mockResolvedValue(okResp());

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);
  }

  function getPrCommentCall() {
    return fetchMock.mock.calls.find(
      ([url]) => url.includes("/issues/") && url.includes("/comments"),
    ) as [string, RequestInit] | undefined;
  }

  it("posts to the correct GitHub Issues API URL", async () => {
    await runDenyWithPR({ prNumber: "55", repo: "acme/widget" });
    const call = getPrCommentCall();
    expect(call).toBeDefined();
    expect(call![0]).toMatch(/\/repos\/acme\/widget\/issues\/55\/comments$/);
  });

  it("uses a custom GITHUB_API_URL when set", async () => {
    await runDenyWithPR({
      prNumber: "7",
      repo: "acme/widget",
      apiBase: "https://github.example.com/api/v3",
    });
    const call = getPrCommentCall();
    expect(call![0]).toMatch(
      /^https:\/\/github\.example\.com\/api\/v3\/repos\/acme\/widget\/issues\/7\/comments/,
    );
  });

  it("sends Authorization: Bearer <GITHUB_TOKEN>", async () => {
    await runDenyWithPR({ token: "secret-gh-token" });
    const call = getPrCommentCall();
    const headers = call![1].headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer secret-gh-token");
  });

  it("sends the correct Accept and API-Version headers", async () => {
    await runDenyWithPR();
    const call = getPrCommentCall();
    const headers = call![1].headers as Record<string, string>;
    expect(headers["Accept"]).toBe("application/vnd.github+json");
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });

  it("skips PR comment when GITHUB_TOKEN is absent", async () => {
    setApiKey();
    setInput("action", "production.deploy");
    setInput("slack-webhook", "");
    // Set up a PR ref but NO token
    process.env["GITHUB_REPOSITORY"] = "acme/widget";
    process.env["GITHUB_RUN_ID"] = "1234";
    process.env["GITHUB_SERVER_URL"] = "https://github.com";
    process.env["GITHUB_REF"] = "refs/pull/5/merge";
    // GITHUB_TOKEN intentionally not set

    const decisionObj = makeDecision({ decision: "deny" });
    mockEnforce.mockRejectedValueOnce(
      new EnforceError("blocked", "verify", decisionObj),
    );

    fetchMock.mockResolvedValue(okResp());

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    const prCommentCall = getPrCommentCall();
    // Without a token the helper returns early — no PR comment fetch
    expect(prCommentCall).toBeUndefined();
  });

  it("skips PR comment when there is no PR number (non-PR ref)", async () => {
    setApiKey();
    setInput("action", "production.deploy");
    setInput("slack-webhook", "");
    process.env["GITHUB_TOKEN"] = "tok";
    process.env["GITHUB_REPOSITORY"] = "acme/widget";
    process.env["GITHUB_RUN_ID"] = "1234";
    process.env["GITHUB_SERVER_URL"] = "https://github.com";
    process.env["GITHUB_REF"] = "refs/heads/main"; // not a PR ref

    const decisionObj = makeDecision({ decision: "deny" });
    mockEnforce.mockRejectedValueOnce(
      new EnforceError("blocked", "verify", decisionObj),
    );

    fetchMock.mockResolvedValue(okResp());

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    const prCommentCall = getPrCommentCall();
    expect(prCommentCall).toBeUndefined();
  });

  it("swallows non-200 response and emits a warning (does not throw)", async () => {
    setApiKey();
    setInput("action", "production.deploy");
    setInput("slack-webhook", "");
    setupGitHubPrContext({ prNumber: "3" });

    const decisionObj = makeDecision({ decision: "deny" });
    mockEnforce.mockRejectedValueOnce(
      new EnforceError("blocked", "verify", decisionObj),
    );

    // commit status OK, PR comment returns 422
    fetchMock
      .mockResolvedValueOnce(okResp())
      .mockResolvedValueOnce(errResp(422, "unprocessable"));

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    const warnings = getConsoleLogs().filter((l) => l.includes("::warning::"));
    expect(warnings.some((l) => l.toLowerCase().includes("pr comment"))).toBe(true);
  });

  it("swallows network errors on PR comment fetch (does not throw)", async () => {
    setApiKey();
    setInput("action", "production.deploy");
    setInput("slack-webhook", "");
    setupGitHubPrContext({ prNumber: "8" });

    const decisionObj = makeDecision({ decision: "deny" });
    mockEnforce.mockRejectedValueOnce(
      new EnforceError("blocked", "verify", decisionObj),
    );

    fetchMock
      .mockResolvedValueOnce(okResp()) // commit status
      .mockRejectedValueOnce(new Error("ETIMEDOUT")); // PR comment network error

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    const warnings = getConsoleLogs().filter((l) => l.includes("::warning::"));
    expect(warnings.some((l) => l.toLowerCase().includes("pr comment"))).toBe(true);
  });

  it("skips PR comment when pr-comment-on-deny=false", async () => {
    setApiKey();
    setInput("action", "production.deploy");
    setInput("slack-webhook", "");
    setInput("pr-comment-on-deny", "false");
    setupGitHubPrContext({ prNumber: "20" });

    const decisionObj = makeDecision({ decision: "deny" });
    mockEnforce.mockRejectedValueOnce(
      new EnforceError("blocked", "verify", decisionObj),
    );

    fetchMock.mockResolvedValue(okResp());

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    const prCommentCall = getPrCommentCall();
    expect(prCommentCall).toBeUndefined();
  });
});

// =============================================================================
// 4. Batch-deny integration path in run()
// =============================================================================

describe("batch-deny integration (v2.1 path)", () => {
  function setupBatchEnv(opts: {
    slackWebhook?: string;
    teamsWebhook?: string;
    prCommentEnabled?: boolean;
    prNumber?: string;
    token?: string;
    repo?: string;
  } = {}) {
    const {
      slackWebhook = "https://hooks.slack.com/batch-webhook",
      teamsWebhook,
      prCommentEnabled = true,
      prNumber = "77",
      token = "gh-batch-token",
      repo = "acme/batchrepo",
    } = opts;

    setApiKey();
    setInput(
      "evaluations",
      JSON.stringify([{ action: "production.deploy", actor: "alice" }]),
    );
    if (slackWebhook) setInput("slack-webhook", slackWebhook);
    if (teamsWebhook) setInput("teams-webhook", teamsWebhook);
    if (!prCommentEnabled) setInput("pr-comment-on-deny", "false");

    setupGitHubPrContext({ prNumber, token, repo });
  }

  it("calls notifySlack when result.failed=true and slack-webhook is set", async () => {
    setupBatchEnv({ prNumber: undefined as unknown as string }); // no PR so no PR comment call
    process.env["GITHUB_REF"] = "refs/heads/main"; // non-PR ref

    mockRunV21.mockResolvedValueOnce(
      makeV21Result({
        decisions: [{ id: "ev-1", decision: "deny", reasons: [], verified: false, verifyOutcome: "" }],
      }),
    );

    fetchMock.mockResolvedValue(okResp());

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    const slackCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "https://hooks.slack.com/batch-webhook",
    );
    expect(slackCalls).toHaveLength(1);
    const payload = JSON.parse(slackCalls[0][1].body as string);
    expect(payload.text).toContain("DENIED");
  });

  it("calls notifyTeams when result.failed=true and teams-webhook is set", async () => {
    setupBatchEnv({
      prNumber: undefined as unknown as string,
      slackWebhook: "",
      teamsWebhook: "https://outlook.office.com/webhook/batch-webhook",
    }); // no PR so no PR comment call
    process.env["GITHUB_REF"] = "refs/heads/main"; // non-PR ref

    mockRunV21.mockResolvedValueOnce(
      makeV21Result({
        decisions: [{ id: "ev-1", decision: "deny", reasons: [], verified: false, verifyOutcome: "" }],
      }),
    );

    fetchMock.mockResolvedValue(okResp());

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    const teamsCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "https://outlook.office.com/webhook/batch-webhook",
    );
    expect(teamsCalls).toHaveLength(1);
    const payload = JSON.parse(teamsCalls[0][1].body as string);
    expect(payload.summary).toContain("DENIED");
  });

  it("calls postPRComment when result.failed=true and PR context is set", async () => {
    setupBatchEnv({ prNumber: "77" });

    mockRunV21.mockResolvedValueOnce(
      makeV21Result({
        decisions: [{ id: "ev-1", decision: "deny", reasons: [], verified: false, verifyOutcome: "" }],
      }),
    );

    fetchMock.mockResolvedValue(okResp());

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    const prCommentCall = fetchMock.mock.calls.find(
      ([url]) => url.includes("/issues/77/comments"),
    );
    expect(prCommentCall).toBeDefined();
    const body = JSON.parse((prCommentCall![1] as RequestInit).body as string);
    expect(body.body).toContain("DENIED");
  });

  it("aggregates worst decision: deny > escalate > hold", async () => {
    setupBatchEnv({ prNumber: undefined as unknown as string });
    process.env["GITHUB_REF"] = "refs/heads/main";

    mockRunV21.mockResolvedValueOnce(
      makeV21Result({
        decisions: [
          { id: "ev-1", decision: "hold", reasons: [], verified: false, verifyOutcome: "" },
          { id: "ev-2", decision: "escalate", reasons: [], verified: false, verifyOutcome: "" },
          { id: "ev-3", decision: "deny", reasons: [], verified: false, verifyOutcome: "" },
        ],
      }),
    );

    fetchMock.mockResolvedValue(okResp());

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    const slackCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "https://hooks.slack.com/batch-webhook",
    );
    expect(slackCalls).toHaveLength(1);
    const payload = JSON.parse(slackCalls[0][1].body as string);
    expect(payload.text).toContain("DENIED"); // worst is deny
  });

  it("escalate is worst when no deny present", async () => {
    setupBatchEnv({ prNumber: undefined as unknown as string });
    process.env["GITHUB_REF"] = "refs/heads/main";

    mockRunV21.mockResolvedValueOnce(
      makeV21Result({
        decisions: [
          { id: "ev-1", decision: "hold", reasons: [], verified: false, verifyOutcome: "" },
          { id: "ev-2", decision: "escalate", reasons: [], verified: false, verifyOutcome: "" },
        ],
      }),
    );

    fetchMock.mockResolvedValue(okResp());

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    const slackCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "https://hooks.slack.com/batch-webhook",
    );
    const payload = JSON.parse(slackCalls[0][1].body as string);
    expect(payload.text).toContain("ESCALATED");
  });

  it("skips Slack when slack-webhook is empty in batch deny path", async () => {
    setupBatchEnv({ slackWebhook: "", prNumber: "77" });

    mockRunV21.mockResolvedValueOnce(
      makeV21Result({
        decisions: [{ id: "ev-1", decision: "deny", reasons: [], verified: false, verifyOutcome: "" }],
      }),
    );

    fetchMock.mockResolvedValue(okResp());

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    // Verify no Slack call happened (only a PR comment URL if any)
    const nonPrCalls = fetchMock.mock.calls.filter(
      ([url]) =>
        !url.includes("/issues/") && !url.includes("/comments") && !url.includes("/statuses/"),
    );
    expect(nonPrCalls).toHaveLength(0);
  });

  it("skips Teams when teams-webhook is unset in batch deny path", async () => {
    setupBatchEnv({ slackWebhook: "", prNumber: "77" }); // teamsWebhook left unset

    mockRunV21.mockResolvedValueOnce(
      makeV21Result({
        decisions: [{ id: "ev-1", decision: "deny", reasons: [], verified: false, verifyOutcome: "" }],
      }),
    );

    fetchMock.mockResolvedValue(okResp());

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    // Verify no Teams (or Slack) call happened — only PR comment / commit status
    const nonPrCalls = fetchMock.mock.calls.filter(
      ([url]) =>
        !url.includes("/issues/") && !url.includes("/comments") && !url.includes("/statuses/"),
    );
    expect(nonPrCalls).toHaveLength(0);
  });

  it("skips PR comment when pr-comment-on-deny=false in batch deny path", async () => {
    setupBatchEnv({ prCommentEnabled: false, prNumber: "77" });

    mockRunV21.mockResolvedValueOnce(
      makeV21Result({
        decisions: [{ id: "ev-1", decision: "deny", reasons: [], verified: false, verifyOutcome: "" }],
      }),
    );

    fetchMock.mockResolvedValue(okResp());

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    const prCommentCall = fetchMock.mock.calls.find(
      ([url]) => url.includes("/issues/77/comments"),
    );
    expect(prCommentCall).toBeUndefined();
  });

  it("skips PR comment when PR ref is absent (non-PR context) in batch deny path", async () => {
    setupBatchEnv({ prNumber: undefined as unknown as string });
    process.env["GITHUB_REF"] = "refs/heads/feature/xyz"; // non-PR

    mockRunV21.mockResolvedValueOnce(
      makeV21Result({
        decisions: [{ id: "ev-1", decision: "deny", reasons: [], verified: false, verifyOutcome: "" }],
      }),
    );

    fetchMock.mockResolvedValue(okResp());

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    const prCommentCall = fetchMock.mock.calls.find(
      ([url]) => url.includes("/issues/") && url.includes("/comments"),
    );
    expect(prCommentCall).toBeUndefined();
  });

  it("calls setFailed with blocked message after firing notifications", async () => {
    setupBatchEnv({ prNumber: "77" });

    mockRunV21.mockResolvedValueOnce(
      makeV21Result({
        decisions: [{ id: "ev-1", decision: "deny", reasons: [], verified: false, verifyOutcome: "" }],
      }),
    );

    fetchMock.mockResolvedValue(okResp());

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    const errorLogs = getConsoleLogs().filter((l) => l.includes("::error::"));
    expect(errorLogs.some((l) => l.includes("evaluations were not allowed"))).toBe(true);
  });

  it("does NOT call notifySlack, notifyTeams, or postPRComment when result.failed=false", async () => {
    setupBatchEnv({ prNumber: "77", teamsWebhook: "https://outlook.office.com/webhook/batch-webhook" });

    mockRunV21.mockResolvedValueOnce({
      batchId: "batch-ok",
      failed: false,
      decisions: [
        { id: "ev-1", decision: "allow", reasons: [], verified: true, verifyOutcome: "ok" },
      ],
    });

    fetchMock.mockResolvedValue(okResp());

    // run() should succeed without throwing
    await run();

    // No Slack call
    const slackCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "https://hooks.slack.com/batch-webhook",
    );
    expect(slackCalls).toHaveLength(0);

    // No Teams call
    const teamsCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "https://outlook.office.com/webhook/batch-webhook",
    );
    expect(teamsCalls).toHaveLength(0);

    // No PR comment call
    const prCommentCall = fetchMock.mock.calls.find(
      ([url]) => url.includes("/issues/77/comments"),
    );
    expect(prCommentCall).toBeUndefined();
  });

  it("includes reason summary with blocked count in Slack payload", async () => {
    setupBatchEnv({ prNumber: undefined as unknown as string });
    process.env["GITHUB_REF"] = "refs/heads/main";

    mockRunV21.mockResolvedValueOnce(
      makeV21Result({
        decisions: [
          { id: "ev-1", decision: "allow", reasons: [], verified: true, verifyOutcome: "ok" },
          { id: "ev-2", decision: "deny", reasons: [], verified: false, verifyOutcome: "" },
        ],
      }),
    );

    fetchMock.mockResolvedValue(okResp());

    await expect(run()).rejects.toBeInstanceOf(ProcessExitError);

    const slackCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "https://hooks.slack.com/batch-webhook",
    );
    expect(slackCalls).toHaveLength(1);
    const payload = JSON.parse(slackCalls[0][1].body as string);
    // reason should mention "1 of 2"
    const sectionBlock = payload.blocks.find(
      (b: { type: string; text?: { text: string } }) =>
        b.type === "section" && b.text?.text?.includes("1 of 2"),
    );
    expect(sectionBlock).toBeDefined();
  });
});
