// Wave B.AC1 — input parser.
//
// The action accepts three mutually exclusive modes:
//   1. policy-sync=true  — post a policy bundle to v1-policy-sync
//   2. evaluations set   — fan out via v2.1 batch evaluate
//   3. action set        — single evaluation (v2.0 fallback)
//
// Mode 1 is checked first; within modes 2/3, `evaluations` wins over `action`.
// Existing single-eval workflows continue to work unchanged.

import type { EvaluateRequest } from "./types";
import {
  PRODUCTION_DEPLOY_ACTION,
  assertValidActionType,
  normalizeProtectedAction,
} from "./canonicalAction";
import { MISSING_API_KEY_HINT } from "./apiKeyHint";

// Re-exported for backward compatibility with consumers (and tests) that
// imported `PROTECTED_ACTION` from this module before the canonical
// helper was extracted into ./canonicalAction.
export const PROTECTED_ACTION = PRODUCTION_DEPLOY_ACTION;

export interface ActionInputs {
  apiKey: string;
  apiUrl: string;
  failOnDeny: boolean;
  /** When present, run policy sync instead of evaluation. */
  policySync?: {
    bundlePath: string;
    source?: string;
    dryRun: boolean;
  };
  /** When provided, fan out via evaluateMany. Otherwise single eval. */
  evaluations?: EvaluateRequest[];
  /** Single-input fallback (v2.0 path). */
  single?: EvaluateRequest;
  /** Optional change_window evaluation id to wait on after dispatch. */
  waitForId?: string;
  waitTimeoutMs?: number;
}

export function parseInputs(env: Record<string, string | undefined>): ActionInputs {
  const apiKey = required(env, "ATLASENT_API_KEY");
  const apiUrl =
    env["INPUT_API-URL"] ||
    env["ATLASENT_BASE_URL"] ||
    "https://api.atlasent.io/functions/v1";
  const failOnDeny = (env["INPUT_FAIL-ON-DENY"] || "true") === "true";

  // ── Policy sync mode (checked first) ────────────────────────────────────────
  const policySyncEnabled = (env["INPUT_POLICY-SYNC"] ?? "").toLowerCase() === "true";
  if (policySyncEnabled) {
    const bundlePath = (env["INPUT_POLICY-BUNDLE"] ?? "").trim();
    if (!bundlePath) {
      throw new Error("`policy-bundle` is required when `policy-sync` is 'true'");
    }
    const dryRun = (env["INPUT_POLICY-DRY-RUN"] ?? "true").toLowerCase() !== "false";
    return {
      apiKey,
      apiUrl,
      failOnDeny,
      policySync: {
        bundlePath,
        source: (env["INPUT_POLICY-SOURCE"] ?? "").trim() || undefined,
        dryRun,
      },
    };
  }

  // ── Batch evaluation mode ────────────────────────────────────────────────────
  const evaluationsRaw = env["INPUT_EVALUATIONS"];
  if (evaluationsRaw && evaluationsRaw.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(evaluationsRaw);
    } catch {
      throw new Error("`evaluations` is not valid JSON — expected a JSON array of evaluation requests");
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error(
        "`evaluations` must be a non-empty JSON array of evaluation requests",
      );
    }
    const evaluations = parsed as EvaluateRequest[];
    // Validate each item, then rewrite the action field to canonical so
    // downstream call sites (and the batch endpoint) always see
    // `production.deploy` on the wire — even when the workflow author
    // passed the legacy alias.
    for (const item of evaluations) {
      assertValidActionType(item.action);
      item.action = normalizeProtectedAction(item.action).canonical;
    }
    return {
      apiKey,
      apiUrl,
      failOnDeny,
      evaluations,
      waitForId: env["INPUT_WAIT-FOR-ID"] || undefined,
      waitTimeoutMs: parseInt(env["INPUT_WAIT-TIMEOUT-MS"] || "600000", 10),
    };
  }

  // ── Single-eval mode (v2.0 fallback) ────────────────────────────────────────
  const rawAction = required(env, "INPUT_ACTION");
  assertValidActionType(rawAction);
  // Normalize before forwarding: callers that pass the legacy alias
  // (`deployment.production`) get rewritten to the canonical
  // (`production.deploy`) here, so every downstream surface — the
  // evaluate POST body, GH Actions outputs, audit logs — carries the
  // canonical string.
  const action = normalizeProtectedAction(rawAction).canonical;
  const actor = env["INPUT_ACTOR"] || env["GITHUB_ACTOR"] || "unknown";
  const environment = env["INPUT_ENVIRONMENT"];
  const contextRaw = env["INPUT_CONTEXT"] || "{}";
  let context: Record<string, unknown> = {};
  try {
    context = JSON.parse(contextRaw) as Record<string, unknown>;
  } catch {
    throw new Error("`context` is not valid JSON — expected a JSON object");
  }

  return {
    apiKey,
    apiUrl,
    failOnDeny,
    single: { action, actor, environment, context },
    waitForId: env["INPUT_WAIT-FOR-ID"] || undefined,
    waitTimeoutMs: parseInt(env["INPUT_WAIT-TIMEOUT-MS"] || "600000", 10),
  };
}

function required(env: Record<string, string | undefined>, key: string): string {
  const v = env[key];
  if (!v) {
    throw new Error(
      key === "ATLASENT_API_KEY"
        ? `Missing required secret: ATLASENT_API_KEY. ${MISSING_API_KEY_HINT}`
        : `Missing required input: ${key.replace("INPUT_", "").toLowerCase()}`,
    );
  }
  return v;
}

