// Wave B.AC2 / B.AC4 — batch fan-out helper with per-decision verify-permit.
//
// Runs a per-item /v1-evaluate loop, then verify-permit for every allow
// decision, matching the single-eval runGate() contract — the gate is
// fail-closed end-to-end.
//
// Uses @atlasent/enforce's verifyPermit() as the canonical implementation.
//
// NOTE (2026-09, #131): this module previously also supported an opt-in
// `/v1-evaluate/batch` server endpoint. That endpoint never existed on the
// runtime API (atlasent-api's `v1-evaluate` entry dispatcher only recognizes
// a `/close-ops` suffix — there is no `/batch` sub-route), so every real
// call with that opt-in enabled failed. The opt-in (`v2-batch` action input)
// was removed rather than fixed, since fixing it requires a server-side
// change in atlasent-api that is out of scope for this repo. The per-item
// loop below is unaffected and remains the only batch behavior.

import { functionRegionHeaders, verifyPermit, requiredBindingsFor } from "@atlasent/enforce";
import type { EvaluateRequest } from "./types";
import type { Decision } from "./types";
import { PRODUCTION_DEPLOY_ACTION } from "./canonicalAction";

// ---------------------------------------------------------------------------
// Trusted state_snapshot binding (issue #148)
//
// A post-merge audit of #138 found that the single-evaluation production
// path (src/index.ts's `config.state_snapshot` + its
// `context: { ...extraContext, repository: gh.repository, ref: gh.ref,
// sha: gh.sha, ... }` construction) requires a GitHub-derived state_snapshot
// and trusted repository/ref/sha context for every evaluate call, discarding
// anything the caller supplied for those keys — but the batch path posted
// every `evaluations:` item to /v1-evaluate completely unmodified, so a
// batch caller could self-assert (or simply omit) `state_snapshot`,
// `context.repository`, `context.ref`, and `context.sha` for a
// production.deploy item, silently bypassing the trusted-GitHub-state
// binding the single path enforces.
//
// bindTrustedStateSnapshot() closes that gap by applying the EXACT SAME
// contract to every production.deploy batch item, run once inside
// evaluateMany() so it covers the (sole, post-#131) per-item loop transport:
//   - any caller-supplied `state_snapshot` — top-level on the item, or
//     nested inside `context` — is discarded, never forwarded;
//   - `context.repository` / `.ref` / `.sha` / `.workflow` / `.run_id` /
//     `.run_number` / `.event_name` are always overwritten with the real
//     values read from the GitHub Actions runner environment (the same
//     env vars src/index.ts's private `getGitHubContext()` reads),
//     regardless of what a caller supplied for those keys — matching the
//     single path's "operator context is spread first, trusted fields
//     always win" ordering;
//   - `state_snapshot` is (re)constructed fresh from that same trusted
//     environment, matching src/index.ts's shape exactly:
//     `{ source: "github-actions", complete: true, run_id }`.
//
// Scoped to production.deploy items only, mirroring the existing
// production-only gate in v21.ts's bindBatchWorkloadIdentities() — a
// non-production item is returned untouched.
//
// The bound items this returns are also what MUST be threaded through to
// runtime evidence emission (emitBatchEvidence() in v21.ts) — not the
// original caller-supplied items — or an authenticated audit event could
// record different, caller-controlled provenance than what was actually
// evaluated. evaluateMany() returns the bound items on BatchResult for
// exactly this reason; see v21.ts's runV21() for the consumer side.
//
// Deliberately duplicates (rather than imports) the GITHUB_* env read:
// src/index.ts's GitHubContext/getGitHubContext are private to the CLI
// entrypoint and not exported, and this module must not take on a runtime
// dependency on that file.
// ---------------------------------------------------------------------------

interface TrustedGithubState {
  repository: string;
  ref: string;
  sha: string;
  workflow: string;
  run_id: string;
  run_number: string;
  event_name: string;
}

function readTrustedGithubState(): TrustedGithubState {
  return {
    repository: process.env["GITHUB_REPOSITORY"] ?? "",
    ref: process.env["GITHUB_REF"] ?? "",
    sha: process.env["GITHUB_SHA"] ?? "",
    workflow: process.env["GITHUB_WORKFLOW"] ?? "",
    run_id: process.env["GITHUB_RUN_ID"] ?? "",
    run_number: process.env["GITHUB_RUN_NUMBER"] ?? "",
    event_name: process.env["GITHUB_EVENT_NAME"] ?? "",
  };
}

/**
 * Bind every production.deploy item in `items` to a GitHub-derived
 * `state_snapshot` and trusted repository/ref/sha/workflow/run context,
 * discarding any caller-supplied values for those specific keys. See the
 * module header above for the full contract. Exported for direct unit
 * testing; also exercised indirectly through evaluateMany().
 */
