/**
 * Solo-operator compensating-control attestation step.
 *
 * Mints a GitHub-OIDC-verified actor_identity.v1 bound to the
 * `solo_operator.attest` action type (the SAME workload-identity exchange
 * `workloadIdentity.ts` already uses for `production.deploy`, reused here
 * for a different binding), then POSTs it plus the evidence for this
 * change to `/v1-solo-operator-attest` — the ONLY way a
 * `solo_operator_attestations` row is ever written on the runtime (see
 * atlasent-api `supabase/functions/v1-solo-operator-attest/handler.ts`).
 *
 * This step does NOT authorize anything by itself. It only records
 * evidence that the runtime's solo-operator compensating control
 * (`_shared/solo-operator-compensating-control.ts`) can later resolve
 * against, when a SEPARATE evaluate() call (this action's ordinary
 * `action:` mode, run as a later step) presents the SAME change_plan /
 * evidence_profile and `context.solo_operator_compensating_control`. The
 * runtime independently re-verifies CI status, cooling-off, and staging
 * acceptance from GitHub/its own tables before ever treating the
 * attestation as satisfied — this step cannot manufacture an allow on its
 * own, only the one fact only the real solo operator can supply: that they,
 * personally, attest to this specific change.
 *
 * Mirrors PRODUCTION_DEPLOY_ACTION's own change_plan derivation in
 * index.ts exactly (operation: "deploy", revision from the verified commit
 * SHA, optional artifact_ref) for that one action type; every other action
 * type requires an explicit `evidence-profile` JSON input, since the
 * runtime has no generic "change plan" concept for a non-deploy-shaped
 * action (see atlasent-api `_shared/solo-operator-evidence-profile.ts`).
 */

import { mintGithubActionsActorIdentity, WorkloadIdentityError } from "./workloadIdentity";
import { PRODUCTION_DEPLOY_ACTION } from "./canonicalAction";
import { functionRegionHeaders } from "@atlasent/enforce";

export const SOLO_OPERATOR_ATTEST_ACTION_TYPE = "solo_operator.attest";

export class SoloOperatorAttestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SoloOperatorAttestError";
  }
}

export interface SoloOperatorAttestArgs {
  apiUrl: string;
  apiKey: string;
  /** The action_type this attestation is FOR (e.g. "production.deploy",
   *  "control.override") — NOT solo_operator.attest itself, which is only
   *  the binding for the actor-identity mint below. */
  actionType: string;
  actionClassId: string;
  /** commit_sha sent to the attest endpoint (the CI-status/cooling-off/
   *  staging-acceptance lookup key). Independent of change_plan.revision
   *  below — usually the same commit, but the attest endpoint's own schema
   *  keeps them as two separate fields, so this module does too rather
   *  than assuming they always coincide. */
  commitSha: string;
  attestationReason: string;
  targetId?: string;
  environment?: string;
  /** Only meaningful for production.deploy — an optional artifact digest
   *  to bind into change_plan.artifact_ref. The change_plan's `revision`
   *  is NEVER taken from here: it is always derived from the freshly-
   *  minted, GitHub-OIDC-verified actor identity's own commit SHA below,
   *  the same trust model index.ts's main evaluate path already uses for
   *  production.deploy's change_plan (never a caller-supplied value). */
  artifactDigest?: string;
  /** Required when actionType is anything other than production.deploy —
   *  a typed evidence_profile, parsed and validated by the caller from the
   *  evidence-profile input. */
  evidenceProfile?: Record<string, unknown>;
}

export interface SoloOperatorAttestResult {
  attestationId: string;
  attestedBy: string;
  changePlanHash: string;
}

interface Deps {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  mask?: (value: string) => void;
}

/**
 * Derives the change_plan for production.deploy the SAME way index.ts's
 * main evaluate path does (operation: "deploy", revision from the verified
 * workload identity's commit SHA, optional artifact_ref) — so an
 * attestation recorded via this step hashes identically to what the later
 * evaluate() call will independently derive. Exported so index.ts's wiring
 * can share this single derivation instead of duplicating it.
 */
