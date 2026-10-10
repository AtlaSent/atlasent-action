// Wave B.AC4 preview — v2.1 entry point.
//
// Kept separate from src/index.ts so the existing v2.0 entry point
// stays byte-identical. B.AC4 wires this in once the new shape is
// reviewed.
//
// Flow:
//   1. parseInputs() detects single vs list shape.
//   2. evaluateMany() runs (single becomes a 1-item batch under the
//      hood, no separate code path).
//   3. If any decision is hold|escalate AND a wait-for-id is set,
//      waitForTerminalDecision() blocks until the upstream approver
//      flips it.
//   4. After terminal decisions are settled, the runtime evidence
//      emitter (B7) fires execution_started events for every allow+
//      verified decision. Best-effort, never blocks the action.
//   5. Job summary is rendered per evaluation.

import { verifyPermit, requiredBindingsFor } from "@atlasent/enforce";
import { evaluateMany } from "./batch";
import { parseInputs } from "./inputs";
import { waitForTerminalDecision } from "./stream";
import type { Decision, EvaluateRequest } from "./types";
import { emitEvidenceEvent } from "./evidenceClient";
import {
  OPTIONAL_VERIFIED_ACTOR_ACTIONS,
  PRODUCTION_DEPLOY_ACTION,
  SUPPLY_CHAIN_ASSERTION_ACTIONS,
  VERIFIED_ACTOR_REQUIRED_ACTIONS,
} from "./canonicalAction";
import {
  WorkloadIdentityError,
  mintGithubActionsActorIdentity,
  type MintedGithubActionsIdentity,
} from "./workloadIdentity";

export interface RunOutput {
  decisions: Decision[];
  /**
   * True when at least one decision was deny/hold/escalate, OR an "allow"
   * decision's permit did not verify (`verified !== true`). Gate on THIS,
   * not on scanning `decisions` for `decision === "allow"` alone — an
   * unverified allow is authorized nothing, per this repo's "gate on
   * verified, not decision" rule.
   */
  failed: boolean;
  batchId: string;
}

interface RunV21Deps {
  mintWorkloadIdentity?: typeof mintGithubActionsActorIdentity;
  mask?: (value: string) => void;
}

/**
 * Replace every production.deploy batch actor with a separately minted,
 * runtime-verified GitHub workload identity. A distinct mint per item keeps
 * the source OIDC credential and the resulting assertion single-use. Caller
 * supplied actor_identity fields are stripped from every item.
 *
 * OPTIONAL_VERIFIED_ACTOR_ACTIONS items (currently just package.release) get
 * the same opportunistic minting attempt as the single-eval path
 * (resolveProtectedActor in index.ts) — but a failure here falls back to the
 * item's own caller-supplied actor instead of throwing, since the runtime
 * does not (yet) require a verified actor for these. No change_plan is
 * constructed for them (that shape is mandatory-change-control-specific and
 * would be wrong for a release policy — see PACKAGE_RELEASE_ACTION's own
 * comment in canonicalAction.ts). See atlasent-action#166.
 */
