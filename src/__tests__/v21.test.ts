import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runV21 } from "../v21";

// SIM tests for runV21() — the orchestration layer that wires together
// parseInputs + evaluateMany + (optional) waitForTerminalDecision.

vi.mock("../batch", () => ({ evaluateMany: vi.fn() }));
vi.mock("@atlasent/enforce", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@atlasent/enforce")>();
  return { ...actual, verifyPermit: vi.fn() };
});
vi.mock("../stream", () => ({ waitForTerminalDecision: vi.fn() }));
vi.mock("../evidenceClient", () => ({ emitEvidenceEvent: vi.fn(async () => {}) }));
vi.mock("../workloadIdentity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../workloadIdentity")>();
  return { ...actual, mintGithubActionsActorIdentity: vi.fn() };
});

import { evaluateMany } from "../batch";
import { verifyPermit } from "@atlasent/enforce";
import { waitForTerminalDecision } from "../stream";
import { mintGithubActionsActorIdentity } from "../workloadIdentity";

const mockEvaluateMany = evaluateMany as ReturnType<typeof vi.fn>;
const mockVerifyPermit = verifyPermit as ReturnType<typeof vi.fn>;
const mockWait = waitForTerminalDecision as ReturnType<typeof vi.fn>;
const mockMintIdentity = mintGithubActionsActorIdentity as ReturnType<typeof vi.fn>;

// Minimal env that drives the batch path (evaluations set).
const BASE_ENV = {
  ATLASENT_API_KEY: "ask_test_key",
  "INPUT_API-URL": "https://api.test",
  "INPUT_FAIL-ON-DENY": "true",
  INPUT_EVALUATIONS: JSON.stringify([
    { action: "production.deploy", actor: "alice", environment: "production" },
  ]),
  "INPUT_WAIT-TIMEOUT-MS": "30000",
};

const FLAGS = { v2Streaming: false };

function decision(
  d: "allow" | "deny" | "hold" | "escalate",
  id = "ev-1",
  permitToken?: string,
) {
  return { id, decision: d, evaluatedAt: "2026-04-30T00:00:00Z", permitToken, verified: d === "allow" || undefined };
}

beforeEach(() => {
  mockEvaluateMany.mockReset();
  mockVerifyPermit.mockReset();
  mockWait.mockReset();
  mockMintIdentity.mockReset();
  mockMintIdentity.mockResolvedValue({
    actorId: "workload:github:repo-1:workflow-1",
    assertion: { version: "actor_identity.v1", token: "signed-1" },
    source: {
      issuer: "https://token.actions.githubusercontent.com",
      repository: "acme/app",
      repository_id: "repo-1",
      ref: "refs/heads/main",
      sha: "abc123",
      workflow_ref: "acme/app/.github/workflows/deploy.yml@refs/heads/main",
      actor: "octocat",
      actor_id: "actor-1",
      run_id: "run-1",
      run_attempt: "1",
      environment: "production",
    },
  });
});

afterEach(() => { vi.restoreAllMocks(); });

// ── Basic routing ─────────────────────────────────────────────────────────────

it("passes items through to evaluateMany", async () => {
  mockEvaluateMany.mockResolvedValueOnce({ decisions: [decision("allow")], batchId: "b1" });
  await runV21(BASE_ENV, FLAGS);
  expect(mockEvaluateMany).toHaveBeenCalledWith(
    "https://api.test",
    "ask_test_key",
    [
      expect.objectContaining({
        action: "production.deploy",
        actor: "workload:github:repo-1:workflow-1",
        environment: "production",
        actor_identity: { version: "actor_identity.v1", token: "signed-1" },
        change_plan: { operation: "deploy", revision: "abc123" },
        context: { triggering_actor: "github:octocat" },
      }),
    ],
  );
});

