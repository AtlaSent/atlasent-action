/**
 * GitHub-approval-artifact minting client.
 *
 * Calls atlasent-api's `v1-github-approval-mint` (atlasent-api#2830): mints
 * one signed `approval_artifact.v1` PER distinct GitHub PR reviewer whose
 * latest review is APPROVED, independently re-verified server-side via the
 * org's own GitHub App installation — never from a count or reviewer list
 * this action self-reports. This is what lets `approvals-from: pr-reviews`
 * satisfy `production.deploy`'s CROSS-048 `requires_human_approval` floor
 * with real cryptographic evidence, instead of the bare `context.approvals`
 * number it produced before (which `classRequiresHumanApproval` correctly
 * never accepted as proof of a human approval).
 *
 * Distinct from `soloOperatorAttest.ts`: that module lets the SOLE
 * accountable human on a single-operator org compensate for having no
 * second reviewer at all (no PR review data exists to mint FROM in that
 * shape — e.g. a manually-dispatched `workflow_dispatch` run with no PR).
 * This module is for the ordinary case where a real second human DID leave
 * an approving PR review — it turns that fact into signed evidence rather
 * than working around its absence.
 *
 * Only called by `index.ts` when the server's own INSUFFICIENT_APPROVALS
 * deny actually asks for approval evidence (the ADR-055
 * `onInsufficientApprovals` retry callback in `@atlasent/enforce`) — never
 * pre-emptively, so a caller whose action class doesn't require human
 * approval never pays for this extra round trip.
 */

import type { ApprovalSigningHint } from "@atlasent/enforce";
import { functionRegionHeaders } from "@atlasent/enforce";

export class GithubApprovalMintError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GithubApprovalMintError";
  }
}

export interface GithubApprovalMintArgs {
  apiUrl: string;
  apiKey: string;
  repository: string;
  pullRequestNumber: number;
  actionType: string;
  hint: ApprovalSigningHint;
  /** The evaluate() call this approval is FOR (Decision.evaluationId) —
   *  required by v1-github-approval-mint so it can independently bind the
   *  minted artifact to that call's own persisted repository/revision
   *  rather than trusting the action_hash alone (Codex review on
   *  atlasent-api#2832, P1: an unbound action_hash could otherwise be
   *  paired with an approved PR for an unrelated deployment). */
  evaluationId: string;
  resourceId?: string;
}

export interface GithubApprovalMintResult {
  reviewers: string[];
  artifacts: Record<string, unknown>[];
}

interface Deps {
  fetchImpl?: typeof fetch;
}

export async function mintGithubApprovalArtifacts(
  args: GithubApprovalMintArgs,
  deps: Deps = {},
): Promise<GithubApprovalMintResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const apiUrl = args.apiUrl.replace(/\/+$/, "");

  const body: Record<string, unknown> = {
    evaluation_id: args.evaluationId,
    repository: args.repository,
    pull_request_number: args.pullRequestNumber,
    action_type: args.actionType,
    action_hash: args.hint.bind.action_hash,
    environment: args.hint.bind.environment,
    ...(args.resourceId ? { resource_id: args.resourceId } : {}),
  };

  let response: Response;
  try {
    response = await fetchImpl(`${apiUrl}/v1-github-approval-mint`, {
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
    throw new GithubApprovalMintError(
      `AtlaSent GitHub-approval-mint endpoint is unreachable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const responseText = await response.text();
  if (!response.ok) {
    let detail = responseText.trim().slice(0, 300);
    try {
      const parsed = JSON.parse(responseText) as Record<string, unknown>;
      const message = parsed["message"] ?? parsed["error"];
      if (typeof message === "string" && message.trim()) detail = message.trim().slice(0, 300);
    } catch {
      // Use the bounded plain-text body above.
    }
    throw new GithubApprovalMintError(
      `GitHub-approval-mint was rejected (HTTP ${response.status}): ${detail || "empty response"}`,
    );
  }

  let parsed: { reviewers?: unknown; artifacts?: unknown };
  try {
    parsed = JSON.parse(responseText) as { reviewers?: unknown; artifacts?: unknown };
  } catch {
    throw new GithubApprovalMintError("GitHub-approval-mint endpoint returned non-JSON");
  }

  const reviewers = Array.isArray(parsed.reviewers)
    ? parsed.reviewers.filter((r): r is string => typeof r === "string")
    : [];
  const artifacts = Array.isArray(parsed.artifacts)
    ? (parsed.artifacts as Record<string, unknown>[])
    : [];
  if (artifacts.length === 0) {
    throw new GithubApprovalMintError("GitHub-approval-mint endpoint returned no artifacts");
  }

  return { reviewers, artifacts };
}

/**
 * Build a caller-owned `approval_quorum.v1` envelope from minted artifacts.
 * `required_count` is deliberately set to exactly the number of artifacts
 * being submitted — an honest "require everything I'm presenting", never an
 * aspirational higher number this caller cannot independently justify. The
 * server's own action-class floor (`minimum_approvals`) is enforced
 * independently on its side; this envelope only has to be internally
 * consistent with what it actually carries.
 */
export function buildApprovalQuorum(
  hint: ApprovalSigningHint,
  artifacts: Record<string, unknown>[],
): Record<string, unknown> {
  return {
    version: "approval_quorum.v1",
    tenant_id: hint.bind.tenant_id,
    action_hash: hint.bind.action_hash,
    environment: hint.bind.environment,
    issued_at: new Date().toISOString(),
    policy: { required_count: artifacts.length },
    approvals: artifacts,
  };
}
