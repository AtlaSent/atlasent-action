/**
 * GitHub Actions workload identity for protected production deploys.
 *
 * The Action never constructs actor_identity.v1 itself and never accepts an
 * issuer/principal kind from workflow input. It asks GitHub for the job's OIDC
 * JWT, presents that raw credential to the runtime-owned broker, and uses only
 * the broker's verified + signed actor identity in the evaluate request.
 */

import { createHash } from "node:crypto";
import { functionRegionHeaders } from "@atlasent/enforce";

export const GITHUB_ACTIONS_OIDC_AUDIENCE = "atlasent:actor_identity.v1";
/** A different audience, so an actor-identity token can never be replayed as a provenance token. */
export const SUPPLY_CHAIN_OIDC_AUDIENCE = "atlasent:supply_chain.v1";
export const WORKLOAD_IDENTITY_REQUEST_TIMEOUT_MS = 30_000;

export interface GithubActionsIdentitySource {
  issuer: "https://token.actions.githubusercontent.com";
  repository: string;
  repository_id: string;
  ref: string;
  sha: string;
  workflow_ref: string;
  actor: string;
  actor_id: string;
  run_id: string;
  run_attempt: string;
  environment: string;
}

export interface MintedGithubActionsIdentity {
  actorId: string;
  assertion: Record<string, unknown>;
  source: GithubActionsIdentitySource;
}

export class WorkloadIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkloadIdentityError";
  }
}

interface WorkloadIdentityDeps {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  mask?: (value: string) => void;
}

function responseDetail(body: string): string {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const message = parsed["message"] ?? parsed["error_description"] ?? parsed["error"];
    if (typeof message === "string" && message.trim()) return message.trim().slice(0, 300);
  } catch {
    // Use the bounded plain-text body below.
  }
  return body.trim().slice(0, 300) || "empty response";
}

function isMissingBrokerMintScope(status: number, body: string): boolean {
  if (status !== 403) return false;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return (
      parsed["error"] === "insufficient_scope" &&
      typeof parsed["message"] === "string" &&
      parsed["message"].includes("idp_broker:mint")
    );
  } catch {
    return false;
  }
}

/**
 * Return a bounded, one-way identifier operators can match against
 * `api_keys.key_hash`. The raw key and its reusable prefix never enter logs.
 */
export function apiKeyCredentialReference(apiKey: string): string {
  return `sha256:${createHash("sha256").update(apiKey).digest("hex").slice(0, 16)}`;
}