export function productionDeployChangePlan(
  verifiedSha: string,
  artifactDigest: string | undefined,
): { operation: string; revision?: string; artifact_ref?: string } {
  return {
    operation: "deploy",
    revision: verifiedSha,
    ...(artifactDigest ? { artifact_ref: artifactDigest } : {}),
  };
}

export async function attestSoloOperator(
  args: SoloOperatorAttestArgs,
  deps: Deps = {},
): Promise<SoloOperatorAttestResult> {
  const resolved = {
    fetchImpl: deps.fetchImpl ?? fetch,
    env: deps.env ?? process.env,
    mask: deps.mask,
  };

  if (args.actionType !== PRODUCTION_DEPLOY_ACTION && !args.evidenceProfile) {
    throw new SoloOperatorAttestError(
      `'${args.actionType}' is not production.deploy and requires an 'evidence-profile' input — ` +
        "a typed JSON object (see atlasent-api _shared/solo-operator-evidence-profile.ts for the " +
        "supported kinds: control_override, access_grant).",
    );
  }

  let identity;
  try {
    identity = await mintGithubActionsActorIdentity(
      {
        apiUrl: args.apiUrl,
        apiKey: args.apiKey,
        actionType: SOLO_OPERATOR_ATTEST_ACTION_TYPE,
        environment: "",
      },
      resolved,
    );
  } catch (error) {
    if (error instanceof WorkloadIdentityError) {
      throw new SoloOperatorAttestError(
        `Could not mint a verified actor identity for the solo-operator attestation: ${error.message}`,
      );
    }
    throw error;
  }

  let changePlan: { operation: string; revision?: string; artifact_ref?: string } | undefined;
  if (args.actionType === PRODUCTION_DEPLOY_ACTION) {
    const verifiedSha = identity.source.sha;
    if (!verifiedSha) {
      throw new SoloOperatorAttestError(
        "production.deploy requires a change_plan with a non-empty revision, but the verified " +
          "GitHub workload identity did not carry a commit SHA.",
      );
    }
    changePlan = productionDeployChangePlan(verifiedSha, args.artifactDigest);
  }

  const body: Record<string, unknown> = {
    action_class_id: args.actionClassId,
    commit_sha: args.commitSha,
    attestation_reason: args.attestationReason,
    actor_identity: identity.assertion,
    ...(args.targetId ? { target_id: args.targetId } : {}),
    ...(args.environment ? { environment: args.environment } : {}),
    ...(changePlan ? { change_plan: changePlan } : {}),
    ...(args.evidenceProfile ? { evidence_profile: args.evidenceProfile } : {}),
  };

  const apiUrl = args.apiUrl.replace(/\/+$/, "");
  let response: Response;
  try {
    response = await resolved.fetchImpl(`${apiUrl}/v1-solo-operator-attest`, {
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
    throw new SoloOperatorAttestError(
      `AtlaSent solo-operator attest endpoint is unreachable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const responseText = await response.text();
  if (!response.ok) {
    let detail = responseText.trim().slice(0, 300);
    try {
      const parsed = JSON.parse(responseText) as Record<string, unknown>;
      const message = parsed["error"] ?? parsed["message"];
      if (typeof message === "string" && message.trim()) detail = message.trim().slice(0, 300);
    } catch {
      // Use the bounded plain-text body above.
    }
    throw new SoloOperatorAttestError(
      `Solo-operator attestation was rejected (HTTP ${response.status}): ${detail || "empty response"}`,
    );
  }

  let parsed: { attestation?: Record<string, unknown> };
  try {
    parsed = JSON.parse(responseText) as { attestation?: Record<string, unknown> };
  } catch {
    throw new SoloOperatorAttestError("Solo-operator attest endpoint returned non-JSON");
  }
  const attestation = parsed.attestation;
  const attestationId = typeof attestation?.["id"] === "string" ? attestation["id"] : "";
  const attestedBy = typeof attestation?.["attested_by"] === "string" ? attestation["attested_by"] : "";
  const changePlanHash =
    typeof attestation?.["change_plan_hash"] === "string" ? attestation["change_plan_hash"] : "";
  if (!attestationId || !attestedBy || !changePlanHash) {
    throw new SoloOperatorAttestError(
      "Solo-operator attest endpoint returned an incomplete attestation record",
    );
  }

  return { attestationId, attestedBy, changePlanHash };
}
