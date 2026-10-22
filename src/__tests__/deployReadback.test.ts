import { describe, expect, it } from "vitest";
import { buildDeployReadback, deployReadbackSummary } from "../deployReadback";
import type { EstablishResult } from "../executionAdmission";

const HEAD = "b".repeat(40);
const BASE = "c".repeat(40);
const exp = {
  runId: "123456",
  headSha: HEAD,
  baseSha: BASE,
  operationId: "op-1",
  attemptId: "att-1",
  deployJobResult: "success",
  evaluationId: "eval-1",
  permitHash: "f".repeat(64),
};

/** The shape v1-consequential-operations returns for an established GitHub deploy. */
function established(over: Record<string, unknown> = {}, evidenceOver: Record<string, unknown> = {}): EstablishResult {
  const evidence = {
    version: "github_causal_continuity.v1",
    status: "ESTABLISHED",
    provider: "github",
    workflow_run_id: "123456",
    authorization: { evaluation_id: "eval-1", decision_id: "req-1", permit_token_hash: "f".repeat(64), change_brief_id: "cb-1", canonical_plan_digest: "d".repeat(64) },
    verified_plan: { repository: "acme/app", base_sha: BASE, head_sha: HEAD, ref: "refs/heads/main", environment: "production", canonical_plan_digest: "d".repeat(64), preserved_snapshot: true },
    artifact_currentness: { checked_close_to_mutation: true, workflow_head_sha: HEAD, deployment_sha: HEAD, matches_verified_plan: true },
    native_mutation: { predicate_source: "github_deployment_status_api", deployment_id: 987, status_id: "555", state: "success", occurred_at: "2026-10-22T19:00:00Z" },
    causal_revision: { repository: "acme/app", deployment_id: "987", head_sha: HEAD, environment: "production", bound_at_mutation: true },
    ...evidenceOver,
  };
  return {
    state: "succeeded",
    established: true,
    deploymentId: "987",
    reason: null,
    response: { operation_id: "op-1", state: "succeeded", effect_establishment: { verdict: "established", recorded: true, observation: { verdict: "established", evidence } }, ...over },
  };
}

describe("buildDeployReadback", () => {
  it("verified: correlates the native deployment with the exact authorization", () => {
    const r = buildDeployReadback(established(), exp);
    expect(r).toMatchObject({
      verdict: "verified",
      source: "runtime_establish_effect",
      workflow_run_id: "123456",
      deployment_id: "987",
      deployment_status_id: "555",
      deployment_state: "success",
      head_sha: HEAD,
      base_sha: BASE,
      evaluation_id: "eval-1",
      permit_token_hash: "f".repeat(64),
      operation_id: "op-1",
      attempt_id: "att-1",
    });
  });

  it("verified without optional ids says which ids were not cross-checked", () => {
    const r = buildDeployReadback(established(), { ...exp, evaluationId: undefined, permitHash: undefined });
    expect(r.verdict).toBe("verified");
    expect(r.reason).toMatch(/not cross-checked.*evaluation_id, permit_token_hash/);
  });

  it.each([
    ["another evaluation", { ...exp, evaluationId: "eval-2" }, {}],
    ["another permit", { ...exp, permitHash: "0".repeat(64) }, {}],
    ["another run", { ...exp, runId: "999" }, {}],
    ["another head", { ...exp, headSha: "a".repeat(40) }, {}],
    ["a non-success native status", exp, { native_mutation: { deployment_id: "987", status_id: "1", state: "failure" } }],
    ["an artifact that does not match the plan", exp, { artifact_currentness: { matches_verified_plan: false } }],
    ["an evidence record missing the evaluation", exp, { authorization: { permit_token_hash: "f".repeat(64) } }],
  ])("mismatch: %s", (_n, e, ev) => {
    expect(buildDeployReadback(established({}, ev), e).verdict).toBe("mismatch");
  });

  it("mismatch: the runtime classified the observation as not the admitted effect", () => {
    const r: EstablishResult = { state: "establish_http_409", established: false, deploymentId: "987", reason: "workflow_run_started_after_admission", response: { effect_establishment: { verdict: "mismatch", reason: "workflow_run_started_after_admission", recorded: false } } };
    expect(buildDeployReadback(r, exp)).toMatchObject({ verdict: "mismatch", reason: expect.stringMatching(/started_after_admission/) });
  });

  it("failed: the deploy job failed and the runtime recorded it", () => {
    const r: EstablishResult = { state: "failed", established: false, deploymentId: null, reason: "deploy job result: failure", response: { state: "failed" } };
    expect(buildDeployReadback(r, { ...exp, deployJobResult: "failure" }).verdict).toBe("failed");
    expect(buildDeployReadback({ ...r, state: "unknown" }, { ...exp, deployJobResult: "cancelled" }).verdict).toBe("failed");
  });

  it("incomplete: a failed job the runtime has not recorded is never 'failed' (or verified)", () => {
    const r: EstablishResult = { state: "record_attempt_http_503", established: false, deploymentId: null, reason: null, response: { error: "unavailable" } };
    expect(buildDeployReadback(r, { ...exp, deployJobResult: "failure" }).verdict).toBe("incomplete");
  });

  it.each([
    ["no response at all", null],
    ["an unknown verdict", { state: "establish_http_503", established: false, deploymentId: "987", reason: "deployment_in_progress", response: { effect_establishment: { verdict: "unknown", recorded: false } } }],
    ["established with no evidence", { ...established(), response: { state: "succeeded", effect_establishment: { verdict: "established", observation: {} } } }],
    ["established flag without the runtime verdict", { ...established(), response: { state: "succeeded", effect_establishment: { observation: established().response!["effect_establishment"] } } }],
  ])("incomplete: %s", (_n, r) => {
    expect(buildDeployReadback(r as EstablishResult | null, exp).verdict).toBe("incomplete");
  });

  it("complete evidence is never enough without the runtime's own establishment", () => {
    const base = established();
    const ee = base.response!["effect_establishment"] as Record<string, unknown>;
    const notEstablished: EstablishResult = { ...base, state: "establish_http_503", established: false, response: { ...base.response, effect_establishment: { ...ee, verdict: "unknown" } } };
    expect(buildDeployReadback(notEstablished, exp).verdict).toBe("incomplete");
    const noVerdict: EstablishResult = { ...base, response: { ...base.response, effect_establishment: { ...ee, verdict: undefined } } };
    expect(buildDeployReadback(noVerdict, exp).verdict).toBe("incomplete");
  });

  it("a success the workflow claims but the runtime never established is not verified", () => {
    const claimed: EstablishResult = { state: "succeeded", established: false, deploymentId: "987", reason: null, response: { state: "succeeded" } };
    expect(buildDeployReadback(claimed, exp).verdict).toBe("incomplete");
  });

  it("renders a summary naming the verdict and the correlated ids", () => {
    const md = deployReadbackSummary(buildDeployReadback(established(), exp));
    expect(md).toContain("**verified**");
    expect(md).toContain("`eval-1`");
    expect(md).toContain("`987 / 555 (success)`");
  });
});
