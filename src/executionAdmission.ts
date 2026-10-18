// Execution admission and effect establishment for a GitHub Actions deploy:
// the two runtime steps that come after a permit is issued (ADR-075
// Execution Admission, ADR-076 Effect Establishment).
//
//   admitExecution        POST v1-consequential-operations/consume-and-admit.
//                         Verifies the permit WITHOUT consuming it, then
//                         consumes it AND admits a durable operation + attempt
//                         in ONE transaction. Commits THIS workflow run as the
//                         admitted run (provider_idempotency_key
//                         "github_actions_run:<run_id>"), before the deploy
//                         runs. Replaces a consuming verify-permit at the
//                         boundary: a runner lost mid-deploy can no longer
//                         leave a spent permit with no record of the attempt.
//
//   establishDeployEffect POST v1-consequential-operations/establish-effect.
//                         The RUNTIME reads GitHub's own records for the
//                         run, deployment and status (through the org's App
//                         installation) and decides whether the authorized
//                         change actually happened. This module only finds
//                         where to look; it never reports success itself.
//                         A failed or cancelled deploy job is reported as
//                         failure/unknown through record-attempt, which never
//                         needs proof.
//
// Admission must run in an EARLIER job than the deploy job that declares
// `environment:` (GitHub creates that job's deployment when it starts, and a
// deployment that predates admission can never establish the effect). Both
// jobs share one run id, so the commitment still names the run that deploys.
//
// This module never authorizes anything. A refusal at any step fails closed
// and the caller's deploy must not run (admission) or must not be reported
// as verified (establishment).

import { createHash } from "crypto";
import { functionRegionHeaders } from "@atlasent/enforce";

const GITHUB_API_DEFAULT = "https://api.github.com";
const PAYLOAD_HASH_RE = /^[0-9a-f]{64}$/;

export class ExecutionAdmissionError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null,
    /** True when the admission may have committed with the response lost. */
    readonly outcomeUnknown = false,
    /** The runtime's verify_error_code for a refused admission (PAYLOAD_MISMATCH,
     *  ENVIRONMENT_MISMATCH, PERMIT_ALREADY_USED, ...), when it sent one. */
    readonly verifyErrorCode: string | null = null,
  ) {
    super(message);
    this.name = "ExecutionAdmissionError";
  }
}

/** Deterministic per permit: a retried step re-presents the same key, so the
 *  runtime refuses a second admission instead of forking a second operation.
 *  The permit itself never leaves this process; only a digest of it does. */
export function admissionOperationKey(permitToken: string): string {
  return `gha-permit:${createHash("sha256").update(permitToken).digest("hex").slice(0, 40)}`;
}

export function permitTokenHash(permitToken: string): string {
  return createHash("sha256").update(permitToken).digest("hex");
}

export interface AdmitArgs {
  apiUrl: string;
  apiKey: string;
  permitToken: string;
  actionType: string;
  actorId: string;
  targetId: string;
  environment: string;
  /** Bare 64-char lowercase hex: the runtime execution hash (mandatory change
   *  control) or the normalized artifact digest (others). */
  payloadHash: string;
  runId: string;
  executorActorIdentity?: Record<string, unknown>;
}

export interface AdmitResult {
  operationId: string;
  attemptId: string;
  operationKey: string;
  decisionId: string | null;
  auditId: string | null;
}

interface Deps {
  fetchImpl?: typeof fetch;
}

