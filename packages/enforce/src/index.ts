// @atlasent/enforce — fail-closed execution wrapper.
//
// Enforces the evaluate → verify → verifyPermit → execute contract:
//   1. evaluate()     — calls POST /v1-evaluate; any infra error blocks execution
//   2. verify()       — rejects non-allow decisions (deny / hold / escalate)
//   3. verifyPermit() — calls POST /v1-verify-permit; replay/expired tokens block
//   4. enforce()      — composes all three; fn never runs unless all steps pass

import { post, get } from "./transport";
import { functionRegionHeaders } from "./functionRegion";

const DEFAULT_API_URL = "https://api.atlasent.io";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Additive ADR-055 acceptance-lane hint (atlasent-api's `signing_hint` on an
 * INSUFFICIENT_APPROVALS deny, or a two-stage lifecycle class's escalate
 * outcome): the server-computed binding a caller must reproduce EXACTLY to
 * mint a valid `approval_artifact.v1` / `approval_quorum.v1` for THIS
 * specific request. `action_hash` cannot be reverse-engineered by the
 * caller (the server hashes the fully enriched context, not the raw
 * request), so this is the only way to bind a correct artifact.
 */
export interface ApprovalSigningHint {
  assertion_type: string;
  bind: {
    action_hash: string;
    tenant_id: string;
    environment: string;
    required_role?: string;
    required_roles?: string[];
  };
}

/**
 * Edge-function region for runtime calls. Undefined: ATLASENT_FUNCTION_REGION,
 * then us-west-1 for the hosted runtime (see ./functionRegion). "auto" or null:
 * unpinned. Otherwise a region id such as "us-west-1".
 */
type FunctionRegionOption = { functionRegion?: string | null };

/** Authorization plus region headers for one runtime request. */
function runtimeHeaders(
  config: { apiKey: string } & FunctionRegionOption,
  url: string,
): Record<string, string> {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    ...functionRegionHeaders(url, config.functionRegion),
  };
}

export interface EnforceConfig extends FunctionRegionOption {
  apiKey: string;
  apiUrl?: string;
  action: string;
  actor: string;
  /**
   * Runtime-minted actor_identity.v1 assertion for the calling workload.
   * Sent as a canonical top-level evaluate field, and re-presented at
   * verify-permit (atlasent-api#3915: required there only for action classes
   * classified `verified_actor`). The library never builds or mutates this
   * envelope; its signature and request binding are verified by the runtime.
   */
  actorIdentity?: Record<string, unknown>;
  /**
   * Runtime-minted assertion.v1 envelopes (e.g. a `supply_chain` assertion for
   * artifact.release). Sent unchanged as the top-level evaluate `assertions`
   * array; the runtime verifies each one.
   */
  assertions?: Record<string, unknown>[];
  /**
   * Top-level `resource_id`. Evaluate binds a resource-subject assertion only
   * to this field, so it is required when `assertions` name a resource.
   */
  resourceId?: string;
  environment?: string;
  targetId?: string;
  resource?: {
    type: string;
    id?: string;
    attributes?: Record<string, unknown>;
  };
  current_state?: { description: string; attributes?: Record<string, unknown> };
  proposed_state?: { description: string; attributes?: Record<string, unknown> };
  execution_binding?: {
    kind: string;
    adapter_version?: string;
    resource_id?: string;
    enforcement_point?: string;
  };
  context?: Record<string, unknown>;
  /** Top-level body field required when the action class has requires_state_snapshot=true.
   *  Must be sent alongside context, not nested inside it. */
  state_snapshot?: {
    source?: string;
    source_kind?: string;
    complete?: boolean;
    run_id?: string;
    payload?: unknown;
  };
  /**
   * Structured facts from which the runtime independently derives the
   * execution binding for mandatory change-control actions. This is a
   * canonical top-level evaluate field; it must never be buried in context.
   */
  changePlan?: {
    operation: string;
    revision?: string;
    artifact_ref?: string;
  };
  /**
   * Typed solo-operator compensating-control evidence for action types
   * OUTSIDE the four mandatory-change-control types `changePlan` covers
   * (production.deploy, infrastructure.change, production.rollback,
   * secret.configuration.change). A canonical top-level evaluate field —
   * never buried in context — mirroring `changePlan`'s own contract. See
   * atlasent-api `_shared/solo-operator-evidence-profile.ts` for the
   * supported `kind`s (`control_override`, `access_grant`) and their
   * required fields. Only meaningful together with a fresh
   * `context.solo_operator_compensating_control` trigger and a prior
   * `solo-operator-attest` step recording the SAME evidence.
   */
  evidenceProfile?: Record<string, unknown>;
  /**
   * SHA-256 digest of the artifact being authorized (canonical input, NOT
   * presentation metadata). Sent to evaluate as the top-level
   * `execution_payload_hash`, which the runtime binds into the permit
   * (`execution_hash_expected`). Re-presented at verify time as `payload_hash`
   * — a permit issued for one artifact then presented for another fails with
   * `PAYLOAD_MISMATCH`. This is what stops a workflow evaluating one artifact
   * and executing a different one.
   */
  executionPayloadHash?: string;
  /**
   * Wire bindings that MUST appear on the verify-permit body, or verification is
   * refused BEFORE the network round-trip (fail-closed). Guarantees the execution
   * boundary re-presents what the permit was issued for — an unbound verify that a
   * cross-item / wrong-environment / substituted permit could satisfy is refused,
   * not sent. Values are the wire keys: "environment" | "target_id" | "payload_hash".
   */
  requiredBindings?: Array<"environment" | "target_id" | "payload_hash">;
  /**
   * A caller-assembled `approval_quorum.v1` (or a single `{artifact: ...}`
   * `approval` envelope — see `approval` below), sent verbatim as the
   * evaluate request's top-level `quorum` field. This package does not
   * build or interpret it; it is opaque cargo. Normally populated by the
   * `onInsufficientApprovals` retry below rather than supplied up front.
   */
  quorum?: Record<string, unknown>;
  /** A single-artifact `{artifact: ApprovalArtifactV1}` envelope, sent as
   *  the evaluate request's top-level `approval` field. Mutually exclusive
   *  with `quorum` in practice (the runtime accepts either shape), but this
   *  package sends both if both happen to be set — the caller decides
   *  which to populate. */
  approval?: Record<string, unknown>;
  /**
   * ADR-055 two-call acceptance lane. When the FIRST evaluate() response is
   * `deny` with `deny_code === "INSUFFICIENT_APPROVALS"` and carries a
   * `signing_hint`, `evaluate()` calls this callback with that hint AND the
   * denied response's own `evaluationId` (request_id/evaluation_id — see
   * mapDecision below) — a caller minting real evidence from that hint
   * needs to name WHICH evaluate() call it is evidence for (e.g.
   * atlasent-api's v1-github-approval-mint requires `evaluation_id` in its
   * body precisely so it can independently bind the minted artifact to
   * that original call's own persisted context, rather than trusting a
   * bare caller-supplied action_hash). A non-undefined return value is sent
   * as `quorum` on ONE automatic retry evaluate() call (never more than
   * one — see the recursion guard in evaluate() below); an
   * undefined/thrown result returns the original deny unchanged. This lets
   * a caller (e.g. atlasent-action's githubApprovalMint wiring) mint real
   * evidence bound to the server-computed action_hash without
   * restructuring its own call sites — both `evaluate(config)` directly
   * and the composed `enforce(config, fn)` get the retry transparently,
   * since both funnel through evaluate() here.
   */
  onInsufficientApprovals?: (
    hint: ApprovalSigningHint,
    evaluationId: string | undefined,
  ) => Promise<Record<string, unknown> | undefined>;
}