async function bindBatchWorkloadIdentities(
  items: EvaluateRequest[],
  cfg: { apiKey: string; apiUrl: string },
  deps: RunV21Deps,
): Promise<EvaluateRequest[]> {
  const mint = deps.mintWorkloadIdentity ?? mintGithubActionsActorIdentity;
  const bound: EvaluateRequest[] = [];

  for (const item of items) {
    // artifact.release needs a minted actor AND a per-artifact supply_chain
    // assertion bound to its resource and digest. The batch path mints
    // neither, so refuse it here rather than send an item that can never
    // authorize (Codex on atlasent-action#199).
    if (SUPPLY_CHAIN_ASSERTION_ACTIONS.has(item.action) || VERIFIED_ACTOR_REQUIRED_ACTIONS.has(item.action)) {
      throw new WorkloadIdentityError(
        `"${item.action}" is not supported in batch mode: it needs a verified actor and a supply_chain ` +
          "assertion minted per artifact. Evaluate it with the single `action:` input instead.",
      );
    }
    const sanitized = { ...item };
    delete sanitized.actor_identity;

    if (item.action === PRODUCTION_DEPLOY_ACTION) {
      const environment = item.environment?.trim();
      if (!environment) {
        throw new WorkloadIdentityError(
          "Every production.deploy batch evaluation requires its own non-empty `environment` binding",
        );
      }

      const identity: MintedGithubActionsIdentity = await mint(
        {
          apiUrl: cfg.apiUrl,
          apiKey: cfg.apiKey,
          actionType: item.action,
          environment,
        },
        { mask: deps.mask },
      );

      // Mandatory production-change controls reject a caller-supplied raw
      // execution_payload_hash. Treat it as the artifact identity inside the
      // structured plan and bind the plan to the broker-verified GitHub SHA.
      const artifactRef = sanitized.execution_payload_hash;
      delete sanitized.execution_payload_hash;

      bound.push({
        ...sanitized,
        actor: identity.actorId,
        environment,
        actor_identity: identity.assertion,
        change_plan: {
          operation: "deploy",
          revision: identity.source.sha,
          ...(artifactRef ? { artifact_ref: artifactRef } : {}),
        },
        context: {
          ...(item.context ?? {}),
          triggering_actor: `github:${identity.source.actor}`,
        },
      });
      continue;
    }

    if (OPTIONAL_VERIFIED_ACTOR_ACTIONS.has(item.action)) {
      try {
        const identity: MintedGithubActionsIdentity = await mint(
          {
            apiUrl: cfg.apiUrl,
            apiKey: cfg.apiKey,
            actionType: item.action,
            environment: item.environment?.trim() || "production",
          },
          { mask: deps.mask },
        );
        bound.push({
          ...sanitized,
          actor: identity.actorId,
          actor_identity: identity.assertion,
          context: {
            ...(item.context ?? {}),
            triggering_actor: `github:${identity.source.actor}`,
          },
        });
      } catch {
        // Opportunistic only — fall back to the caller-supplied actor
        // exactly as before this minting attempt was added.
        bound.push(sanitized);
      }
      continue;
    }

    bound.push(sanitized);
  }

  return bound;
}

/**
 * Fire execution_started events for every successful authorization in a
 * batch. Pure function over (decisions, items) so the wiring is testable
 * without the upstream mocks. Best-effort: every failure is swallowed
 * and the function never throws.
 *
 * Skipped: deny / hold / escalate, missing permitToken, missing
 * evaluation id, verified !== true.
 */
export async function emitBatchEvidence(
  decisions: Decision[],
  items: EvaluateRequest[],
  cfg: { apiKey: string; apiUrl: string },
  log: { info: (m: string) => void; warning: (m: string) => void } = console as unknown as {
    info: (m: string) => void;
    warning: (m: string) => void;
  },
): Promise<void> {
  const tasks: Promise<void>[] = [];
  for (let i = 0; i < decisions.length; i++) {
    const d = decisions[i];
    const item = items[i];
    if (!d || !item) continue;
    if (d.decision !== "allow") continue;
    if (d.verified !== true) continue;
    if (!d.permitToken || !d.id) continue;

    tasks.push(
      emitEvidenceEvent(
        cfg,
        {
          event_type: "execution_started",
          permit_token: d.permitToken,
          evaluation_id: d.id,
          environment: item.environment ?? "unknown",
          execution_started_at: new Date().toISOString(),
          metadata: {
            ...(item.context ?? {}),
            source: "github-action-batch",
            action: item.action,
            actor: item.actor,
          },
        },
        log,
      ).catch((err) => {
        // emitEvidenceEvent already swallows; this is belt-and-braces
        // so that an unexpected throw can't bubble out of allSettled.
        const msg = err instanceof Error ? err.message : String(err);
        log.warning(`AtlaSent: batch emit threw (advisory): ${msg}`);
      }),
    );
  }
  await Promise.allSettled(tasks);
}