it("mints a separate workload identity for every production item and opportunistically for package.release items in a mixed batch", async () => {
  mockMintIdentity
    .mockResolvedValueOnce({
      actorId: "workload:one",
      assertion: { version: "actor_identity.v1", token: "signed-1" },
      source: {
        issuer: "https://token.actions.githubusercontent.com",
        repository: "acme/app",
        repository_id: "repo-1",
        ref: "refs/heads/main",
        sha: "abc123",
        workflow_ref: "acme/app/.github/workflows/deploy.yml@refs/heads/main",
        actor: "alice",
        actor_id: "1",
        run_id: "run-1",
        run_attempt: "1",
        environment: "production",
      },
    })
    .mockResolvedValueOnce({
      actorId: "workload:release-verified",
      assertion: { version: "actor_identity.v1", token: "signed-release" },
      source: {
        issuer: "https://token.actions.githubusercontent.com",
        repository: "acme/app",
        repository_id: "repo-1",
        ref: "refs/heads/main",
        sha: "release-sha",
        workflow_ref: "acme/app/.github/workflows/release.yml@refs/heads/main",
        actor: "carol",
        actor_id: "3",
        run_id: "run-3",
        run_attempt: "1",
        environment: "production",
      },
    })
    .mockRejectedValueOnce(new Error("GitHub OIDC is unavailable"))
    .mockResolvedValueOnce({
      actorId: "workload:two",
      assertion: { version: "actor_identity.v1", token: "signed-2" },
      source: {
        issuer: "https://token.actions.githubusercontent.com",
        repository: "acme/app",
        repository_id: "repo-1",
        ref: "refs/heads/release",
        sha: "def456",
        workflow_ref: "acme/app/.github/workflows/deploy.yml@refs/heads/release",
        actor: "bob",
        actor_id: "2",
        run_id: "run-2",
        run_attempt: "1",
        environment: "staging",
      },
    });
  mockEvaluateMany.mockResolvedValueOnce({
    decisions: [decision("allow"), decision("allow", "ev-2"), decision("allow", "ev-3"), decision("allow", "ev-4")],
    batchId: "mixed",
  });

  await runV21(
    {
      ...BASE_ENV,
      INPUT_EVALUATIONS: JSON.stringify([
        {
          action: "production.deploy",
          actor: "caller-one",
          environment: "production",
          actor_identity: { version: "forged" },
          context: { triggering_actor: "github:forged", change: "one" },
        },
        {
          action: "package.release",
          actor: "release-manager-one",
          actor_identity: { version: "forged" },
        },
        {
          // Same action, mint fails this time — must fall back, not throw.
          action: "package.release",
          actor: "release-manager-two",
          actor_identity: { version: "forged" },
        },
        { action: "production.deploy", actor: "caller-two", environment: "staging" },
      ]),
    },
    FLAGS,
  );

  expect(mockMintIdentity).toHaveBeenCalledTimes(4);
  expect(mockMintIdentity).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ actionType: "production.deploy", environment: "production" }),
    { mask: undefined },
  );
  expect(mockMintIdentity).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ actionType: "package.release" }),
    { mask: undefined },
  );
  expect(mockMintIdentity).toHaveBeenNthCalledWith(
    3,
    expect.objectContaining({ actionType: "package.release" }),
    { mask: undefined },
  );
  expect(mockMintIdentity).toHaveBeenNthCalledWith(
    4,
    expect.objectContaining({ actionType: "production.deploy", environment: "staging" }),
    { mask: undefined },
  );
  const sent = mockEvaluateMany.mock.calls[0][2];
  expect(sent[0]).toEqual(
    expect.objectContaining({
      actor: "workload:one",
      actor_identity: { version: "actor_identity.v1", token: "signed-1" },
      context: { change: "one", triggering_actor: "github:alice" },
    }),
  );
  // Mint succeeded: gets the verified workload actor.
  expect(sent[1]).toEqual(
    expect.objectContaining({
      actor: "workload:release-verified",
      actor_identity: { version: "actor_identity.v1", token: "signed-release" },
      context: { triggering_actor: "github:carol" },
    }),
  );
  // Mint failed: falls back to the caller-supplied actor unchanged — no
  // change_plan/context injection, no error propagated to the batch.
  expect(sent[2]).toEqual({ action: "package.release", actor: "release-manager-two" });
  expect(sent[3]).toEqual(
    expect.objectContaining({
      actor: "workload:two",
      actor_identity: { version: "actor_identity.v1", token: "signed-2" },
      context: { triggering_actor: "github:bob" },
    }),
  );
});

it("fails before evaluation when a production batch item has no environment", async () => {
  await expect(
    runV21(
      {
        ...BASE_ENV,
        INPUT_EVALUATIONS: JSON.stringify([
          { action: "production.deploy", actor: "caller" },
        ]),
      },
      FLAGS,
    ),
  ).rejects.toThrow(/requires its own non-empty `environment`/);

  expect(mockMintIdentity).not.toHaveBeenCalled();
  expect(mockEvaluateMany).not.toHaveBeenCalled();
});

it("refuses artifact.release in batch mode before any mint or evaluation", async () => {
  await expect(
    runV21(
      {
        ...BASE_ENV,
        INPUT_EVALUATIONS: JSON.stringify([
          { action: "artifact.release", actor: "caller", environment: "production" },
        ]),
      },
      FLAGS,
    ),
  ).rejects.toThrow(/not supported in batch mode/);

  expect(mockMintIdentity).not.toHaveBeenCalled();
  expect(mockEvaluateMany).not.toHaveBeenCalled();
});

