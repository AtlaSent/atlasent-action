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
type FunctionRegionOption = {
    functionRegion?: string | null;
};
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
    environment?: string;
    targetId?: string;
    resource?: {
        type: string;
        id?: string;
        attributes?: Record<string, unknown>;
    };
    current_state?: {
        description: string;
        attributes?: Record<string, unknown>;
    };
    proposed_state?: {
        description: string;
        attributes?: Record<string, unknown>;
    };
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
    onInsufficientApprovals?: (hint: ApprovalSigningHint, evaluationId: string | undefined) => Promise<Record<string, unknown> | undefined>;
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
    remediation?: {
        summary?: string;
        how_to?: string[];
        docs?: string;
    };
    holdReason?: string;
    /** Resolved risk class from the evaluation (critical / high / medium / low). */
    risk_class?: string;
    /** WHY this was allowed — kind + reference ID (policy, quorum, emergency, etc.). */
    authority_basis?: {
        kind: string;
        reference?: string;
        granted_by?: string;
        rationale?: string;
    };
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
export declare class EnforceError extends Error {
    readonly phase: EnforcePhase;
    readonly decision: Decision | null;
    /** Coarse verify outcome (verified | mismatch | expired | replay_blocked | invalid | …). */
    readonly outcome?: string;
    /** Precise verify wire code, when the failure came from verify-permit. */
    readonly verifyErrorCode?: string;
    readonly mismatchFields?: string[];
    constructor(message: string, phase: EnforcePhase, decision?: Decision | null, details?: {
        outcome?: string;
        verifyErrorCode?: string;
        mismatchFields?: string[];
    });
}
export declare function evaluate(config: EnforceConfig): Promise<Decision>;
/**
 * The text to show for a deny. v1-evaluate withholds `deny_reason` for
 * deny codes outside its `safe` disclosure tier (ADR-024: the free text could
 * reveal which rule or role a caller failed), but it always sends `deny_code`.
 * Reading only `denyReason` therefore reported "no reason provided" for, e.g.,
 * ACTOR_NOT_ALLOWED, when the runtime had named the failed rule.
 */
export declare function denyReasonText(decision: Pick<Decision, "denyReason" | "denyCode"> | null | undefined): string;
export declare function verify(decision: Decision): void;
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
export declare function waitForApprovalResolution(config: WaitForApprovalConfig): Promise<ApprovalResolution>;
/** Evaluate-context keys that v1-verify-permit re-checks against signed
 *  permit claims, and that therefore must be re-presented at verify. */
export declare const CLOUD_LOCUS_CONTEXT_KEYS: readonly ["aws", "azure"];
/**
 * Derive the `requiredBindings` set from the bindings actually provided for a
 * decision/item — "re-present at verify exactly what was bound at evaluate."
 * A binding that is present at evaluate but absent at verify then fails closed
 * (MISSING_BINDING) instead of silently dropping off the wire. Empty strings do
 * not count as present.
 */
export declare function requiredBindingsFor(b: {
    environment?: string;
    targetId?: string;
    executionPayloadHash?: string;
}): Array<"environment" | "target_id" | "payload_hash">;
export declare function verifyPermit(config: EnforceConfig, decision: Decision): Promise<VerifyPermitResult>;
export declare function reverifyPermit(config: EnforceConfig, permitToken: string): Promise<VerifyPermitResult>;
export declare function enforce<T>(config: EnforceConfig, fn: () => Promise<T>): Promise<{
    result: T;
    decision: Decision;
    verifyOutcome?: string;
}>;
export { DEFAULT_FUNCTION_REGION, FUNCTION_REGION_ENV, FUNCTION_REGION_HEADER, FunctionRegionConfigError, HOSTED_RUNTIME_HOSTS, functionRegionHeaders, parseFunctionRegion, resolveFunctionRegion, } from "./functionRegion";