export async function runV21(
  env: Record<string, string | undefined>,
  flags: { v2Streaming: boolean },
  deps: RunV21Deps = {},
): Promise<RunOutput> {
  const inputs = parseInputs(env);
  const parsedItems = inputs.evaluations ?? [inputs.single!];
  const items = inputs.evaluations
    ? await bindBatchWorkloadIdentities(
        parsedItems,
        { apiKey: inputs.apiKey, apiUrl: inputs.apiUrl },
        deps,
      )
    : parsedItems;

  const batch = await evaluateMany(inputs.apiUrl, inputs.apiKey, items);

  // Use the items evaluateMany ACTUALLY evaluated (post-bindTrustedStateSnapshot
  // for production.deploy items), not the pre-bind `items` above, for
  // everything downstream — the wait-for-id verify lookup and, critically,
  // emitBatchEvidence(). Threading the pre-bind copy through to evidence
  // emission would let a caller-forged context.repository/ref/sha survive
  // into the authenticated execution_started audit record even though the
  // evaluate call itself was correctly bound (Codex finding on #148/#161).
  // Falls back to the pre-bind `items` only if a caller-supplied
  // evaluateMany mock omits `items` (see this file's own test mocks).
  const boundItems = batch.items ?? items;

  let decisions = batch.decisions;

  if (inputs.waitForId) {
    const idx = decisions.findIndex(
      (d) =>
        d.id === inputs.waitForId &&
        (d.decision === "hold" || d.decision === "escalate"),
    );
    if (idx >= 0) {
      // The approval-status endpoint returns the fresh permit but does not
      // repeat the execution hash derived during the original evaluation.
      // Preserve that immutable binding across hold/escalate → allow so the
      // fresh permit is still verified against the exact approved plan.
      const originalExecutionHash =
        decisions[idx].executionHashExpected ??
        decisions[idx].execution_hash_expected;
      const terminal = await waitForTerminalDecision({
        apiUrl: inputs.apiUrl,
        apiKey: inputs.apiKey,
        evaluationId: inputs.waitForId,
        timeoutMs: inputs.waitTimeoutMs ?? 600_000,
        v2Streaming: flags.v2Streaming,
      });
      decisions = [...decisions];
      if (terminal.decision === "allow") {
        // Terminal allow must be verified — same fail-closed contract as evaluateMany.
        // Uses @atlasent/enforce's canonical verifyPermit() implementation.
        const item = boundItems[idx];
        const runtimeExecutionHash =
          terminal.executionHashExpected ??
          terminal.execution_hash_expected ??
          originalExecutionHash;
        const vr = terminal.permitToken
          ? await verifyPermit(
              {
                apiKey: inputs.apiKey,
                apiUrl: inputs.apiUrl,
                action: item.action,
                actor: item.actor,
                // Bind + require the same environment / target / digest the item was
                // evaluated with. A terminal allow (hold→allow) is verified under the
                // SAME bindings as the direct-allow path — not an unbound verify.
                environment: item.environment,
                targetId: item.target_id,
                executionPayloadHash: runtimeExecutionHash ?? item.execution_payload_hash,
                requiredBindings: requiredBindingsFor({
                  environment: item.environment,
                  targetId: item.target_id,
                  executionPayloadHash: runtimeExecutionHash ?? item.execution_payload_hash,
                }),
              },
              {
                decision: "allow" as const,
                permitToken: terminal.permitToken,
                executionHashExpected: runtimeExecutionHash,
              },
            )
          : { verified: false as const, outcome: undefined };
        decisions[idx] = { ...terminal, verified: vr.verified, verifyOutcome: vr.outcome };
      } else {
        decisions[idx] = terminal;
      }
    }
  }

  // ── B7: emit runtime evidence for every successful authorization ──────────
  // Runs only after the wait-for-id reconciliation, so terminal allows that
  // started life as hold/escalate are still emitted. Best-effort; failures
  // don't change the RunOutput.
  await emitBatchEvidence(decisions, boundItems, {
    apiKey: inputs.apiKey,
    apiUrl: inputs.apiUrl,
  });

  // Fail-closed per this repo's own #1 rule (CLAUDE.md: "Gate on verified,
  // not decision"): a decision of "allow" whose permit did NOT verify
  // (verified !== true — replay_blocked, mismatch, expired, or any other
  // non-success outcome) must count as a failed batch item exactly like a
  // deny/hold/escalate would. Before this fix, `failed` only looked at
  // `d.decision`, so an allow-but-unverified item (e.g. artifact/context
  // mismatch caught by evaluateMany()'s own per-item verifyPermit() call)
  // silently reported `failed: false` — the run() caller in src/index.ts
  // happens to catch this via its own separate `allVerified` check today,
  // but that made this exported field's name a lie for any other/future
  // caller, and it also skipped the Slack/PR-comment "blocked" notification
  // that deny/hold/escalate correctly receive (see index.ts's `if
  // (result.failed)` branch) — an operator got no alert for a batch item
  // that was, in effect, denied at the execution boundary.
  const failed = decisions.some(
    (d) =>
      d.decision === "deny" ||
      d.decision === "hold" ||
      d.decision === "escalate" ||
      (d.decision === "allow" && d.verified !== true),
  );

  return { decisions, failed, batchId: batch.batchId };
}