it("fails before evaluation when workload identity minting is rejected", async () => {
  mockMintIdentity.mockRejectedValueOnce(new Error("enrollment mismatch"));

  await expect(runV21(BASE_ENV, FLAGS)).rejects.toThrow(/enrollment mismatch/);
  expect(mockEvaluateMany).not.toHaveBeenCalled();
});

it("wraps single action/actor into a 1-item batch", async () => {
  mockEvaluateMany.mockResolvedValueOnce({ decisions: [decision("allow")], batchId: "b1" });
  await runV21(
    { ATLASENT_API_KEY: "ask_test_key", INPUT_ACTION: "production.deploy", INPUT_ACTOR: "bob" },
    FLAGS,
  );
  expect(mockEvaluateMany).toHaveBeenCalledWith(
    "https://api.atlasent.io/functions/v1",
    "ask_test_key",
    [expect.objectContaining({ action: "production.deploy", actor: "bob" })],
  );
});

it("returns batchId from evaluateMany", async () => {
  mockEvaluateMany.mockResolvedValueOnce({ decisions: [decision("allow")], batchId: "server-batch-99" });
  const out = await runV21(BASE_ENV, FLAGS);
  expect(out.batchId).toBe("server-batch-99");
});

// ── failed flag ───────────────────────────────────────────────────────────────

it("failed=false when all decisions are allow", async () => {
  mockEvaluateMany.mockResolvedValueOnce({ decisions: [decision("allow")], batchId: "b1" });
  const out = await runV21(BASE_ENV, FLAGS);
  expect(out.failed).toBe(false);
});

it("failed=true when any decision is deny and failOnDeny=true", async () => {
  mockEvaluateMany.mockResolvedValueOnce({
    decisions: [decision("allow"), decision("deny", "ev-2")],
    batchId: "b1",
  });
  const out = await runV21(BASE_ENV, FLAGS);
  expect(out.failed).toBe(true);
});

it("failed=true when any decision is hold and failOnDeny=true", async () => {
  mockEvaluateMany.mockResolvedValueOnce({
    decisions: [decision("allow"), decision("hold", "ev-2")],
    batchId: "b1",
  });
  const out = await runV21(BASE_ENV, FLAGS);
  expect(out.failed).toBe(true);
});

it("failed=true when any decision is escalate and failOnDeny=true", async () => {
  mockEvaluateMany.mockResolvedValueOnce({
    decisions: [decision("allow"), decision("escalate", "ev-2")],
    batchId: "b1",
  });
  const out = await runV21(BASE_ENV, FLAGS);
  expect(out.failed).toBe(true);
});

it("failed=true when non-allow even if failOnDeny=false", async () => {
  mockEvaluateMany.mockResolvedValueOnce({
    decisions: [decision("deny"), decision("hold", "ev-2"), decision("escalate", "ev-3")],
    batchId: "b1",
  });
  const out = await runV21({ ...BASE_ENV, "INPUT_FAIL-ON-DENY": "false" }, FLAGS);
  expect(out.failed).toBe(true);
});

// Regression: an "allow" decision whose permit failed verification
// (verified !== true — e.g. replay_blocked, artifact/context mismatch)
// must count as failed exactly like a deny/hold/escalate. Before this fix,
// `failed` only inspected `d.decision`, so a batch item that was
// authorized nothing (unverified allow) silently reported `failed: false`.
// This is exercised directly against runV21()'s own `failed` computation —
// `evaluateMany` is mocked here, so this is independent of whatever
// evaluateMany's own verifyPermit wiring does internally.
it("failed=true when an allow decision's permit did not verify (verified: false)", async () => {
  mockEvaluateMany.mockResolvedValueOnce({
    decisions: [
      {
        id: "ev-1",
        decision: "allow",
        evaluatedAt: "2026-04-30T00:00:00Z",
        permitToken: "pt-1",
        verified: false,
        verifyOutcome: "replay_blocked",
      },
    ],
    batchId: "b1",
  });
  const out = await runV21(BASE_ENV, FLAGS);
  expect(out.failed).toBe(true);
});

it("failed=true when an allow decision has verified undefined (not explicitly true)", async () => {
  mockEvaluateMany.mockResolvedValueOnce({
    decisions: [
      { id: "ev-1", decision: "allow", evaluatedAt: "2026-04-30T00:00:00Z", permitToken: "pt-1" },
    ],
    batchId: "b1",
  });
  const out = await runV21(BASE_ENV, FLAGS);
  expect(out.failed).toBe(true);
});

// ── wait-for-id path ──────────────────────────────────────────────────────────

