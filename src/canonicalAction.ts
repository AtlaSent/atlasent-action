// Canonical action type taxonomy for atlasent-action.
//
// V1 framing: "protected actions"
// V2 framing: authority over a consequential state transition
//
// The action_type is a label on the transition, not the whole story.
// The state transition (current → proposed) is what the evaluator reasons about.
// Policies govern the full action_type namespace — this file does not enumerate
// every allowed value. It provides well-known constants and normalization helpers.
//
// Legacy alias window: LEGACY_PRODUCTION_DEPLOY_ALIAS ("deployment.production")
// is accepted on input and normalized to the canonical "production.deploy".
// Both ends rewrite — see atlasent-api PR #662.

// ---------------------------------------------------------------------------
// Well-known action type constants
// ---------------------------------------------------------------------------

export const PRODUCTION_DEPLOY_ACTION = "production.deploy";
/** Applying infrastructure changes (Terraform/Helm/etc.) outside an app deploy. */
export const INFRASTRUCTURE_CHANGE_ACTION = "infrastructure.change";
/** Rolling a production change back to a prior known-good state. */
export const PRODUCTION_ROLLBACK_ACTION = "production.rollback";
/** Changing a secret's configuration (rotation policy, access scope, etc.) — distinct from secret.rotate. */
export const SECRET_CONFIGURATION_CHANGE_ACTION = "secret.configuration.change";
/**
 * Package/artifact publishing to a public registry (PyPI, npm, crates, …).
 * Distinct from production.deploy: governed by a release policy that does NOT
 * require interactive PR approvals, since publishes run on workflow_dispatch /
 * tag pushes where no PR review evidence exists. production.deploy keeps its
 * human-approval requirement — the two must never share a policy.
 */
export const PACKAGE_RELEASE_ACTION = "package.release";
export const DATABASE_MIGRATION_ACTION = "database.migration.apply";
export const DATABASE_SCHEMA_DROP_ACTION = "database.schema.drop";
export const DATA_EXPORT_BULK_ACTION = "data.export.bulk";
export const ADMIN_PERMISSION_GRANT_ACTION = "admin.permission.grant";
export const AGENT_TOOL_CALL_ACTION = "agent.tool.call";
export const SECRET_ROTATION_PRODUCTION_ACTION = "secret.rotation.production";

// GxP — Clinical trial blinding / unblinding (ICH E6(R3) Annex 1 §2.11 / §3.15.2(d), 21 CFR Part 11 §11.10/§11.300)
export const TRIAL_BLINDING_SETUP_ACTION = "trial.blinding.setup";
export const TRIAL_UNBLINDING_EXECUTE_ACTION = "trial.unblinding.execute";
export const TRIAL_UNBLINDING_EMERGENCY_ACTION = "trial.unblinding.emergency";

/**
 * Publication of a signed trust-root document (public verification keys,
 * revocations, Sigstore identities) to a public distribution host. A Canon
 * specialization of secret.rotate (CANON-000035) — see
 * atlasent/contract/canonical-actions/SPECIALIZATIONS.yaml. Distinct from
 * production.deploy: no change-window condition applies (secret.rotate's own
 * authorization_pattern.change_windows_required is false), and the caller is
 * expected to be a narrow service/workflow identity, not a human.
 */
export const TRUST_ROOT_PUBLISH_ACTION = "trust_root.publish";

/**
 * SOX-control reconciliation certification — an org-provisioned action type
 * (e.g. `sox_reconciliation_certify_hold_for_review`) used to demonstrate
 * the runtime's hold/human-approval decision path, distinct from the
 * allow/deny-only `production.deploy` bundle. Not a mandatory-change-control
 * action type (no change_plan/workload-identity minting needed for it).
 */
export const RECONCILIATION_CERTIFY_ACTION = "reconciliation.certify";

/**
 * Sending a message/notification outside the org boundary (email, SMS, a
 * customer-facing webhook, etc.) — ACT-0050 / CANON-000047 in atlasent's
 * canonical-actions registry, already provisioned as a real runtime-owning
 * seeder in atlasent-api
 * (supabase/migrations-runtime/20260833000000_seed_communication_external_send_control.sql
 * + …20260835000000_communication_external_send_allow_actors.sql). Not a
 * mandatory-change-control action type (no change_plan/workload-identity
 * minting needed for it) — the caller asserts a self-identified actor, same
 * shape as `trust_root.publish`.
 */