export interface Decision {
  decision: "allow" | "deny" | "hold" | "escalate";
  evaluationId?: string;
  permitToken?: string;
  proofHash?: string;
  /**
   * The artifact digest the RUNTIME bound into the permit at evaluate time
   * (`execution_hash_expected`, echoed on the evaluate response). When present it
   * is re-presented at verify as `payload_hash` in preference to any caller-supplied
   * digest — so verify checks the ORIGINAL evaluated artifact, not a re-supplied one.
   */
  executionHashExpected?: string;
  riskScore?: number;
  denyReason?: string;
  /** Machine deny code (e.g. INSUFFICIENT_APPROVALS), present on deny. */
  denyCode?: string;
  /**
   * Additive remediation hint the runtime attaches to common, safe-to-disclose
   * denies — tells the caller how to fix it. Surfaced verbatim; never used for
   * a decision.
   */
  remediation?: { summary?: string; how_to?: string[]; docs?: string };
  holdReason?: string;
  /** Resolved risk class from the evaluation (critical / high / medium / low). */
  risk_class?: string;
  /** WHY this was allowed — kind + reference ID (policy, quorum, emergency, etc.). */
  authority_basis?: { kind: string; reference?: string; granted_by?: string; rationale?: string };
  /**
   * Present iff decision === "hold". ID of the HITL escalation auto-created by
   * the control plane. Poll GET /v1/hitl/{id} for resolution.
   */
  escalation_id?: string;
  /**
   * Present on hold/escalate decisions that create a linked approval_requests
   * row (see v1-evaluate/handler.ts). Poll GET /v1/approvals/{id} — via
   * waitForApprovalResolution() below — for the human resolution and, on
   * approve, the fresh re-evaluation permit token.
   */
  approvalRequestId?: string;
  /** v1.1 audit chain fields — present when the API returns them. */
  chainEntry?: Record<string, unknown> | null;
  snapshot?: Record<string, unknown> | null;
  auditHash?: string;
}

export interface VerifyPermitResult {
  verified: boolean;
  outcome?: string;
  /** Signed decision audit hash echoed by the runtime after permit verification. */
  auditHash?: string;
  /** Hash of the verification audit event emitted while consuming the permit. */
  verifyAuditHash?: string;
  /** Precise runtime wire code (e.g. PAYLOAD_MISMATCH, PERMIT_EXPIRED). */
  verifyErrorCode?: string;
  /** Fields that diverged between the presented context and the bound permit. */
  mismatchFields?: string[];
}

