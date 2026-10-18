// Execution admission and effect establishment for an Azure ARM deployment
// run from Azure DevOps Pipelines: the two runtime steps that come after an
// evaluate-only permit is issued (ADR-075 Execution Admission, ADR-076 Effect
// Establishment, Azure Production Change Gate Slice 3).
//
//   admitAzureOperation       POST v1-consequential-operations/consume-and-admit
//                             with provider "azure" and context.azure. The
//                             runtime verifies the permit WITHOUT consuming it,
//                             then consumes it AND admits a durable operation +
//                             attempt in one transaction. The deployment step
//                             may run only after this returns both ids.
//
//   recordAzureEffect         POST v1-azure-effect-verify with the deployment's
//                             correlation id. AtlaSent reads Azure's own
//                             Activity Log (with its own credentials) and
//                             records an observation. The caller chooses none
//                             of the scope.
//
//   establishAzureEffect      POST v1-consequential-operations/establish-effect
//                             with { operation_id, attempt_id,
//                             azure_observation_id }. The RUNTIME decides
//                             whether the observation is the admitted effect.
//
// This module never authorizes anything and never reports success itself:
// "established" is returned only when the runtime answers state "succeeded"
// with verdict "established". Every other answer, every transport error and
// every malformed body fails closed.

import { createHash } from "crypto";
import { functionRegionHeaders } from "@atlasent/enforce";

export const AZURE_PROVIDER = "azure";
export const AZURE_DEPLOYMENT_WRITE_OPERATION = "Microsoft.Resources/deployments/write";
const DEFAULT_API_URL = "https://api.atlasent.io/functions/v1";
const PAYLOAD_HASH_RE = /^[0-9a-f]{64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AzureLocus {
  subscription_id: string;
  resource_group: string;
  deployment_name?: string;
}

export class AzureOperationError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null,
    /** True when the request may have committed with the response lost. */
    readonly outcomeUnknown = false,
    /** A plain runtime code (verify_error_code, error code, reason) when one was sent. */
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "AzureOperationError";
  }
}

export interface Deps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

function base(apiUrl: string | undefined): string {
  return (apiUrl ?? DEFAULT_API_URL).replace(/\/+$/, "");
}