it("calls waitForTerminalDecision when waitForId matches a hold decision", async () => {
  const hold = decision("hold", "ev-hold");
  const terminal = decision("allow", "ev-hold", "pt-1");
  mockEvaluateMany.mockResolvedValueOnce({ decisions: [hold], batchId: "b1" });
  mockWait.mockResolvedValueOnce(terminal);
  mockVerifyPermit.mockResolvedValueOnce({ verified: true, outcome: "ok" });

  const out = await runV21({ ...BASE_ENV, "INPUT_WAIT-FOR-ID": "ev-hold" }, FLAGS);

  expect(mockWait).toHaveBeenCalledOnce();
  expect(mockWait).toHaveBeenCalledWith(
    expect.objectContaining({ evaluationId: "ev-hold", apiKey: "ask_test_key" }),
  );
  expect(mockVerifyPermit).toHaveBeenCalledOnce();
  expect(out.decisions[0].decision).toBe("allow");
  expect(out.decisions[0].verified).toBe(true);
});

it("verifies terminal allow from wait-for-id with correct permit params", async () => {
  const hold = decision("hold", "ev-hold");
  const terminal = { ...decision("allow", "ev-hold", "pt-xyz"), verified: undefined };
  mockEvaluateMany.mockResolvedValueOnce({ decisions: [hold], batchId: "b1" });
  mockWait.mockResolvedValueOnce(terminal);
  mockVerifyPermit.mockResolvedValueOnce({ verified: true, outcome: "ok" });

  await runV21({ ...BASE_ENV, "INPUT_WAIT-FOR-ID": "ev-hold" }, FLAGS);

  expect(mockVerifyPermit).toHaveBeenCalledWith(
    expect.objectContaining({
      apiKey: "ask_test_key",
      apiUrl: "https://api.test",
      action: "production.deploy",
      actor: "workload:github:repo-1:workflow-1",
    }),
    expect.objectContaining({
      decision: "allow",
      permitToken: "pt-xyz",
    }),
  );
});

it("preserves the original runtime-derived execution hash after approval", async () => {
  const hold = {
    ...decision("hold", "ev-hold"),
    executionHashExpected: "original-plan-hash",
  };
  // Approval status returns a fresh permit but intentionally does not repeat
  // the plan hash established by the original evaluation.
  const terminal = { ...decision("allow", "ev-hold", "pt-fresh"), verified: undefined };
  mockEvaluateMany.mockResolvedValueOnce({ decisions: [hold], batchId: "b1" });
  mockWait.mockResolvedValueOnce(terminal);
  mockVerifyPermit.mockResolvedValueOnce({ verified: true, outcome: "verified" });

  await runV21({ ...BASE_ENV, "INPUT_WAIT-FOR-ID": "ev-hold" }, FLAGS);

  expect(mockVerifyPermit).toHaveBeenCalledWith(
    expect.objectContaining({
      executionPayloadHash: "original-plan-hash",
      requiredBindings: ["environment", "payload_hash"],
    }),
    expect.objectContaining({
      permitToken: "pt-fresh",
      executionHashExpected: "original-plan-hash",
    }),
  );
});

it("sets verified=false when terminal allow has no permitToken", async () => {
  const hold = decision("hold", "ev-hold");
  const terminalNoPermit = { id: "ev-hold", decision: "allow" as const, evaluatedAt: "2026-04-30T00:00:00Z" };
  mockEvaluateMany.mockResolvedValueOnce({ decisions: [hold], batchId: "b1" });
  mockWait.mockResolvedValueOnce(terminalNoPermit);

  const out = await runV21({ ...BASE_ENV, "INPUT_WAIT-FOR-ID": "ev-hold" }, FLAGS);

  expect(mockVerifyPermit).not.toHaveBeenCalled();
  expect(out.decisions[0].verified).toBe(false);
});

it("calls waitForTerminalDecision when waitForId matches an escalate decision", async () => {
  const escalate = decision("escalate", "ev-esc");
  const terminal = decision("deny", "ev-esc");
  mockEvaluateMany.mockResolvedValueOnce({ decisions: [escalate], batchId: "b1" });
  mockWait.mockResolvedValueOnce(terminal);

  const out = await runV21({ ...BASE_ENV, "INPUT_WAIT-FOR-ID": "ev-esc" }, FLAGS);

  expect(mockWait).toHaveBeenCalledOnce();
  expect(out.decisions[0].decision).toBe("deny");
});

it("skips wait when waitForId does not match any hold/escalate decision", async () => {
  mockEvaluateMany.mockResolvedValueOnce({ decisions: [decision("allow", "ev-other")], batchId: "b1" });

  await runV21({ ...BASE_ENV, "INPUT_WAIT-FOR-ID": "ev-not-found" }, FLAGS);

  expect(mockWait).not.toHaveBeenCalled();
});

it("skips wait when no waitForId is set", async () => {
  mockEvaluateMany.mockResolvedValueOnce({ decisions: [decision("hold")], batchId: "b1" });

  await runV21(BASE_ENV, FLAGS);

  expect(mockWait).not.toHaveBeenCalled();
});