export const COMMUNICATION_EXTERNAL_SEND_ACTION = "communication.external.send";

/** Legacy alias — accepted during the V1 alias window, normalized on input. */
export const LEGACY_PRODUCTION_DEPLOY_ALIAS = "deployment.production";

/**
 * `artifact.release` (CANON-000002): publishing a versioned artifact to a
 * registry. Its Canon floor requires a verified actor AND a `supply_chain`
 * assertion, so unlike `package.release` a missing workload identity is a
 * refusal, not a fallback. It is not a change-control action: no change_plan
 * is built for it.
 */
export const ARTIFACT_RELEASE_ACTION = "artifact.release";

/**
 * Action types the gate accepts on its single-eval path. This is a
 * conservative client-side allow-list, NOT the authority — the runtime
 * policy is. Deny-by-default still applies: an accepted action type with
 * no published policy bundle resolves to deny at the runtime. We keep the
 * set explicit (rather than accepting any well-formed type) so a typo in a
 * workflow surfaces as a clear gate error instead of a silent deny.
 */
export const GATE_PERMITTED_ACTIONS: ReadonlySet<string> = new Set([
  PRODUCTION_DEPLOY_ACTION,
  INFRASTRUCTURE_CHANGE_ACTION,
  PRODUCTION_ROLLBACK_ACTION,
  SECRET_CONFIGURATION_CHANGE_ACTION,
  PACKAGE_RELEASE_ACTION,
  ARTIFACT_RELEASE_ACTION,
  TRIAL_BLINDING_SETUP_ACTION,
  TRIAL_UNBLINDING_EXECUTE_ACTION,
  TRIAL_UNBLINDING_EMERGENCY_ACTION,
  TRUST_ROOT_PUBLISH_ACTION,
  RECONCILIATION_CERTIFY_ACTION,
  COMMUNICATION_EXTERNAL_SEND_ACTION,
]);

/**
 * The four action types atlasent-api mandatorily requires a verified
 * workload/actor identity AND a structured, server-derived change_plan for
 * (_shared/mandatory-execution-binding.ts's MANDATORY_CHANGE_CONTROL_ACTION_TYPES
 * — not org-configurable, code-level, in that repo). Mirrored here (not
 * imported — this package has no dependency on atlasent-api's source) so
 * this action's own actor-resolution and change-plan construction stay in
 * lockstep with what the runtime will actually require. Keep in sync by
 * hand; a mismatch fails safe either way (the runtime is the authority —
 * an action type missing here just means this action won't pre-construct
 * a change_plan/mint a workload identity for it, not that the runtime's
 * own requirement goes away).
 */
export const MANDATORY_CHANGE_CONTROL_ACTIONS: ReadonlySet<string> = new Set([
  PRODUCTION_DEPLOY_ACTION,
  INFRASTRUCTURE_CHANGE_ACTION,
  PRODUCTION_ROLLBACK_ACTION,
  SECRET_CONFIGURATION_CHANGE_ACTION,
]);

/**
 * Action types for which this action OPPORTUNISTICALLY attempts to mint a
 * verified GitHub Actions workload actor, but — unlike
 * MANDATORY_CHANGE_CONTROL_ACTIONS — falls back to the existing self-asserted
 * `github:<actor>` identity if minting is unavailable (no `id-token: write`
 * permission, the org/repo/workflow has no broker admission binding yet, the
 * broker is unreachable, etc.) rather than failing the step closed.
 *
 * `package.release` is deliberately NOT in MANDATORY_CHANGE_CONTROL_ACTIONS
 * (see PACKAGE_RELEASE_ACTION's own comment: different governance model, no
 * structured change_plan / PR-approval requirement) and atlasent-api does
 * not (yet) set `requires_verified_actor` on it for any org — see
 * atlasent-api#1942. This set exists so a caller who HAS enrolled their
 * repo/workflow with the broker gets a verified actor for free the moment
 * they add `permissions: id-token: write`, without atlasent-api's flag
 * flipping first and without atlasent-action ever hard-requiring OIDC for an
 * action type the runtime doesn't yet require it for. Flipping
 * `requires_verified_actor` on `package.release` for a real org is a
 * separate, later step (needs broker admission enrollment for every calling
 * repo/workflow first, staging-soaked, per #1942) — this set alone changes
 * no enforcement, only what identity gets asserted when minting happens to
 * succeed.
 */