function headers(apiUrl: string, apiKey: string): Record<string, string> {
  return {
    ...functionRegionHeaders(apiUrl),
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** A bounded, single-line summary of a runtime error body. Never echoes a token. */
export function boundedDetail(json: Record<string, unknown> | null, text: string): string {
  if (json) {
    const parts = [json["error_code"] ?? json["error"], json["message"] ?? json["reason"]].filter(
      (v) => typeof v === "string" && v.trim(),
    ) as string[];
    if (parts.length) return parts.join(": ").replace(/\s+/g, " ").slice(0, 400);
  }
  return text.replace(/\s+/g, " ").trim().slice(0, 400);
}

function plainCode(v: unknown): string | null {
  return typeof v === "string" && /^[A-Za-z][A-Za-z0-9_:.-]{0,127}$/.test(v) ? v : null;
}

/** Deterministic per permit: a retried step re-presents the same key, so the
 *  runtime refuses a second admission instead of forking a second operation.
 *  The permit itself never leaves this process; only a digest of it does. */
export function admissionOperationKey(permitToken: string): string {
  return `ado-permit:${createHash("sha256").update(permitToken).digest("hex").slice(0, 40)}`;
}

/** The ARM deployment resource id the locus names (lowercased, as the runtime compares it). */
export function deploymentResourceId(locus: AzureLocus): string {
  if (!locus.deployment_name) throw new Error("locus has no deployment_name");
  return (
    `/subscriptions/${locus.subscription_id.toLowerCase()}/resourcegroups/${locus.resource_group.toLowerCase()}` +
    `/providers/microsoft.resources/deployments/${locus.deployment_name.toLowerCase()}`
  );
}

// ── Admission ──────────────────────────────────────────────────────────────

export interface AdmitArgs {
  apiUrl?: string;
  apiKey: string;
  permitToken: string;
  actionType: string;
  actorId: string;
  targetId: string;
  environment: string;
  /** The permit's payload binding: the evaluate-only step's executionHash output. */
  payloadHash: string;
  azure: AzureLocus;
}

export interface AdmitResult {
  operationId: string;
  attemptId: string;
  operationKey: string;
  decisionId: string | null;
}

export async function admitAzureOperation(args: AdmitArgs, deps: Deps = {}): Promise<AdmitResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const apiUrl = base(args.apiUrl);
  if (!PAYLOAD_HASH_RE.test(args.payloadHash)) {
    throw new AzureOperationError(
      "admission needs the permit's payload binding as 64-char lowercase hex (the executionHash output of the " +
        "evaluate-only step); none was supplied",
      null,
      false,
      "MISSING_BINDING",
    );
  }
  if (!args.azure.deployment_name) {
    // Without a bound deployment the runtime can never establish the effect,
    // so the operation would stay open forever. Refuse before spending.
    throw new AzureOperationError(
      "admission needs azureDeploymentName: the runtime establishes an Azure effect only for the ARM deployment the " +
        "decision named",
      null,
      false,
      "MISSING_BINDING",
    );
  }
  const operationKey = admissionOperationKey(args.permitToken);
  const body = {
    permit_token: args.permitToken,
    action_type: args.actionType,
    actor_id: args.actorId,
    target_id: args.targetId,
    environment: args.environment,
    payload_hash: args.payloadHash,
    operation_key: operationKey,
    provider: AZURE_PROVIDER,
    provider_idempotency_key: `azure_deployment:${deploymentResourceId(args.azure)}`,
    // Only the locus is a verify input; the runtime forwards exactly these two
    // strings to the permit's AZURE_LOCUS binding check.
    context: { azure: { subscription_id: args.azure.subscription_id, resource_group: args.azure.resource_group } },
  };

  let res: Response;
  try {
    res = await fetchImpl(`${apiUrl}/v1-consequential-operations/consume-and-admit`, {
      method: "POST",
      headers: headers(apiUrl, args.apiKey),
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new AzureOperationError(
      `admission request failed in transit (${err instanceof Error ? err.message : String(err)}); the outcome is ` +
        `unknown. Do not deploy and do not mint a fresh permit until operation_key=${operationKey} has been looked up`,
      null,
      true,
      "ADMISSION_OUTCOME_UNKNOWN",
    );
  }
  const text = await res.text();
  const json = parseJson(text);
  if (!res.ok) {
    const unknown = res.status === 503 && /admission_outcome_unknown/.test(text);
    throw new AzureOperationError(
      `admission refused (HTTP ${res.status}): ${boundedDetail(json, text)}` +
        (unknown ? ` — the outcome is unknown; look up operation_key=${operationKey} before any retry` : ""),
      res.status,
      unknown,
      unknown
        ? "ADMISSION_OUTCOME_UNKNOWN"
        : (plainCode(json?.["verify_error_code"]) ?? plainCode(json?.["error_code"] ?? json?.["error"]) ?? "ADMISSION_REFUSED"),
    );
  }
  if (!json) {
    throw new AzureOperationError("admission returned a non-JSON success body", res.status, true, "ADMISSION_OUTCOME_UNKNOWN");
  }
  const operationId = str(json["operation_id"]);
  const attemptId = str(json["attempt_id"]);
  if (!operationId || !attemptId) {
    throw new AzureOperationError(
      "admission returned no operation_id/attempt_id; the deployment must not run",
      res.status,
      true,
      "ADMISSION_OUTCOME_UNKNOWN",
    );
  }
  return { operationId, attemptId, operationKey, decisionId: str(json["decision_id"]) };
}

// ── Recording a non-success outcome ──────────────────────────────────────────

export type DeploymentOutcome = "succeeded" | "failed" | "unknown";

/**
 * Map an Azure DevOps job/step status (Agent.JobStatus or a custom value) to
 * the outcome reported for the attempt. Anything unrecognized is "unknown",
 * never "succeeded".
 */
export function normalizeDeploymentOutcome(raw: string | undefined): DeploymentOutcome {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "succeeded" || v === "success" || v === "succeededwithissues") return "succeeded";
  if (v === "failed" || v === "failure") return "failed";
  return "unknown";
}

/** A failed/unknown deployment is reported as such. Non-success never needs proof. */
export async function recordNonSuccess(
  args: { apiUrl?: string; apiKey: string; operationId: string; attemptId: string; outcome: "failed" | "unknown"; detail: string },
  deps: Deps = {},
): Promise<{ status: number; state: string | null }> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const apiUrl = base(args.apiUrl);
  let res: Response;
  try {
    res = await fetchImpl(`${apiUrl}/v1-consequential-operations/record-attempt`, {
      method: "POST",
      headers: headers(apiUrl, args.apiKey),
      body: JSON.stringify({
        operation_id: args.operationId,
        attempt_id: args.attemptId,
        outcome: args.outcome === "failed" ? "failure" : "unknown",
        observation: { source: "atlasent-azure-devops-task", deployment_outcome: args.detail },
      }),
    });
  } catch {
    return { status: 0, state: null };
  }
  const json = parseJson(await res.text());
  return { status: res.status, state: str(json?.["state"]) };
}

// ── Activity Log observation ─────────────────────────────────────────────────

export interface Observation {
  id: string;
  outcome: string;
  operationBound: boolean;
  reasons: string[];
}

function readObservation(json: Record<string, unknown> | null): Observation | null {
  const o = json?.["observation"];
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  const id = str(r["id"]);
  const outcome = str(r["outcome"]);
  if (!id || !UUID_RE.test(id) || !outcome) return null;
  return {
    id,
    outcome,
    operationBound: r["operation_bound"] === true,
    reasons: Array.isArray(r["reasons"]) ? (r["reasons"] as unknown[]).filter((x): x is string => typeof x === "string") : [],
  };
}

export interface RecordEffectArgs {
  apiUrl?: string;
  apiKey: string;
  /** The evaluate-only step's evaluationId output (the decision's request_id). */
  requestId: string;
  /** The ARM deployment's correlation id (az deployment group create … --query properties.correlationId). */
  correlationId: string;
  /** Total time to keep asking while Azure has not yet surfaced the event. */
  waitMs: number;
  /** Pause between polls while the observation is `unknown`. */
  pollMs?: number;
}

/**
 * Ask AtlaSent to read Azure's Activity Log for the deployment and record an
 * observation. Polls only while the answer is `unknown` (not seen yet).
 * Returns the observation only when it is `verified` AND bound to the ARM
 * deployment the decision named; throws on everything else.
 */
export async function recordAzureEffect(args: RecordEffectArgs, deps: Deps = {}): Promise<Observation> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => Date.now());
  const apiUrl = base(args.apiUrl);
  if (!UUID_RE.test(args.correlationId)) {
    throw new AzureOperationError("correlationId must be the ARM deployment's correlation id (a GUID)", null, false, "BAD_CORRELATION_ID");
  }
  const body = JSON.stringify({
    request_id: args.requestId,
    operation_name: AZURE_DEPLOYMENT_WRITE_OPERATION,
    correlation_id: args.correlationId.toLowerCase(),
  });
  const pollMs = args.pollMs ?? 30_000;
  const deadline = now() + args.waitMs;
  let attempt = 0;
  for (;;) {
    attempt++;
    let res: Response;
    try {
      res = await fetchImpl(`${apiUrl}/v1-azure-effect-verify`, { method: "POST", headers: headers(apiUrl, args.apiKey), body });
    } catch (err) {
      throw new AzureOperationError(
        `v1-azure-effect-verify unreachable (${err instanceof Error ? err.message : String(err)})`,
        null,
        false,
        "EFFECT_VERIFY_UNREACHABLE",
      );
    }
    const text = await res.text();
    const json = parseJson(text);
    if (!res.ok) {
      throw new AzureOperationError(
        `v1-azure-effect-verify refused (HTTP ${res.status}): ${boundedDetail(json, text)}`,
        res.status,
        false,
        plainCode(json?.["error_code"] ?? json?.["error"]) ?? "EFFECT_VERIFY_REFUSED",
      );
    }
    const obs = readObservation(json);
    if (!obs) {
      throw new AzureOperationError("v1-azure-effect-verify returned no usable observation", res.status, false, "EFFECT_VERIFY_MALFORMED");
    }
    if (obs.outcome === "mismatch") {
      throw new AzureOperationError(
        `Azure's Activity Log does not match the allowed decision (observation ${obs.id}` +
          (obs.reasons.length ? `: ${obs.reasons.join(", ").slice(0, 300)}` : "") + ")",
        res.status,
        false,
        "AZURE_EFFECT_MISMATCH",
      );
    }
    if (obs.outcome === "verified") {
      if (!obs.operationBound) {
        throw new AzureOperationError(
          `the Activity Log shows an operation in the authorized scope, but not bound to the ARM deployment this ` +
            `decision named (observation ${obs.id})`,
          res.status,
          false,
          "AZURE_EFFECT_UNBOUND",
        );
      }
      return obs;
    }
    if (obs.outcome !== "unknown") {
      throw new AzureOperationError(`v1-azure-effect-verify returned outcome "${obs.outcome}"`, res.status, false, "EFFECT_VERIFY_MALFORMED");
    }
    const remaining = deadline - now();
    if (remaining <= 0) {
      throw new AzureOperationError(
        `the deployment did not appear in Azure's Activity Log within the wait budget (${attempt} attempt(s); last ` +
          `observation ${obs.id} was unknown)`,
        res.status,
        false,
        "AZURE_EFFECT_UNKNOWN",
      );
    }
    await sleep(Math.min(pollMs, remaining));
  }
}

