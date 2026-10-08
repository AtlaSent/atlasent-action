"use strict";
// @atlasent/enforce — fail-closed execution wrapper.
//
// Enforces the evaluate → verify → verifyPermit → execute contract:
//   1. evaluate()     — calls POST /v1-evaluate; any infra error blocks execution
//   2. verify()       — rejects non-allow decisions (deny / hold / escalate)
//   3. verifyPermit() — calls POST /v1-verify-permit; replay/expired tokens block
//   4. enforce()      — composes all three; fn never runs unless all steps pass
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveFunctionRegion = exports.parseFunctionRegion = exports.functionRegionHeaders = exports.HOSTED_RUNTIME_HOSTS = exports.FunctionRegionConfigError = exports.FUNCTION_REGION_HEADER = exports.FUNCTION_REGION_ENV = exports.DEFAULT_FUNCTION_REGION = exports.CLOUD_LOCUS_CONTEXT_KEYS = exports.EnforceError = void 0;
exports.evaluate = evaluate;
exports.verify = verify;
exports.waitForApprovalResolution = waitForApprovalResolution;
exports.requiredBindingsFor = requiredBindingsFor;
exports.verifyPermit = verifyPermit;
exports.reverifyPermit = reverifyPermit;
exports.enforce = enforce;
const transport_1 = require("./transport");
const functionRegion_1 = require("./functionRegion");
const DEFAULT_API_URL = "https://api.atlasent.io";
/** Authorization plus region headers for one runtime request. */
function runtimeHeaders(config, url) {
    return {
        Authorization: `Bearer ${config.apiKey}`,
        ...(0, functionRegion_1.functionRegionHeaders)(url, config.functionRegion),
    };
}
class EnforceError extends Error {
    phase;
    decision;
    /** Coarse verify outcome (verified | mismatch | expired | replay_blocked | invalid | …). */
    outcome;
    /** Precise verify wire code, when the failure came from verify-permit. */
    verifyErrorCode;
    mismatchFields;
    constructor(message, phase, decision = null, details) {
        super(message);
        this.name = "EnforceError";
        this.phase = phase;
        this.decision = decision;
        this.outcome = details?.outcome;
        this.verifyErrorCode = details?.verifyErrorCode;
        this.mismatchFields = details?.mismatchFields;
    }
}
exports.EnforceError = EnforceError;
// ---------------------------------------------------------------------------
// Step 1 — evaluate
// ---------------------------------------------------------------------------
async function evaluate(config) {
    const apiUrl = (config.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
    // Separate state_snapshot out of context if the caller mistakenly nested it there.
    const rawContext = { ...config.context };
    const contextSnapshot = rawContext["state_snapshot"];
    delete rawContext["state_snapshot"];
    const payload = {
        action_type: config.action,
        actor_id: config.actor,
        context: {
            // Keep environment in context for backward compat with older control plane versions.
            ...(config.environment ? { environment: config.environment } : {}),
            ...(config.targetId ? { target_id: config.targetId } : {}),
            ...rawContext,
        },
    };
    if (config.actorIdentity != null)
        payload["actor_identity"] = config.actorIdentity;
    // Top-level fields forwarded to the control plane's EvaluateRequest.
    if (config.environment != null)
        payload["environment"] = config.environment;
    if (config.resource != null)
        payload["resource"] = config.resource;
    else if (config.targetId)
        payload["target_id"] = config.targetId;
    if (config.current_state != null)
        payload["current_state"] = config.current_state;
    if (config.proposed_state != null)
        payload["proposed_state"] = config.proposed_state;
    if (config.execution_binding != null)
        payload["execution_binding"] = config.execution_binding;
    // state_snapshot is a top-level body field (EvaluateBody.state_snapshot), not inside context.
    const snap = config.state_snapshot ?? contextSnapshot;
    if (snap != null)
        payload["state_snapshot"] = snap;
    if (config.changePlan != null)
        payload["change_plan"] = config.changePlan;
    if (config.evidenceProfile != null)
        payload["evidence_profile"] = config.evidenceProfile;
    if (config.quorum != null)
        payload["quorum"] = config.quorum;
    if (config.approval != null)
        payload["approval"] = config.approval;
    // Artifact digest is a canonical top-level input — the runtime binds it into
    // the permit (execution_hash_expected). Never buried in context/presentation.
    if (config.executionPayloadHash != null) {
        payload["execution_payload_hash"] = config.executionPayloadHash;
    }
    let status;
    let body;
    try {
        ({ status, body } = await (0, transport_1.post)(`${apiUrl}/v1-evaluate`, JSON.stringify(payload), runtimeHeaders(config, apiUrl)));
    }
    catch (err) {
        throw new EnforceError(`AtlaSent API unreachable: ${err instanceof Error ? err.message : String(err)}`, "evaluate");
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
    let raw;
    try {
        raw = JSON.parse(body);
    }
    catch {
        throw new EnforceError("Non-JSON response from AtlaSent API", "evaluate");
    }
    const decision = mapDecision(raw);
    // ADR-055 two-call acceptance lane (see EnforceConfig.onInsufficientApprovals
    // above). `config.onInsufficientApprovals` is stripped on the retry call
    // below, so this branch can only ever fire once per original evaluate()
    // invocation — no unbounded recursion, no double-mint on a callback that
    // itself denies.
    if (decision.decision === "deny" &&
        decision.denyCode === "INSUFFICIENT_APPROVALS" &&
        config.onInsufficientApprovals &&
        raw["signing_hint"] != null &&
        typeof raw["signing_hint"] === "object") {
        const hint = raw["signing_hint"];
        let quorum;
        try {
            quorum = await config.onInsufficientApprovals(hint, decision.evaluationId);
        }
        catch {
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
function verify(decision) {
    switch (decision.decision) {
        case "allow":
            return;
        case "deny":
            throw new EnforceError(`Denied: ${decision.denyReason ?? "no reason provided"}`, "verify", decision);
        case "hold":
            throw new EnforceError(`On hold: ${decision.holdReason ?? "awaiting approval"}`, "verify", decision);
        case "escalate":
            throw new EnforceError("Escalated — manual review required", "verify", decision);
        default:
            throw new EnforceError(`Unknown decision: ${String(decision.decision)}`, "verify", decision);
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
/** Statuses on which a permit can be claimed. Everything else is terminal non-allow. */
const CLAIMABLE_APPROVAL_STATUSES = new Set(["approved", "approved_awaiting_claim"]);
function sleep(ms) {
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
async function claimApprovalPermit(config, apiUrl, row) {
    const url = `${apiUrl}/v1/approvals/${encodeURIComponent(config.approvalId)}/claim-permit`;
    let requestBody = "{}";
    if (config.buildClaimBody) {
        let built;
        try {
            built = await config.buildClaimBody(row);
        }
        catch (err) {
            throw new EnforceError(`Approval claim refused before sending: could not build the claim body ` +
                `(${err instanceof Error ? err.message : String(err)}) — failing closed`, "evaluate");
        }
        requestBody = JSON.stringify(built);
    }
    let status;
    let body;
    try {
        ({ status, body } = await (0, transport_1.post)(url, requestBody, runtimeHeaders(config, url)));
    }
    catch {
        return { claimFailure: "unreachable" };
    }
    let raw;
    try {
        const parsed = JSON.parse(body);
        raw = parsed && typeof parsed === "object" ? parsed : undefined;
    }
    catch {
        raw = undefined;
    }
    if (status !== 200) {
        const code = raw && typeof raw["error"] === "string" ? raw["error"] : `HTTP ${status}`;
        return { claimFailure: code };
    }
    if (!raw)
        return { claimFailure: "malformed_response" };
    const reEvaluationDecision = typeof raw["re_evaluation_decision"] === "string" ? raw["re_evaluation_decision"] : undefined;
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
async function waitForApprovalResolution(config) {
    if (!config.approvalId) {
        throw new EnforceError("Cannot wait for approval: no approvalRequestId on the hold/escalate decision", "evaluate");
    }
    const apiUrl = (config.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
    const url = `${apiUrl}/v1/approvals/${encodeURIComponent(config.approvalId)}`;
    const deadline = Date.now() + config.maxWaitMs;
    while (Date.now() < deadline) {
        let status;
        let body;
        try {
            ({ status, body } = await (0, transport_1.get)(url, runtimeHeaders(config, url)));
        }
        catch {
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
            let raw;
            try {
                raw = JSON.parse(body);
            }
            catch {
                // Malformed response — treat like any other transient failure, retry.
                await sleep(APPROVAL_POLL_INTERVAL_MS);
                continue;
            }
            const rowStatus = raw["status"];
            if (rowStatus && rowStatus !== "pending") {
                const polledReEvaluationDecision = raw["re_evaluation_decision"];
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
                const claimEnvironment = typeof raw["claim_environment"] === "string" ? raw["claim_environment"] : undefined;
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
    throw new EnforceError(`Approval wait timed out after ${config.maxWaitMs}ms with no human resolution — failing closed`, "evaluate");
}
/** Evaluate-context keys that v1-verify-permit re-checks against signed
 *  permit claims, and that therefore must be re-presented at verify. */
exports.CLOUD_LOCUS_CONTEXT_KEYS = ["aws", "azure"];
/**
 * Shared HTTP core for permit verification. Sends the permit token AND re-binds
 * the execution context (environment, target, artifact digest) so verification
 * checks the caller is executing the SAME artifact/environment the permit was
 * issued for. Returns a normalized result (does not throw on verified=false —
 * the caller applies the fail-closed decision).
 */
async function postVerify(config, permitToken, decision) {
    const apiUrl = (config.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
    const bodyObj = {
        permit_token: permitToken,
        action_type: config.action,
        actor_id: config.actor,
    };
    if (config.environment != null)
        bodyObj["environment"] = config.environment;
    if (config.targetId != null)
        bodyObj["target_id"] = config.targetId;
    // Re-present the caller's runtime-minted actor_identity.v1 at the commit
    // point (atlasent-api#3915). v1-verify-permit checks it only for an action
    // class classified `verified_actor`, binding it to the PERMIT's actor,
    // action, tenant and environment; every other class ignores it. Sending it
    // is what lets a class be classified verified_actor without denying every
    // run (atlasent-api docs/design/EXECUTION_PRINCIPAL_BINDING.md, rollout
    // rule 3). The caller must pass an assertion that is still valid at verify
    // time; this function never re-mints one.
    if (config.actorIdentity != null)
        bodyObj["actor_identity"] = config.actorIdentity;
    // Prefer the runtime-bound original evaluated digest (execution_hash_expected,
    // echoed on the decision) over a caller-supplied one, so verify re-presents the
    // artifact the permit was actually issued for — not one re-supplied at verify time.
    const payloadHash = decision?.executionHashExpected ?? config.executionPayloadHash;
    if (payloadHash != null)
        bodyObj["payload_hash"] = payloadHash;
    // Re-present the cloud execution locus. When the evaluate context carried
    // `aws` or `azure`, v1-evaluate signed those values into the permit
    // (aws_account_id/aws_region, azure_subscription_id/azure_resource_group)
    // and v1-verify-permit requires the SAME values under `context` at verify,
    // treating an absent locus as a mismatch (AWS_LOCUS_MISMATCH /
    // AZURE_LOCUS_MISMATCH). Before this, no verify body carried `context`, so
    // every cloud-scoped permit failed verification. Only these two keys are
    // sent: the rest of the evaluate context is not a verify input.
    const locus = {};
    for (const key of exports.CLOUD_LOCUS_CONTEXT_KEYS) {
        const value = config.context?.[key];
        if (value != null)
            locus[key] = value;
    }
    if (Object.keys(locus).length > 0)
        bodyObj["context"] = locus;
    // Fail closed: if the caller declared bindings as required, refuse to verify —
    // BEFORE the network round-trip — when any is absent or empty. A permit gate that
    // silently drops its environment / target / artifact binding is the exact
    // substitution hole this closes. verify-error-code MISSING_BINDING.
    const missing = (config.requiredBindings ?? []).filter((b) => bodyObj[b] == null || bodyObj[b] === "");
    if (missing.length > 0) {
        throw new EnforceError(`verify-permit refused: required binding(s) absent: ${missing.join(", ")}`, "verify-permit", decision, { outcome: "invalid", verifyErrorCode: "MISSING_BINDING" });
    }
    let status;
    let body;
    try {
        ({ status, body } = await (0, transport_1.post)(`${apiUrl}/v1-verify-permit`, JSON.stringify(bodyObj), runtimeHeaders(config, apiUrl)));
    }
    catch (err) {
        throw new EnforceError(`verify-permit unreachable: ${err instanceof Error ? err.message : String(err)}`, "verify-permit", decision);
    }
    if (status >= 500) {
        throw new EnforceError(`verify-permit infrastructure failure (HTTP ${status})`, "verify-permit", decision);
    }
    if (status < 200 || status >= 300) {
        throw new EnforceError(`verify-permit failed (HTTP ${status})`, "verify-permit", decision);
    }
    let raw;
    try {
        raw = JSON.parse(body);
    }
    catch {
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
function requiredBindingsFor(b) {
    const r = [];
    if (b.environment != null && b.environment !== "")
        r.push("environment");
    if (b.targetId != null && b.targetId !== "")
        r.push("target_id");
    if (b.executionPayloadHash != null && b.executionPayloadHash !== "")
        r.push("payload_hash");
    return r;
}
async function verifyPermit(config, decision) {
    if (!decision.permitToken) {
        throw new EnforceError("evaluate returned allow but no permit_token — refusing to execute without verifiable permit", "verify-permit", decision);
    }
    const r = await postVerify(config, decision.permitToken, decision);
    if (!r.verified) {
        // outcome=replay_blocked (replay), expired, mismatch (wrong artifact/env), etc.
        throw new EnforceError(`Permit verification failed (outcome=${r.outcome ?? "unknown"}${r.verifyErrorCode ? `, code=${r.verifyErrorCode}` : ""})`, "verify-permit", decision, { outcome: r.outcome, verifyErrorCode: r.verifyErrorCode, mismatchFields: r.mismatchFields });
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
async function reverifyPermit(config, permitToken) {
    if (!permitToken || !permitToken.trim()) {
        throw new EnforceError("no permit_token presented at execution boundary — refusing to execute", "verify-permit", null, { outcome: "invalid", verifyErrorCode: "MISSING_PERMIT" });
    }
    const r = await postVerify(config, permitToken, null);
    if (!r.verified) {
        throw new EnforceError(`Permit re-verification failed at execution boundary (outcome=${r.outcome ?? "unknown"}${r.verifyErrorCode ? `, code=${r.verifyErrorCode}` : ""})`, "verify-permit", null, { outcome: r.outcome, verifyErrorCode: r.verifyErrorCode, mismatchFields: r.mismatchFields });
    }
    return r;
}
// ---------------------------------------------------------------------------
// Step 4 — enforce (evaluate → verify → verifyPermit → execute, fail-closed)
// ---------------------------------------------------------------------------
async function enforce(config, fn) {
    const decision = await evaluate(config); // throws EnforceError → fn never runs
    verify(decision); // throws EnforceError → fn never runs
    const vp = await verifyPermit(config, decision); // throws EnforceError → fn never runs
    const result = await fn();
    return { result, decision, verifyOutcome: vp.outcome };
}
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function mapDecision(raw) {
    return {
        decision: raw["decision"],
        // The real /v1-evaluate response field is `request_id` (see
        // v1-evaluate/handler.ts's `return json({ ..., request_id: effectiveRequestId, ... })`
        // — confirmed by direct source read; `evaluation_id` is never a key on the
        // HTTP response body, only an internal DB column name on approval_requests
        // and similar tables). Reading only `evaluation_id` left Decision.evaluationId
        // permanently undefined for every real evaluate call (#130). `evaluation_id`
        // is kept as a fallback in case an older or alternate response shape ever
        // emits it, same defensive-dual-name pattern this function already uses for
        // auditHash below.
        evaluationId: (raw["request_id"] ?? raw["evaluation_id"]),
        permitToken: raw["permit_token"],
        proofHash: raw["proof_hash"],
        executionHashExpected: (raw["execution_hash_expected"] ?? raw["payload_hash"]),
        riskScore: extractRiskScore(raw),
        denyReason: raw["deny_reason"],
        denyCode: raw["deny_code"],
        remediation: raw["remediation"],
        holdReason: raw["hold_reason"],
        risk_class: raw["risk_class"],
        authority_basis: raw["authority_basis"],
        escalation_id: raw["escalation_id"],
        approvalRequestId: raw["approval_request_id"],
        chainEntry: raw["chain_entry"] ?? null,
        snapshot: raw["snapshot"] ?? null,
        // Real wire field is `audit_entry_hash` (see v1-evaluate/handler.ts and
        // v1-verify-permit/handler.ts). `audit_hash` is accepted too in case an
        // older API build still emits it, but it does not exist on the current
        // response shape — reading only that name left the `audit-hash` action
        // output permanently empty.
        auditHash: (raw["audit_entry_hash"] ?? raw["audit_hash"]),
    };
}
function extractRiskScore(raw) {
    const risk = raw["risk"];
    if (risk && typeof risk === "object" && "score" in risk) {
        const score = risk.score;
        if (typeof score === "number")
            return score;
    }
    const flat = raw["risk_score"];
    if (typeof flat === "number")
        return flat;
    return undefined;
}
var functionRegion_2 = require("./functionRegion");
Object.defineProperty(exports, "DEFAULT_FUNCTION_REGION", { enumerable: true, get: function () { return functionRegion_2.DEFAULT_FUNCTION_REGION; } });
Object.defineProperty(exports, "FUNCTION_REGION_ENV", { enumerable: true, get: function () { return functionRegion_2.FUNCTION_REGION_ENV; } });
Object.defineProperty(exports, "FUNCTION_REGION_HEADER", { enumerable: true, get: function () { return functionRegion_2.FUNCTION_REGION_HEADER; } });
Object.defineProperty(exports, "FunctionRegionConfigError", { enumerable: true, get: function () { return functionRegion_2.FunctionRegionConfigError; } });
Object.defineProperty(exports, "HOSTED_RUNTIME_HOSTS", { enumerable: true, get: function () { return functionRegion_2.HOSTED_RUNTIME_HOSTS; } });
Object.defineProperty(exports, "functionRegionHeaders", { enumerable: true, get: function () { return functionRegion_2.functionRegionHeaders; } });
Object.defineProperty(exports, "parseFunctionRegion", { enumerable: true, get: function () { return functionRegion_2.parseFunctionRegion; } });
Object.defineProperty(exports, "resolveFunctionRegion", { enumerable: true, get: function () { return functionRegion_2.resolveFunctionRegion; } });