export const OPTIONAL_VERIFIED_ACTOR_ACTIONS: ReadonlySet<string> = new Set([
  PACKAGE_RELEASE_ACTION,
]);

/** Action types outside MANDATORY_CHANGE_CONTROL_ACTIONS whose verified actor is still mandatory. */
export const VERIFIED_ACTOR_REQUIRED_ACTIONS: ReadonlySet<string> = new Set([
  ARTIFACT_RELEASE_ACTION,
]);

/**
 * Action types for which this action mints a `supply_chain` assertion
 * (atlasent-api v1-supply-chain-assertion) from the job's GitHub artifact
 * attestation and sends it, with resource_id and context.artifact_digest,
 * on evaluate. A mint failure fails the step closed.
 */
export const SUPPLY_CHAIN_ASSERTION_ACTIONS: ReadonlySet<string> = new Set([
  ARTIFACT_RELEASE_ACTION,
]);

// ---------------------------------------------------------------------------
// Phase 1–6 catalog (informational — not an enforcement whitelist)
//
// Lists the 19 built-in action types with SDK helpers, governance kits, and
// policy templates. The gate accepts any well-formed action type string;
// this catalog is a reference for tooling and documentation.
// ---------------------------------------------------------------------------

export const PROTECTED_ACTIONS_CATALOG: ReadonlySet<string> = new Set([
  // Phase 1 — Deploy
  "production.deploy",
  // Phase 4 — HR
  "hr.employee.offboard",
  "hr.access.revoke",
  "hr.role.escalate",
  // Phase 4 — Model governance
  "ml.model.promote",
  "ml.model.retire",
  "ml.model.fine_tune",
  // Phase 4 — Data & contracts
  "customer.data.delete",
  "contract.execute",
  "contract.amend",
  // Phase 4 — Pricing
  "pricing.rule.publish",
  "pricing.discount.approve",
  // Phase 5 — Security & access
  "security.incident.escalate",
  "security.access.quarantine",
  "access.cert.revoke",
  // Phase 5 — Finance
  "period.close.certify",
  // Phase 6 — Database
  "database.migration.apply",
  "database.schema.drop",
  "database.table.delete",
  // GxP — Clinical trial blinding (ICH E6(R3) Annex 1 §2.11 / §3.15.2(d), 21 CFR Part 11 §11.10/§11.300)
  "trial.blinding.setup",
  "trial.unblinding.execute",
  "trial.unblinding.emergency",
]);

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

export interface NormalizedProtectedAction {
  canonical: string;
  wasLegacyAlias: boolean;
}

/**
 * Normalize an action type string, resolving any known legacy aliases.
 * Always returns the canonical form before forwarding to the control plane.
 */
export function normalizeProtectedAction(raw: string): NormalizedProtectedAction {
  if (raw === LEGACY_PRODUCTION_DEPLOY_ALIAS) {
    return { canonical: PRODUCTION_DEPLOY_ACTION, wasLegacyAlias: true };
  }
  return { canonical: raw, wasLegacyAlias: false };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const ACTION_TYPE_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){1,3}$/;

/**
 * Validate that a string is a well-formed action type.
 * Format: dot-separated lowercase identifiers, 2–4 segments.
 * Does NOT restrict to a fixed whitelist — policies are the authority.
 */
export function isValidActionType(raw: string): boolean {
  return ACTION_TYPE_PATTERN.test(raw);
}

/**
 * Assert that a string is a well-formed action type.
 * Throws if the format is invalid. Does NOT restrict to a fixed whitelist.
 *
 * Previously assertProtectedAction() hard-coded V1 to "production.deploy" only.
 * That constraint now lives in policy, not in this file.
 */
export function assertValidActionType(raw: string): void {
  const { canonical } = normalizeProtectedAction(raw);
  if (!isValidActionType(canonical)) {
    throw new Error(
      `Invalid action type "${raw}". ` +
        `Expected dot-separated lowercase identifiers, 2–4 segments ` +
        `(e.g. "production.deploy", "database.migration.apply").`,
    );
  }
}

/**
 * @deprecated Use assertValidActionType(). Retained for backward compatibility
 * with existing callers during the V1 → V2 transition window.
 */
export function assertProtectedAction(raw: string): void {
  assertValidActionType(raw);
}