// ── Establishment ───────────────────────────────────────────────────────────

export interface EstablishArgs {
  apiUrl?: string;
  apiKey: string;
  operationId: string;
  attemptId: string;
  observationId: string;
}

export interface EstablishResult {
  /** True only when the runtime answered state "succeeded" with verdict "established". */
  established: boolean;
  state: string;
  verdict: string | null;
  reason: string | null;
  httpStatus: number;
}

export async function establishAzureEffect(args: EstablishArgs, deps: Deps = {}): Promise<EstablishResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const apiUrl = base(args.apiUrl);
  let res: Response;
  try {
    res = await fetchImpl(`${apiUrl}/v1-consequential-operations/establish-effect`, {
      method: "POST",
      headers: headers(apiUrl, args.apiKey),
      body: JSON.stringify({
        operation_id: args.operationId,
        attempt_id: args.attemptId,
        azure_observation_id: args.observationId,
      }),
    });
  } catch (err) {
    return {
      established: false,
      state: "establish_unreachable",
      verdict: null,
      reason: err instanceof Error ? err.message : String(err),
      httpStatus: 0,
    };
  }
  const text = await res.text();
  const json = parseJson(text);
  const ee = json?.["effect_establishment"] as Record<string, unknown> | undefined;
  const state = str(json?.["state"]) ?? `establish_http_${res.status}`;
  const verdict = str(ee?.["verdict"]);
  const established = res.status === 200 && state === "succeeded" && verdict === "established";
  return {
    established,
    state,
    verdict,
    reason: str(ee?.["reason"]) ?? (established ? null : boundedDetail(json, text) || null),
    httpStatus: res.status,
  };
}