export function bindTrustedStateSnapshot(items: EvaluateRequest[]): EvaluateRequest[] {
  if (!items.some((item) => item.action === PRODUCTION_DEPLOY_ACTION)) {
    return items;
  }

  const state = readTrustedGithubState();

  return items.map((item) => {
    if (item.action !== PRODUCTION_DEPLOY_ACTION) {
      return item;
    }

    // Discard any caller-supplied state_snapshot, top-level or nested in
    // context — a malformed or self-authored value must never reach the
    // wire; only the freshly-derived one below is ever sent.
    const { state_snapshot: _discardedTopLevelSnapshot, context, ...rest } = item;
    const safeContext: Record<string, unknown> = { ...(context ?? {}) };
    delete safeContext["state_snapshot"];

    return {
      ...rest,
      context: {
        ...safeContext,
        // Trusted fields always win over whatever the caller's `context`
        // claimed for these keys — a batch item asserting a wrong
        // repository or wrong ref must never survive past this point.
        repository: state.repository,
        ref: state.ref,
        sha: state.sha,
        workflow: state.workflow,
        run_id: state.run_id,
        run_number: state.run_number,
        event_name: state.event_name,
      },
      state_snapshot: {
        source: "github-actions",
        complete: true,
        run_id: state.run_id,
      },
    };
  });
}

export interface BatchResult {
  decisions: Decision[];
  /** Originating batchId — always a `loop-<ts>` marker. */
  batchId: string;
  /**
   * The ACTUAL items evaluated — after bindTrustedStateSnapshot() ran.
   * Callers (runV21's emitBatchEvidence() in particular) must use THESE,
   * not whatever items they originally passed in, so audit/evidence
   * records the same trusted provenance that was actually evaluated
   * rather than caller-controlled context that was overridden here.
   */
  items: EvaluateRequest[];
}

export async function evaluateMany(
  apiUrl: string,
  apiKey: string,
  rawItems: EvaluateRequest[],
): Promise<BatchResult> {
  // Bind every production.deploy item to a trusted, GitHub-derived
  // state_snapshot/context BEFORE dispatch, and return the bound items
  // (not rawItems) so every consumer — the evaluate call below AND the
  // caller's own post-evaluate use (evidence emission) — sees the same
  // trusted values. See bindTrustedStateSnapshot()'s header.
  const items = bindTrustedStateSnapshot(rawItems);

  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
    ...functionRegionHeaders(apiUrl),
  };

  const { decisions, batchId } = await loopEvaluate(apiUrl, headers, items);

  // Verify permits for every allow decision using the canonical verifyPermit()
  // from @atlasent/enforce. Fail-closed: if any verify throws, the error
  // propagates up.
  const verified = await Promise.all(
    decisions.map(async (d, i) => {
      if (d.decision !== "allow" || !d.permitToken) {
        return { ...d, verified: d.decision === "allow" ? false : undefined };
      }
      const item = items[i];
      const runtimeExecutionHash =
        d.executionHashExpected ?? d.execution_hash_expected;
      // Re-bind the SAME environment / target / artifact digest this item was
      // evaluated with, and REQUIRE each at verify (fail-closed). Previously the
      // batch verify sent only {action,actor} — an unbound verify that a cross-item,
      // wrong-environment, or artifact-substituted permit could still satisfy.
      const enforceConfig = {
        apiKey,
        apiUrl,
        action: item.action,
        actor: item.actor,
        environment: item.environment,
        targetId: item.target_id,
        executionPayloadHash: runtimeExecutionHash ?? item.execution_payload_hash,
        requiredBindings: requiredBindingsFor({
          environment: item.environment,
          targetId: item.target_id,
          executionPayloadHash: runtimeExecutionHash ?? item.execution_payload_hash,
        }),
      };
      const enforceDecision = {
        decision: "allow" as const,
        permitToken: d.permitToken,
        executionHashExpected: runtimeExecutionHash,
      };
      const result = await verifyPermit(enforceConfig, enforceDecision);
      return { ...d, verified: result.verified, verifyOutcome: result.outcome };
    }),
  );

  return { decisions: verified, batchId, items };
}

/** Per-item /v1-evaluate loop — the only batch transport. */
async function loopEvaluate(
  apiUrl: string,
  headers: Record<string, string>,
  items: EvaluateRequest[],
): Promise<{ decisions: Decision[]; batchId: string }> {
  const decisions: Decision[] = [];
  for (const item of items) {
    const r = await fetch(`${apiUrl}/v1-evaluate`, {
      method: "POST",
      headers,
      body: JSON.stringify(item),
    });
    if (!r.ok) {
      throw new Error(`atlasent /v1-evaluate ${r.status}`);
    }
    decisions.push((await r.json()) as Decision);
  }
  return { decisions, batchId: `loop-${Date.now()}` };
}