export type EnforcePhase = "evaluate" | "verify" | "verify-permit" | "execute";

export class EnforceError extends Error {
  readonly phase: EnforcePhase;
  readonly decision: Decision | null;
  /** Coarse verify outcome (verified | mismatch | expired | replay_blocked | invalid | …). */
  readonly outcome?: string;
  /** Precise verify wire code, when the failure came from verify-permit. */
  readonly verifyErrorCode?: string;
  readonly mismatchFields?: string[];

  constructor(
    message: string,
    phase: EnforcePhase,
    decision: Decision | null = null,
    details?: { outcome?: string; verifyErrorCode?: string; mismatchFields?: string[] },
  ) {
    super(message);
    this.name = "EnforceError";
    this.phase = phase;
    this.decision = decision;
    this.outcome = details?.outcome;
    this.verifyErrorCode = details?.verifyErrorCode;
    this.mismatchFields = details?.mismatchFields;
  }
}

// ---------------------------------------------------------------------------
// Step 1 — evaluate
// ---------------------------------------------------------------------------

export async function evaluate(config: EnforceConfig): Promise<Decision> {
  const apiUrl = (config.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");

  // Separate state_snapshot out of context if the caller mistakenly nested it there.
  const rawContext = { ...config.context };
  const contextSnapshot = rawContext["state_snapshot"] as EnforceConfig["state_snapshot"] | undefined;
  delete rawContext["state_snapshot"];

  const payload: Record<string, unknown> = {
    action_type: config.action,
    actor_id: config.actor,
    context: {
      // Keep environment in context for backward compat with older control plane versions.
      ...(config.environment ? { environment: config.environment } : {}),
      ...(config.targetId ? { target_id: config.targetId } : {}),
      ...rawContext,
    },
  };
  if (config.actorIdentity != null) payload["actor_identity"] = config.actorIdentity;
  if (config.assertions != null && config.assertions.length > 0) payload["assertions"] = config.assertions;
  if (config.resourceId) payload["resource_id"] = config.resourceId;
  // Top-level fields forwarded to the control plane's EvaluateRequest.
  if (config.environment != null) payload["environment"] = config.environment;
  if (config.resource != null) payload["resource"] = config.resource;
  else if (config.targetId) payload["target_id"] = config.targetId;
  if (config.current_state != null) payload["current_state"] = config.current_state;
  if (config.proposed_state != null) payload["proposed_state"] = config.proposed_state;
  if (config.execution_binding != null) payload["execution_binding"] = config.execution_binding;
  // state_snapshot is a top-level body field (EvaluateBody.state_snapshot), not inside context.
  const snap = config.state_snapshot ?? contextSnapshot;
  if (snap != null) payload["state_snapshot"] = snap;
  if (config.changePlan != null) payload["change_plan"] = config.changePlan;
  if (config.evidenceProfile != null) payload["evidence_profile"] = config.evidenceProfile;
  if (config.quorum != null) payload["quorum"] = config.quorum;
  if (config.approval != null) payload["approval"] = config.approval;
  // Artifact digest is a canonical top-level input — the runtime binds it into
  // the permit (execution_hash_expected). Never buried in context/presentation.
  if (config.executionPayloadHash != null) {
    payload["execution_payload_hash"] = config.executionPayloadHash;
  }

  let status: number;
  let body: string;
  try {
    ({ status, body } = await post(`${apiUrl}/v1-evaluate`, JSON.stringify(payload), runtimeHeaders(config, apiUrl)));
  } catch (err) {
    throw new EnforceError(
      `AtlaSent API unreachable: ${err instanceof Error ? err.message : String(err)}`,
      "evaluate",
    );
  }

  if (status >= 500) {
    throw new EnforceError(`Infrastructure failure (HTTP ${status})`, "evaluate");
  }
  if (status === 401 || status === 403) {
    throw new EnforceError(`Authentication failed (HTTP ${status})`, "evaluate");
  }
  if (status === 429) {
    throw new EnforceError("Rate limited (HTTP 429)", "evaluate");
  }
  if (status < 200 || status >= 300) {
    throw new EnforceError(`Unexpected response (HTTP ${status})`, "evaluate");
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new EnforceError("Non-JSON response from AtlaSent API", "evaluate");
  }

  const decision = mapDecision(raw);

  // ADR-055 two-call acceptance lane (see EnforceConfig.onInsufficientApprovals
  // above). `config.onInsufficientApprovals` is stripped on the retry call
  // below, so this branch can only ever fire once per original evaluate()
  // invocation — no unbounded recursion, no double-mint on a callback that
  // itself denies.
  if (
    decision.decision === "deny" &&
    decision.denyCode === "INSUFFICIENT_APPROVALS" &&
    config.onInsufficientApprovals &&
    raw["signing_hint"] != null &&
    typeof raw["signing_hint"] === "object"
  ) {
    const hint = raw["signing_hint"] as ApprovalSigningHint;
    let quorum: Record<string, unknown> | undefined;
    try {
      quorum = await config.onInsufficientApprovals(hint, decision.evaluationId);
    } catch {
      // The callback failing to produce evidence is not itself a new
      // failure mode — fall through and return the original deny, same as
      // "the callback declined."
      quorum = undefined;
    }
    if (quorum) {
      return evaluate({ ...config, quorum, onInsufficientApprovals: undefined });
    }
  }

  return decision;
}

// ---------------------------------------------------------------------------
// Step 2 — verify (decision check — no HTTP call)
// ---------------------------------------------------------------------------

/**
 * The text to show for a deny. v1-evaluate withholds `deny_reason` for
 * deny codes outside its `safe` disclosure tier (ADR-024: the free text could
 * reveal which rule or role a caller failed), but it always sends `deny_code`.
 * Reading only `denyReason` therefore reported "no reason provided" for, e.g.,
 * ACTOR_NOT_ALLOWED, when the runtime had named the failed rule.
 */
export function denyReasonText(
  decision: Pick<Decision, "denyReason" | "denyCode"> | null | undefined,
): string {
  if (decision?.denyReason) return decision.denyReason;
  if (decision?.denyCode) {
    return `${decision.denyCode} (the runtime withholds the reason text for this deny code)`;
  }
  return "no reason provided";
}

export function verify(decision: Decision): void {
  switch (decision.decision) {
    case "allow":
      return;
    case "deny":
      throw new EnforceError(
        `Denied: ${denyReasonText(decision)}`,
        "verify",
        decision,
      );
    case "hold":
      throw new EnforceError(
        `On hold: ${decision.holdReason ?? "awaiting approval"}`,
        "verify",
        decision,
      );
    case "escalate":
      throw new EnforceError("Escalated — manual review required", "verify", decision);
    default:
      throw new EnforceError(
        `Unknown decision: ${String((decision as Decision).decision)}`,
        "verify",
        decision,
      );
  }
}

// ---------------------------------------------------------------------------
// Step 2b — waitForApprovalResolution (pause-and-resume approval protocol)
//
// For a hold/escalate decision that carries approvalRequestId (see
// mapDecision below), poll GET /v1/approvals/{id} on the runtime API —
// atlasent-api's v1-approvals endpoint — on a bounded interval/timeout for
// the human resolution. That status poll never carries the raw permit token
// (server-side redesign: a broadly-row-readable table must not hand one out
// off a plain GET) — on "approved" this function makes one further call,
// POST /v1/approvals/{id}/claim-permit, an atomic one-time claim (see
// claimApprovalPermit above). Returns only on a terminal, non-"pending"
// status:
//   - status "approved" / "approved_awaiting_claim": the caller should verify the returned permitToken
//     (via verifyPermit — same fail-closed re-verification as any other
//     allow) before proceeding. permitToken is undefined either if the
//     approval was accepted but the runtime's own reevaluation did not
//     itself produce a fresh allow (see IMPL-026A in atlasent-api), or if
//     the claim lost a race to a concurrent poller — the caller MUST treat
//     an approved status with no permitToken as non-allow either way.
//   - any other status ("denied", "denied_by_timeout", "expired", or any
//     future value the server reports): the caller must fail closed. This
//     function does not interpret those further — it is not this layer's
//     job to special-case status strings it doesn't recognize as allow.
//
// Any network/auth error, or exceeding maxWaitMs, also fails closed via a
// thrown EnforceError — never a silent "treat as allow".
// ---------------------------------------------------------------------------

const APPROVAL_POLL_INTERVAL_MS = 5_000;

export interface WaitForApprovalConfig extends FunctionRegionOption {
  apiKey: string;
  apiUrl?: string;
  /** decision.approvalRequestId from the original hold/escalate evaluate() response. */
  approvalId: string;
  /** Bounded wait — required, no default. Exceeding it throws (fail closed). */
  maxWaitMs: number;
  /**
   * Builds the POST /v1/approvals/{id}/claim-permit body, called once, at
   * claim time (never earlier — a short-lived actor_identity.v1 minted at
   * evaluate time may have expired while a human was deciding).
   *
   * Omit for the legacy claim (body `{}`), which is what every
   * non-mandatory-change-control action sends. For a mandatory
   * change-control action (production.deploy, infrastructure.change, ...)
   * the caller supplies `{ actor_identity, change_plan }`: the executor's
   * OWN freshly minted identity plus the SAME change plan it sent at
   * evaluate, so the runtime's claim-time reevaluation (IMPL-026B) runs
   * against the executor and refuses a changed plan (409
   * change_plan_mismatch).
   *
   * If this throws, the wait fails closed with an EnforceError — no claim is
   * attempted with a partial or empty body.
   */
  buildClaimBody?: (row: ApprovalClaimContext) => Promise<Record<string, unknown>>;
}

/** What the status poll told us about a claimable approval. */
export interface ApprovalClaimContext {
  /** "approved" or "approved_awaiting_claim". */
  status: string;
  /**
   * IMPL-026B: the binding.environment the claimer's actor_identity.v1 must
   * carry, when the runtime reports one (approved_awaiting_claim rows).
   */
  claimEnvironment?: string;
}

export interface ApprovalResolution {
  /** Raw server status: "approved" | "approved_awaiting_claim" | "denied" | "denied_by_timeout" | "expired" | ... */
  status: string;
  reEvaluationDecision?: string;
  /**
   * Only present when the approval was claimable AND the claim actually
   * returned a fresh permit (claimed: true).
   */
  permitToken?: string;
  /**
   * The claimed permit's runtime-bound execution hash
   * (`execution_hash_expected` on the claim response). The caller must
   * re-present it as `payload_hash` at verify; for a production permit
   * without it, verify fails PAYLOAD_HASH_REQUIRED. Absent when the claim
   * response did not carry it — the caller decides whether that is fatal.
   */
  executionHashExpected?: string;
  /** The claim-time reevaluation's evaluation id (`re_evaluation_id`), when reported. */
  reEvaluationId?: string;
  /**
   * Why a claim was attempted but produced no permit: the runtime's error
   * code (e.g. "change_plan_mismatch", "claim_in_progress"), "HTTP <n>",
   * "not_claimed" (200 with claimed:false), "malformed_response", or
   * "unreachable". Diagnostic only — absence of permitToken is what makes
   * the outcome non-allow.
   */
  claimFailure?: string;
}

/** Statuses on which a permit can be claimed. Everything else is terminal non-allow. */
const CLAIMABLE_APPROVAL_STATUSES = new Set(["approved", "approved_awaiting_claim"]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One-time claim of the fresh permit token minted by an approved
 * resolution. Called exactly once, right after the status poll observes a
 * claimable status ("approved", or IMPL-026B's "approved_awaiting_claim",
 * whose reevaluation runs AT claim time against the claimer's identity) —
 * see waitForApprovalResolution below.
 *
 * Never throws for a claim outcome: network/parse failure, a non-200
 * response (including 409 change_plan_mismatch), or `claimed: false` all
 * return no permitToken plus a `claimFailure` code. The caller already
 * treats a resolution with no permitToken as non-allow, so under-claiming
 * here is the safe direction — it can never turn a denial into an allow.
 * The one thing that DOES throw is a failure to build the claim body
 * (buildClaimBody): an unbuildable body means the executor could not prove
 * who it is, and that is reported as such rather than silently claiming
 * with `{}`.
 */
async function claimApprovalPermit(
  config: WaitForApprovalConfig,
  apiUrl: string,
  row: ApprovalClaimContext,
): Promise<
  Pick<
    ApprovalResolution,
    "permitToken" | "executionHashExpected" | "claimFailure" | "reEvaluationDecision" | "reEvaluationId"
  >
> {
  const url = `${apiUrl}/v1/approvals/${encodeURIComponent(config.approvalId)}/claim-permit`;
  let requestBody = "{}";
  if (config.buildClaimBody) {
    let built: Record<string, unknown>;
    try {
      built = await config.buildClaimBody(row);
    } catch (err) {
      throw new EnforceError(
        `Approval claim refused before sending: could not build the claim body ` +
          `(${err instanceof Error ? err.message : String(err)}) — failing closed`,
        "evaluate",
      );
    }
    requestBody = JSON.stringify(built);
  }
  let status: number;
  let body: string;
  try {
    ({ status, body } = await post(url, requestBody, runtimeHeaders(config, url)));
  } catch {
    return { claimFailure: "unreachable" };
  }
  let raw: Record<string, unknown> | undefined;
  try {
    const parsed: unknown = JSON.parse(body);
    raw = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    raw = undefined;
  }
  if (status !== 200) {
    const code = raw && typeof raw["error"] === "string" ? (raw["error"] as string) : `HTTP ${status}`;
    return { claimFailure: code };
  }
  if (!raw) return { claimFailure: "malformed_response" };
  const reEvaluationDecision =
    typeof raw["re_evaluation_decision"] === "string" ? (raw["re_evaluation_decision"] as string) : undefined;
  const permitToken = raw["permit_token"];
  if (raw["claimed"] !== true || typeof permitToken !== "string" || permitToken.length === 0) {
    return { claimFailure: "not_claimed", reEvaluationDecision };
  }
  const hash = raw["execution_hash_expected"];
  const reEvaluationId = raw["re_evaluation_id"];
  return {
    permitToken,
    reEvaluationDecision,
    executionHashExpected: typeof hash === "string" && hash.length > 0 ? hash : undefined,
    reEvaluationId: typeof reEvaluationId === "string" && reEvaluationId.length > 0 ? reEvaluationId : undefined,
  };
}

export async function waitForApprovalResolution(
  config: WaitForApprovalConfig,
): Promise<ApprovalResolution> {
  if (!config.approvalId) {
    throw new EnforceError(
      "Cannot wait for approval: no approvalRequestId on the hold/escalate decision",
      "evaluate",
    );
  }
  const apiUrl = (config.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
  const url = `${apiUrl}/v1/approvals/${encodeURIComponent(config.approvalId)}`;
  const deadline = Date.now() + config.maxWaitMs;

  while (Date.now() < deadline) {
    let status: number;
    let body: string;
    try {
      ({ status, body } = await get(url, runtimeHeaders(config, url)));
    } catch {
      // Transient network failure — swallow and retry on the next tick,
      // same posture as the evaluate()/verifyPermit() infra-error path
      // (those fail closed immediately because they're one-shot; this is
      // a bounded poll loop, so a single transient failure doesn't need
      // to burn the whole wait window).
      await sleep(APPROVAL_POLL_INTERVAL_MS);
      continue;
    }

    if (status === 401 || status === 403) {
      throw new EnforceError(`Approval status poll: authentication failed (HTTP ${status})`, "evaluate");
    }
    if (status === 404) {
      throw new EnforceError("Approval status poll: approval request not found", "evaluate");
    }
    if (status === 200) {
      let raw: Record<string, unknown>;
      try {
        raw = JSON.parse(body) as Record<string, unknown>;
      } catch {
        // Malformed response — treat like any other transient failure, retry.
        await sleep(APPROVAL_POLL_INTERVAL_MS);
        continue;
      }
      const rowStatus = raw["status"] as string | undefined;
      if (rowStatus && rowStatus !== "pending") {
        const polledReEvaluationDecision = raw["re_evaluation_decision"] as string | undefined;
        // The status poll never carries the raw permit token (server-side
        // redesign: a broadly-row-readable table must not hand out a live
        // bearer off a plain GET). On a claimable status, claim it exactly
        // once via the companion claim-permit endpoint — an atomic,
        // first-claim-wins operation server-side, so a concurrent second
        // poller/claim gets no re-served token. "approved_awaiting_claim"
        // (IMPL-026B) is claimable too: nothing is authorized until the
        // claim-time reevaluation runs against the claimer's identity.
        // Every other terminal status (denied, denied_by_timeout, expired,
        // revoked, ...) never had a token to claim.
        if (!CLAIMABLE_APPROVAL_STATUSES.has(rowStatus)) {
          return { status: rowStatus, reEvaluationDecision: polledReEvaluationDecision };
        }
        const claimEnvironment =
          typeof raw["claim_environment"] === "string" ? (raw["claim_environment"] as string) : undefined;
        const claim = await claimApprovalPermit(config, apiUrl, { status: rowStatus, claimEnvironment });
        return {
          status: rowStatus,
          reEvaluationDecision: claim.reEvaluationDecision ?? polledReEvaluationDecision,
          permitToken: claim.permitToken,
          ...(claim.executionHashExpected ? { executionHashExpected: claim.executionHashExpected } : {}),
          ...(claim.reEvaluationId ? { reEvaluationId: claim.reEvaluationId } : {}),
          ...(claim.claimFailure ? { claimFailure: claim.claimFailure } : {}),
        };
      }
      // status === "pending" (or absent) — keep polling.
    }
    // Any other HTTP status: treat as transient (5xx, rate limit, etc.) and retry
    // within the bounded window; the deadline check above is the real backstop.
    await sleep(APPROVAL_POLL_INTERVAL_MS);
  }

  throw new EnforceError(
    `Approval wait timed out after ${config.maxWaitMs}ms with no human resolution — failing closed`,
    "evaluate",
  );
}

/** Evaluate-context keys that v1-verify-permit re-checks against signed
 *  permit claims, and that therefore must be re-presented at verify. */
export const CLOUD_LOCUS_CONTEXT_KEYS = ["aws", "azure"] as const;

// ---------------------------------------------------------------------------
// Step 3 — verifyPermit (calls /v1-verify-permit, fail-closed)
//
// Without this round-trip the enforce wrapper is evaluate-only: a tampered or
// replayed permit_token would still surface decision=allow. This step consumes
// the token — downstream re-verify returns outcome=permit_consumed.
// ---------------------------------------------------------------------------

interface RawVerify {
  valid?: boolean;
  verified?: boolean; // legacy field name — accepted for backward compat
  outcome?: string;
  verify_error_code?: string;
  mismatch_fields?: string[];
  audit_entry_hash?: string;
  verify_audit_hash?: string;
}

/**
 * Shared HTTP core for permit verification. Sends the permit token AND re-binds
 * the execution context (environment, target, artifact digest) so verification
 * checks the caller is executing the SAME artifact/environment the permit was
 * issued for. Returns a normalized result (does not throw on verified=false —
 * the caller applies the fail-closed decision).
 */
async function postVerify(
  config: EnforceConfig,
  permitToken: string,
  decision: Decision | null,
): Promise<VerifyPermitResult> {
  const apiUrl = (config.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");

  const bodyObj: Record<string, unknown> = {
    permit_token: permitToken,
    action_type: config.action,
    actor_id: config.actor,
  };
  if (config.environment != null) bodyObj["environment"] = config.environment;
  if (config.targetId != null) bodyObj["target_id"] = config.targetId;
  // Re-present the caller's runtime-minted actor_identity.v1 at the commit
  // point (atlasent-api#3915). v1-verify-permit checks it only for an action
  // class classified `verified_actor`, binding it to the PERMIT's actor,
  // action, tenant and environment; every other class ignores it. Sending it
  // is what lets a class be classified verified_actor without denying every
  // run (atlasent-api docs/design/EXECUTION_PRINCIPAL_BINDING.md, rollout
  // rule 3). The caller must pass an assertion that is still valid at verify
  // time; this function never re-mints one.
  if (config.actorIdentity != null) bodyObj["actor_identity"] = config.actorIdentity;
  // Prefer the runtime-bound original evaluated digest (execution_hash_expected,
  // echoed on the decision) over a caller-supplied one, so verify re-presents the
  // artifact the permit was actually issued for — not one re-supplied at verify time.
  const payloadHash = decision?.executionHashExpected ?? config.executionPayloadHash;
  if (payloadHash != null) bodyObj["payload_hash"] = payloadHash;

  // Re-present the cloud execution locus. When the evaluate context carried
  // `aws` or `azure`, v1-evaluate signed those values into the permit
  // (aws_account_id/aws_region, azure_subscription_id/azure_resource_group)
  // and v1-verify-permit requires the SAME values under `context` at verify,
  // treating an absent locus as a mismatch (AWS_LOCUS_MISMATCH /
  // AZURE_LOCUS_MISMATCH). Before this, no verify body carried `context`, so
  // every cloud-scoped permit failed verification. Only these two keys are
  // sent: the rest of the evaluate context is not a verify input.
  const locus: Record<string, unknown> = {};
  for (const key of CLOUD_LOCUS_CONTEXT_KEYS) {
    const value = config.context?.[key];
    if (value != null) locus[key] = value;
  }
  if (Object.keys(locus).length > 0) bodyObj["context"] = locus;

  // Fail closed: if the caller declared bindings as required, refuse to verify —
  // BEFORE the network round-trip — when any is absent or empty. A permit gate that
  // silently drops its environment / target / artifact binding is the exact
  // substitution hole this closes. verify-error-code MISSING_BINDING.
  const missing = (config.requiredBindings ?? []).filter(
    (b) => bodyObj[b] == null || bodyObj[b] === "",
  );
  if (missing.length > 0) {
    throw new EnforceError(
      `verify-permit refused: required binding(s) absent: ${missing.join(", ")}`,
      "verify-permit",
      decision,
      { outcome: "invalid", verifyErrorCode: "MISSING_BINDING" },
    );
  }

  let status: number;
  let body: string;
  try {
    ({ status, body } = await post(`${apiUrl}/v1-verify-permit`, JSON.stringify(bodyObj), runtimeHeaders(config, apiUrl)));
  } catch (err) {
    throw new EnforceError(
      `verify-permit unreachable: ${err instanceof Error ? err.message : String(err)}`,
      "verify-permit",
      decision,
    );
  }

  if (status >= 500) {
    throw new EnforceError(`verify-permit infrastructure failure (HTTP ${status})`, "verify-permit", decision);
  }
  if (status < 200 || status >= 300) {
    throw new EnforceError(`verify-permit failed (HTTP ${status})`, "verify-permit", decision);
  }

  let raw: RawVerify;
  try {
    raw = JSON.parse(body) as RawVerify;
  } catch {
    throw new EnforceError("Non-JSON response from verify-permit", "verify-permit", decision);
  }

  // Runtime wire field is `valid`; older responses used `verified`. Accept both.
  const ok = raw.valid ?? raw.verified;
  return {
    verified: ok === true,
    outcome: raw.outcome,
    auditHash: raw.audit_entry_hash,
    verifyAuditHash: raw.verify_audit_hash,
    verifyErrorCode: raw.verify_error_code,
    mismatchFields: Array.isArray(raw.mismatch_fields) ? raw.mismatch_fields : undefined,
  };
}

/**
 * Derive the `requiredBindings` set from the bindings actually provided for a
 * decision/item — "re-present at verify exactly what was bound at evaluate."
 * A binding that is present at evaluate but absent at verify then fails closed
 * (MISSING_BINDING) instead of silently dropping off the wire. Empty strings do
 * not count as present.
 */
export function requiredBindingsFor(b: {
  environment?: string;
  targetId?: string;
  executionPayloadHash?: string;
}): Array<"environment" | "target_id" | "payload_hash"> {
  const r: Array<"environment" | "target_id" | "payload_hash"> = [];
  if (b.environment != null && b.environment !== "") r.push("environment");
  if (b.targetId != null && b.targetId !== "") r.push("target_id");
  if (b.executionPayloadHash != null && b.executionPayloadHash !== "") r.push("payload_hash");
  return r;
}

export async function verifyPermit(
  config: EnforceConfig,
  decision: Decision,
): Promise<VerifyPermitResult> {
  if (!decision.permitToken) {
    throw new EnforceError(
      "evaluate returned allow but no permit_token — refusing to execute without verifiable permit",
      "verify-permit",
      decision,
    );
  }

  const r = await postVerify(config, decision.permitToken, decision);
  if (!r.verified) {
    // outcome=replay_blocked (replay), expired, mismatch (wrong artifact/env), etc.
    throw new EnforceError(
      `Permit verification failed (outcome=${r.outcome ?? "unknown"}${r.verifyErrorCode ? `, code=${r.verifyErrorCode}` : ""})`,
      "verify-permit",
      decision,
      { outcome: r.outcome, verifyErrorCode: r.verifyErrorCode, mismatchFields: r.mismatchFields },
    );
  }
  return r;
}

// ---------------------------------------------------------------------------
// Step 3b — reverifyPermit (re-verify at the EXECUTION BOUNDARY)
//
// Re-verify an already-issued permit immediately before the protected step,
// independent of the gate that issued it — so a workflow cannot evaluate one
// artifact and execute another, and a missing / modified / expired / replayed /
// context-mismatched permit fails closed AT THE BOUNDARY. Pass the artifact
// digest via config.executionPayloadHash and the environment via config.environment.
// ---------------------------------------------------------------------------

export async function reverifyPermit(
  config: EnforceConfig,
  permitToken: string,
): Promise<VerifyPermitResult> {
  if (!permitToken || !permitToken.trim()) {
    throw new EnforceError(
      "no permit_token presented at execution boundary — refusing to execute",
      "verify-permit",
      null,
      { outcome: "invalid", verifyErrorCode: "MISSING_PERMIT" },
    );
  }
  const r = await postVerify(config, permitToken, null);
  if (!r.verified) {
    throw new EnforceError(
      `Permit re-verification failed at execution boundary (outcome=${r.outcome ?? "unknown"}${r.verifyErrorCode ? `, code=${r.verifyErrorCode}` : ""})`,
      "verify-permit",
      null,
      { outcome: r.outcome, verifyErrorCode: r.verifyErrorCode, mismatchFields: r.mismatchFields },
    );
  }
  return r;
}

// ---------------------------------------------------------------------------
// Step 4 — enforce (evaluate → verify → verifyPermit → execute, fail-closed)
// ---------------------------------------------------------------------------

export async function enforce<T>(
  config: EnforceConfig,
  fn: () => Promise<T>,
): Promise<{ result: T; decision: Decision; verifyOutcome?: string }> {
  const decision = await evaluate(config);   // throws EnforceError → fn never runs
  verify(decision);                          // throws EnforceError → fn never runs
  const vp = await verifyPermit(config, decision); // throws EnforceError → fn never runs
  const result = await fn();
  return { result, decision, verifyOutcome: vp.outcome };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function mapDecision(raw: Record<string, unknown>): Decision {
  return {
    decision: raw["decision"] as Decision["decision"],
    // The real /v1-evaluate response field is `request_id` (see
    // v1-evaluate/handler.ts's `return json({ ..., request_id: effectiveRequestId, ... })`
    // — confirmed by direct source read; `evaluation_id` is never a key on the
    // HTTP response body, only an internal DB column name on approval_requests
    // and similar tables). Reading only `evaluation_id` left Decision.evaluationId
    // permanently undefined for every real evaluate call (#130). `evaluation_id`
    // is kept as a fallback in case an older or alternate response shape ever
    // emits it, same defensive-dual-name pattern this function already uses for
    // auditHash below.
    evaluationId: (raw["request_id"] ?? raw["evaluation_id"]) as string | undefined,
    permitToken: raw["permit_token"] as string | undefined,
    proofHash: raw["proof_hash"] as string | undefined,
    executionHashExpected: (raw["execution_hash_expected"] ?? raw["payload_hash"]) as
      | string
      | undefined,
    riskScore: extractRiskScore(raw),
    denyReason: raw["deny_reason"] as string | undefined,
    denyCode: raw["deny_code"] as string | undefined,
    remediation: raw["remediation"] as Decision["remediation"] | undefined,
    holdReason: raw["hold_reason"] as string | undefined,
    risk_class: raw["risk_class"] as string | undefined,
    authority_basis: raw["authority_basis"] as Decision["authority_basis"],
    escalation_id: raw["escalation_id"] as string | undefined,
    approvalRequestId: raw["approval_request_id"] as string | undefined,
    chainEntry: (raw["chain_entry"] as Record<string, unknown> | null | undefined) ?? null,
    snapshot: (raw["snapshot"] as Record<string, unknown> | null | undefined) ?? null,
    // Real wire field is `audit_entry_hash` (see v1-evaluate/handler.ts and
    // v1-verify-permit/handler.ts). `audit_hash` is accepted too in case an
    // older API build still emits it, but it does not exist on the current
    // response shape — reading only that name left the `audit-hash` action
    // output permanently empty.
    auditHash: (raw["audit_entry_hash"] ?? raw["audit_hash"]) as string | undefined,
  };
}

function extractRiskScore(raw: Record<string, unknown>): number | undefined {
  const risk = raw["risk"];
  if (risk && typeof risk === "object" && "score" in risk) {
    const score = (risk as { score?: unknown }).score;
    if (typeof score === "number") return score;
  }
  const flat = raw["risk_score"];
  if (typeof flat === "number") return flat;
  return undefined;
}

export {
  DEFAULT_FUNCTION_REGION,
  FUNCTION_REGION_ENV,
  FUNCTION_REGION_HEADER,
  FunctionRegionConfigError,
  HOSTED_RUNTIME_HOSTS,
  functionRegionHeaders,
  parseFunctionRegion,
  resolveFunctionRegion,
} from "./functionRegion";
