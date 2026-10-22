// Deploy readback: one record that correlates the deploy GitHub actually ran
// with the authorization that admitted it, and a deterministic verdict.
//
// Every field comes from the runtime's establish-effect response, which carries
// the observation the runtime built from GitHub's own run, deployment and status
// records and sealed (github_causal_continuity.v1). Nothing here is read from the
// workflow's own claim. The caller's expected values (run, head/base SHA,
// evaluation id, permit hash) are used only to CROSS-CHECK that record; they can
// turn a verdict into `mismatch` or `incomplete`, never into `verified`.
//
//   verified    the runtime established the effect, and its evidence names this
//               run, a successful native deployment status, the expected
//               revision and plan, and every expected authorization id.
//   mismatch    the runtime classified the observation as not the authorized
//               effect, or its evidence disagrees with what this workflow
//               authorized.
//   failed      the deploy job did not succeed, and the runtime recorded that.
//   incomplete  anything else: no response, unknown, missing evidence, or an
//               expected id the evidence cannot be checked against.

import type { EstablishResult } from "./executionAdmission";

export type ReadbackVerdict = "verified" | "mismatch" | "failed" | "incomplete";

export interface ReadbackExpectations {
  runId: string;
  headSha: string;
  baseSha: string;
  operationId: string;
  attemptId: string;
  deployJobResult: string;
  /** The GitHub Environment the deploy job declared (the deploy-environment input). */
  environment: string;
  /** The gate's evaluation-id output. Optional: checked when given. */
  evaluationId?: string;
  /** The admit step's permit-hash output. Optional: checked when given. */
  permitHash?: string;
}

export interface DeployReadback {
  schema: "atlasent.deploy_readback.v1";
  verdict: ReadbackVerdict;
  reason: string;
  /** Always the runtime's sealed observation, or "none". */
  source: "runtime_establish_effect" | "none";
  runtime_state: string;
  runtime_verdict: string | null;
  /** The operation the runtime's response names. */
  operation_id: string | null;
  /**
   * The attempt the runtime matched (effect_establishment.attempt_id). Null when the
   * runtime revision does not send it yet; the runtime still refuses any attempt that is
   * not the operation's latest (attempt_not_latest), so a 200 implies that check passed.
   */
  attempt_id: string | null;
  /** What this workflow asked the runtime to establish. Caller-supplied: never provenance. */
  requested_operation_id: string;
  requested_attempt_id: string;
  workflow_run_id: string | null;
  deployment_id: string | null;
  deployment_status_id: string | null;
  deployment_state: string | null;
  deployment_occurred_at: string | null;
  head_sha: string | null;
  base_sha: string | null;
  environment: string | null;
  evaluation_id: string | null;
  decision_id: string | null;
  permit_token_hash: string | null;
  change_brief_id: string | null;
  canonical_plan_digest: string | null;
}

const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
// GitHub ids arrive as numbers in some payloads and strings in others.
const str = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : typeof v === "number" && Number.isSafeInteger(v) ? String(v) : null;