/** The runtime's verify_error_code from a refusal body, if it is a plain code. */
function refusalVerifyErrorCode(text: string): string | null {
  try {
    const code = (JSON.parse(text) as Record<string, unknown>)["verify_error_code"];
    return typeof code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

function boundedDetail(text: string): string {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const code = parsed["error_code"] ?? parsed["error"];
    const message = parsed["message"] ?? parsed["reason"];
    const parts = [code, message].filter((v) => typeof v === "string" && v.trim()) as string[];
    if (parts.length) return parts.join(": ").slice(0, 400);
  } catch {
    // fall through to the raw body
  }
  return text.trim().slice(0, 400);
}

export async function admitExecution(args: AdmitArgs, deps: Deps = {}): Promise<AdmitResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const apiUrl = args.apiUrl.replace(/\/+$/, "");
  if (!PAYLOAD_HASH_RE.test(args.payloadHash)) {
    throw new ExecutionAdmissionError(
      "admission needs the permit's payload binding as 64-char lowercase hex (the execution-hash " +
        "output of the gate, or a sha256 artifact-digest); none was supplied",
      null,
    );
  }
  if (!/^[0-9]+$/.test(args.runId)) {
    throw new ExecutionAdmissionError(`GITHUB_RUN_ID "${args.runId}" is not a run id`, null);
  }
  const operationKey = admissionOperationKey(args.permitToken);
  const body: Record<string, unknown> = {
    permit_token: args.permitToken,
    action_type: args.actionType,
    actor_id: args.actorId,
    target_id: args.targetId,
    environment: args.environment,
    payload_hash: args.payloadHash,
    operation_key: operationKey,
    provider: "github_actions",
    provider_idempotency_key: `github_actions_run:${args.runId}`,
    ...(args.executorActorIdentity ? { executor_actor_identity: args.executorActorIdentity } : {}),
  };

  let response: Response;
  try {
    response = await fetchImpl(`${apiUrl}/v1-consequential-operations/consume-and-admit`, {
      method: "POST",
      headers: {
        ...functionRegionHeaders(apiUrl),
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    // The request may or may not have reached the runtime.
    throw new ExecutionAdmissionError(
      `admission request failed in transit (${error instanceof Error ? error.message : String(error)}); ` +
        `the outcome is unknown — look up operation_key=${operationKey} before minting a fresh permit`,
      null,
      true,
    );
  }
  const text = await response.text();
  if (!response.ok) {
    const unknown = response.status === 503 && /admission_outcome_unknown/.test(text);
    throw new ExecutionAdmissionError(
      `admission refused (HTTP ${response.status}): ${boundedDetail(text)}` +
        (unknown ? ` — the outcome is unknown; look up operation_key=${operationKey} before any retry` : ""),
      response.status,
      unknown,
      unknown ? null : refusalVerifyErrorCode(text),
    );
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ExecutionAdmissionError("admission returned a non-JSON success body", response.status, true);
  }
  const operationId = typeof parsed["operation_id"] === "string" ? parsed["operation_id"] : "";
  const attemptId = typeof parsed["attempt_id"] === "string" ? parsed["attempt_id"] : "";
  if (!operationId || !attemptId) {
    // A 200 without both identifiers cannot be trusted as an admission.
    throw new ExecutionAdmissionError(
      "admission returned no operation_id/attempt_id; the deploy must not run",
      response.status,
      true,
    );
  }
  return {
    operationId,
    attemptId,
    operationKey,
    decisionId: typeof parsed["decision_id"] === "string" ? parsed["decision_id"] : null,
    auditId: typeof parsed["audit_id"] === "string" ? parsed["audit_id"] : null,
  };
}

// ── Effect establishment ────────────────────────────────────────────────────

export type DeployJobResult = "success" | "failure" | "cancelled" | "skipped" | string;

export interface EstablishArgs {
  apiUrl: string;
  apiKey: string;
  githubToken: string;
  githubApiUrl?: string;
  repository: string;
  runId: string;
  operationId: string;
  attemptId: string;
  /** `needs.<deploy-job>.result` of the job that performed the deploy. */
  deployJobResult: DeployJobResult;
  /** Name of the deploy job as GitHub reports it (the job's `name:`, or its id). */
  deployJobName: string;
  /** The GitHub Environment the deploy job declared. */
  githubEnvironment: string;
  baseSha: string;
  headSha: string;
  ref?: string | null;
  /** Poll schedule while GitHub has not yet posted a terminal status. */
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}

export interface EstablishResult {
  /** "succeeded" only when the runtime established the effect itself. */
  state: string;
  established: boolean;
  deploymentId: string | null;
  reason: string | null;
  response: Record<string, unknown> | null;
}

async function githubJson(
  fetchImpl: typeof fetch,
  url: string,
  token: string,
): Promise<unknown> {
  const res = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    throw new ExecutionAdmissionError(`GitHub API ${res.status} for ${url.replace(/\?.*$/, "")}`, res.status);
  }
  return res.json();
}

/**
 * The deployment THIS run's deploy job created: a deployment of headSha to
 * the job's environment whose status log/target URL names this run and that
 * job's id. Matching on the job id keeps another job's environment deployment
 * in the same run (same commit) from ever being picked.
 */
export async function findDeploymentForJob(
  args: Pick<EstablishArgs, "githubToken" | "githubApiUrl" | "repository" | "runId" | "deployJobName" | "githubEnvironment" | "headSha">,
  deps: Deps = {},
): Promise<string> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const api = `${(args.githubApiUrl ?? GITHUB_API_DEFAULT).replace(/\/+$/, "")}/repos/${args.repository}`;
  const jobs = (await githubJson(fetchImpl, `${api}/actions/runs/${args.runId}/jobs?per_page=100`, args.githubToken)) as {
    jobs?: Array<{ id?: number; name?: string }>;
  };
  const matching = (jobs.jobs ?? []).filter((j) => j.name === args.deployJobName && typeof j.id === "number");
  if (matching.length !== 1) {
    throw new ExecutionAdmissionError(
      `expected exactly one job named "${args.deployJobName}" in run ${args.runId}, found ${matching.length}`,
      null,
    );
  }
  const jobUrlFragment = `/actions/runs/${args.runId}/job/${matching[0].id}`;
  const deployments = (await githubJson(
    fetchImpl,
    `${api}/deployments?sha=${encodeURIComponent(args.headSha)}&environment=${encodeURIComponent(args.githubEnvironment)}&per_page=30`,
    args.githubToken,
  )) as Array<{ id?: number }>;
  const found: string[] = [];
  for (const d of Array.isArray(deployments) ? deployments : []) {
    if (typeof d.id !== "number") continue;
    const statuses = (await githubJson(fetchImpl, `${api}/deployments/${d.id}/statuses?per_page=100`, args.githubToken)) as Array<{
      log_url?: string | null;
      target_url?: string | null;
    }>;
    if ((Array.isArray(statuses) ? statuses : []).some((s) => (s.log_url ?? s.target_url ?? "").includes(jobUrlFragment))) {
      found.push(String(d.id));
    }
  }
  if (found.length !== 1) {
    throw new ExecutionAdmissionError(
      `expected exactly one "${args.githubEnvironment}" deployment of ${args.headSha} naming run ${args.runId} ` +
        `job ${matching[0].id}, found ${found.length}`,
      null,
    );
  }
  return found[0];
}

async function postRuntime(
  fetchImpl: typeof fetch,
  apiUrl: string,
  apiKey: string,
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const base = apiUrl.replace(/\/+$/, "");
  const res = await fetchImpl(`${base}/v1-consequential-operations/${path}`, {
    method: "POST",
    headers: {
      ...functionRegionHeaders(base),
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

const RETRYABLE_REASON = /^(deployment_in_progress|workflow_run_not_completed)/;

export async function establishDeployEffect(args: EstablishArgs, deps: Deps = {}): Promise<EstablishResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = args.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  // A deploy that did not succeed is reported as such. Non-success never
  // needs proof, and nothing here can turn it into success.
  if (args.deployJobResult !== "success") {
    const outcome = args.deployJobResult === "failure" ? "failure" : "unknown";
    const r = await postRuntime(fetchImpl, args.apiUrl, args.apiKey, "record-attempt", {
      operation_id: args.operationId,
      attempt_id: args.attemptId,
      outcome,
      observation: { source: "atlasent-action", job: args.deployJobName, job_result: args.deployJobResult },
    });
    return {
      state: typeof r.json?.["state"] === "string" ? (r.json["state"] as string) : `record_attempt_http_${r.status}`,
      established: false,
      deploymentId: null,
      reason: `deploy job result: ${args.deployJobResult}`,
      response: r.json,
    };
  }

  const deploymentId = await findDeploymentForJob(args, deps);
  const body = {
    operation_id: args.operationId,
    attempt_id: args.attemptId,
    deployment_id: deploymentId,
    run_id: args.runId,
    verified_plan: {
      repository: args.repository,
      base_sha: args.baseSha,
      head_sha: args.headSha,
      ref: args.ref ?? null,
    },
  };
  const delays = args.retryDelaysMs ?? [10_000, 10_000, 10_000, 10_000, 10_000];
  let last: { status: number; json: Record<string, unknown> | null } = { status: 0, json: null };
  for (let i = 0; i <= delays.length; i++) {
    last = await postRuntime(fetchImpl, args.apiUrl, args.apiKey, "establish-effect", body);
    if (last.status === 200) break;
    const ee = last.json?.["effect_establishment"] as Record<string, unknown> | undefined;
    const reason = typeof ee?.["reason"] === "string" ? (ee["reason"] as string) : "";
    if (!RETRYABLE_REASON.test(reason) || i === delays.length) break;
    await sleep(delays[i]);
  }
  const state = typeof last.json?.["state"] === "string" ? (last.json["state"] as string) : "";
  const ee = last.json?.["effect_establishment"] as Record<string, unknown> | undefined;
  return {
    state: state || `establish_http_${last.status}`,
    established: last.status === 200 && state === "succeeded",
    deploymentId,
    reason: typeof ee?.["reason"] === "string" ? (ee["reason"] as string) : (last.json ? boundedDetail(JSON.stringify(last.json)) : null),
    response: last.json,
  };
}