async function requestGithubOidcToken(
  deps: Required<Pick<WorkloadIdentityDeps, "fetchImpl" | "env">> &
    Pick<WorkloadIdentityDeps, "mask">,
  audience: string = GITHUB_ACTIONS_OIDC_AUDIENCE,
): Promise<string> {
  const requestUrl = (deps.env["ACTIONS_ID_TOKEN_REQUEST_URL"] ?? "").trim();
  const requestToken = (deps.env["ACTIONS_ID_TOKEN_REQUEST_TOKEN"] ?? "").trim();
  if (!requestUrl || !requestToken) {
    throw new WorkloadIdentityError(
      "GitHub OIDC is unavailable. Grant this job `permissions: id-token: write`; " +
        "this gate will not fall back to a caller-supplied actor or unverified provenance.",
    );
  }

  deps.mask?.(requestToken);
  const url = new URL(requestUrl);
  url.searchParams.set("audience", audience);

  let response: Response;
  try {
    response = await deps.fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${requestToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(WORKLOAD_IDENTITY_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new WorkloadIdentityError(
      `Could not obtain the GitHub OIDC token: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const body = await response.text();
  if (!response.ok) {
    throw new WorkloadIdentityError(
      `GitHub OIDC token request failed (HTTP ${response.status}): ${responseDetail(body)}`,
    );
  }

  let token = "";
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    token = typeof parsed["value"] === "string" ? parsed["value"] : "";
  } catch {
    // Stable error below.
  }
  if (!token) {
    throw new WorkloadIdentityError("GitHub OIDC token response did not contain `value`");
  }
  deps.mask?.(token);
  return token;
}

function isIdentitySource(value: unknown): value is GithubActionsIdentitySource {
  if (!value || typeof value !== "object") return false;
  const source = value as Record<string, unknown>;
  return (
    source["issuer"] === "https://token.actions.githubusercontent.com" &&
    typeof source["repository"] === "string" &&
    typeof source["repository_id"] === "string" &&
    typeof source["ref"] === "string" &&
    typeof source["sha"] === "string" &&
    typeof source["workflow_ref"] === "string" &&
    typeof source["actor"] === "string" &&
    typeof source["actor_id"] === "string" &&
    typeof source["run_id"] === "string" &&
    typeof source["run_attempt"] === "string" &&
    typeof source["environment"] === "string"
  );
}

/**
 * Exchange this GitHub job's raw OIDC JWT for a runtime-minted
 * actor_identity.v1 assertion. Every trust-bearing field is derived or checked
 * by the runtime broker; the workflow supplies only the requested binding.
 */
export async function mintGithubActionsActorIdentity(
  args: {
    apiUrl: string;
    apiKey: string;
    actionType: string;
    environment: string;
  },
  deps: WorkloadIdentityDeps = {},
): Promise<MintedGithubActionsIdentity> {
  const resolved = {
    fetchImpl: deps.fetchImpl ?? fetch,
    env: deps.env ?? process.env,
    mask: deps.mask,
  };
  const idToken = await requestGithubOidcToken(resolved);
  const apiUrl = args.apiUrl.replace(/\/+$/, "");

  let response: Response;
  try {
    response = await resolved.fetchImpl(`${apiUrl}/v1-idp-broker/mint/actor-identity`, {
      method: "POST",
      headers: {
        ...functionRegionHeaders(apiUrl),
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        provider: "github_actions",
        id_token: idToken,
        action_type: args.actionType,
        environment: args.environment,
      }),
      signal: AbortSignal.timeout(WORKLOAD_IDENTITY_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new WorkloadIdentityError(
      `AtlaSent workload identity broker is unreachable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const body = await response.text();
  if (!response.ok) {
    const remediation = isMissingBrokerMintScope(response.status, body)
      ? ` Credential reference ${apiKeyCredentialReference(args.apiKey)}; ` +
        "an operator can match it to the first 16 characters of api_keys.key_hash and grant only idp_broker:mint."
      : "";
    throw new WorkloadIdentityError(
      `AtlaSent workload identity broker rejected this job (HTTP ${response.status}): ${responseDetail(body)}.${remediation}`,
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new WorkloadIdentityError("AtlaSent workload identity broker returned non-JSON");
  }

  const actorId = typeof parsed["actor_id"] === "string" ? parsed["actor_id"] : "";
  const assertion = parsed["assertion"];
  if (
    !actorId ||
    !assertion ||
    typeof assertion !== "object" ||
    (assertion as Record<string, unknown>)["version"] !== "actor_identity.v1" ||
    !isIdentitySource(parsed["source"])
  ) {
    throw new WorkloadIdentityError(
      "AtlaSent workload identity broker returned an invalid actor_identity.v1 response",
    );
  }

  return {
    actorId,
    assertion: assertion as Record<string, unknown>,
    source: parsed["source"],
  };
}

const SHA256_DIGEST_RE = /^(?:sha256:)?([0-9a-f]{64})$/i;

/** "sha256:<64 lower hex>" or null; the same normalization the runtime applies. */
export function normalizeArtifactDigest(value: string | undefined): string | null {
  const m = SHA256_DIGEST_RE.exec((value ?? "").trim());
  return m ? `sha256:${m[1].toLowerCase()}` : null;
}

/**
 * Exchange a SECOND GitHub OIDC token (audience atlasent:supply_chain.v1; each
 * jti is single-use, so the actor-identity token cannot be reused) for a
 * runtime-signed `supply_chain` assertion.v1. The runtime reads the artifact
 * attestation from the token's own repository and Sigstore-verifies it; this
 * function only checks that what came back is the assertion it asked for.
 */
export async function mintSupplyChainAssertion(
  args: {
    apiUrl: string;
    apiKey: string;
    artifactDigest: string;
    resourceId: string;
    environment: string;
  },
  deps: WorkloadIdentityDeps = {},
): Promise<Record<string, unknown>> {
  const digest = normalizeArtifactDigest(args.artifactDigest);
  if (!digest) throw new WorkloadIdentityError("artifact-digest must be sha256:<64 hex> to mint a supply_chain assertion");
  if (!args.resourceId.trim()) throw new WorkloadIdentityError("target-id is required to mint a supply_chain assertion");
  const resolved = { fetchImpl: deps.fetchImpl ?? fetch, env: deps.env ?? process.env, mask: deps.mask };
  const idToken = await requestGithubOidcToken(resolved, SUPPLY_CHAIN_OIDC_AUDIENCE);
  const apiUrl = args.apiUrl.replace(/\/+$/, "");

  let response: Response;
  try {
    response = await resolved.fetchImpl(`${apiUrl}/v1-supply-chain-assertion`, {
      method: "POST",
      headers: {
        ...functionRegionHeaders(apiUrl),
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        id_token: idToken,
        artifact_digest: digest,
        resource_id: args.resourceId.trim(),
        environment: args.environment,
      }),
      signal: AbortSignal.timeout(WORKLOAD_IDENTITY_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new WorkloadIdentityError(
      `AtlaSent supply-chain assertion issuer is unreachable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const body = await response.text();
  if (!response.ok) {
    throw new WorkloadIdentityError(
      `AtlaSent supply-chain assertion issuer refused this release (HTTP ${response.status}): ${responseDetail(body)}`,
    );
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new WorkloadIdentityError("AtlaSent supply-chain assertion issuer returned non-JSON");
  }
  const a = parsed["assertion"] as Record<string, unknown> | undefined;
  const subject = a?.["subject"] as Record<string, unknown> | undefined;
  const claim = a?.["claim"] as Record<string, unknown> | undefined;
  if (
    parsed["kind"] !== "supply_chain_assertion.v1" ||
    !a || a["schema"] !== "assertion.v1" || a["class"] !== "supply_chain" ||
    subject?.["type"] !== "resource" || subject?.["ref"] !== args.resourceId.trim() ||
    normalizeArtifactDigest(String(claim?.["artifact_digest"] ?? "")) !== digest
  ) {
    // An assertion about another resource or digest would be rejected by
    // evaluate anyway; refuse here so the failure names the cause.
    throw new WorkloadIdentityError("AtlaSent supply-chain assertion issuer returned an assertion for a different artifact or resource");
  }
  return a;
}