export function buildDeployReadback(result: EstablishResult | null, exp: ReadbackExpectations): DeployReadback {
  const response = obj(result?.response);
  const ee = obj(response?.["effect_establishment"]);
  const observation = obj(ee?.["observation"]);
  const evidence = obj(observation?.["evidence"]);
  const auth = obj(evidence?.["authorization"]);
  const plan = obj(evidence?.["verified_plan"]);
  const mutation = obj(evidence?.["native_mutation"]);
  const revision = obj(evidence?.["causal_revision"]);
  const currentness = obj(evidence?.["artifact_currentness"]);
  const runtimeVerdict = str(ee?.["verdict"]);

  const record: DeployReadback = {
    schema: "atlasent.deploy_readback.v1",
    verdict: "incomplete",
    reason: "",
    source: response ? "runtime_establish_effect" : "none",
    runtime_state: result?.state ?? "none",
    runtime_verdict: runtimeVerdict,
    operation_id: str(response?.["operation_id"]),
    attempt_id: str(ee?.["attempt_id"]),
    requested_operation_id: exp.operationId,
    requested_attempt_id: exp.attemptId,
    workflow_run_id: str(evidence?.["workflow_run_id"]),
    // The native status's deployment only: never the revision's or the one this action located.
    deployment_id: str(mutation?.["deployment_id"]),
    deployment_status_id: str(mutation?.["status_id"]),
    deployment_state: str(mutation?.["state"]),
    deployment_occurred_at: str(mutation?.["occurred_at"]),
    // Observed at the mutation, never the authorized plan's own value.
    head_sha: str(revision?.["head_sha"]),
    base_sha: str(plan?.["base_sha"]),
    environment: str(revision?.["environment"]),
    evaluation_id: str(auth?.["evaluation_id"]),
    decision_id: str(auth?.["decision_id"]),
    permit_token_hash: str(auth?.["permit_token_hash"]),
    change_brief_id: str(auth?.["change_brief_id"]),
    canonical_plan_digest: str(plan?.["canonical_plan_digest"]) ?? str(auth?.["canonical_plan_digest"]),
  };
  const done = (verdict: ReadbackVerdict, reason: string): DeployReadback => ({ ...record, verdict, reason });

  if (!result || !response) return done("incomplete", "no runtime response");

  // The deploy job did not succeed: the action reported that and nothing more,
  // so "failed" stands only once the runtime has a terminal, non-success state.
  if (exp.deployJobResult !== "success") {
    if (result.state === "failed" || result.state === "unknown") {
      return done("failed", `deploy job ${exp.deployJobResult}; runtime recorded ${result.state}`);
    }
    return done("incomplete", `deploy job ${exp.deployJobResult}; runtime state ${result.state} is not terminal`);
  }

  if (runtimeVerdict === "mismatch") {
    return done("mismatch", `runtime: ${str(ee?.["reason"]) ?? str(observation?.["reason"]) ?? "observation is not the admitted effect"}`);
  }
  if (!result.established || runtimeVerdict !== "established") {
    return done("incomplete", `runtime did not establish the effect (state=${result.state}${result.reason ? `, reason=${result.reason}` : ""})`);
  }
  if (!evidence || !auth || !mutation || str(evidence["version"]) !== "github_causal_continuity.v1") {
    return done("incomplete", "the runtime established the effect but returned no causal-continuity evidence to correlate");
  }

  const disagreements: string[] = [];
  const check = (name: string, actual: string | null, expected: string | undefined) => {
    if (expected === undefined || expected === "") return;
    if (actual === null) disagreements.push(`${name} absent from evidence`);
    else if (actual.toLowerCase() !== expected.toLowerCase()) disagreements.push(`${name} ${actual} != expected ${expected}`);
  };
  if (!revision || !currentness) {
    return done("incomplete", "the runtime returned no observed revision or artifact-currentness record, so the deployed artifact cannot be tied to the plan");
  }
  if (record.deployment_state !== "success") disagreements.push(`native deployment state ${record.deployment_state ?? "absent"}`);
  if (currentness["matches_verified_plan"] !== true) disagreements.push("artifact does not match the verified plan");
  // Both runtime-side ids are required: a comparison with an absent side would be skipped.
  const revisionDeployment = str(revision["deployment_id"]);
  if (record.deployment_id === null || revisionDeployment === null) {
    disagreements.push("the native status or the observed revision names no deployment");
  } else if (record.deployment_id !== revisionDeployment) {
    disagreements.push(`status deployment ${record.deployment_id} != revision deployment ${revisionDeployment}`);
  }
  // The deployment this action located for the deploy job must be the one the runtime observed.
  check("deployment_id (located for the deploy job)", record.deployment_id, result.deploymentId ?? undefined);
  check("operation_id", record.operation_id, exp.operationId);
  // Compared when the runtime echoes it. Absence is tolerated for now (see attempt_id).
  if (record.attempt_id !== null && record.attempt_id !== exp.attemptId) {
    disagreements.push(`attempt_id ${record.attempt_id} != requested ${exp.attemptId}`);
  }
  check("environment", record.environment, exp.environment);
  check("workflow_run_id", record.workflow_run_id, exp.runId);
  check("head_sha", record.head_sha, exp.headSha);
  check("base_sha", record.base_sha, exp.baseSha);
  check("evaluation_id", record.evaluation_id, exp.evaluationId);
  check("permit_token_hash", record.permit_token_hash, exp.permitHash);
  if (disagreements.length) return done("mismatch", disagreements.join("; "));

  const unchecked = [
    exp.evaluationId ? null : "evaluation_id",
    exp.permitHash ? null : "permit_token_hash",
    record.attempt_id !== null ? null : "attempt_id (runtime did not echo it; checked server-side only)",
  ].filter(Boolean);
  return done(
    "verified",
    `runtime established the effect from GitHub records${unchecked.length ? `; not cross-checked against this workflow: ${unchecked.join(", ")}` : ""}`,
  );
}

export function deployReadbackSummary(r: DeployReadback): string {
  const row = (k: string, v: string | null) => `| ${k} | ${v === null || v === "" ? "—" : `\`${v}\``} |`;
  return [
    `### AtlaSent deploy readback: **${r.verdict}**`,
    "",
    r.reason,
    "",
    "| Field | Value |",
    "|---|---|",
    row("source", r.source),
    row("runtime state / verdict", `${r.runtime_state} / ${r.runtime_verdict ?? "none"}`),
    row("workflow run", r.workflow_run_id),
    row("deployment / status", r.deployment_id ? `${r.deployment_id} / ${r.deployment_status_id ?? "?"} (${r.deployment_state ?? "?"})` : null),
    row("head / base", r.head_sha || r.base_sha ? `${r.head_sha ?? "?"} / ${r.base_sha ?? "?"}` : null),
    row("environment", r.environment),
    row("evaluation", r.evaluation_id),
    row("permit hash", r.permit_token_hash),
    row("operation / attempt (runtime)", `${r.operation_id ?? "—"} / ${r.attempt_id ?? "not echoed"}`),
    row("requested operation / attempt", `${r.requested_operation_id} / ${r.requested_attempt_id}`),
    "",
  ].join("\n");
}
