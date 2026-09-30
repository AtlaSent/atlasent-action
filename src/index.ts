// AtlaSent Gate Action — GitHub Actions entry point.
//
// Routing (in priority order):
//   any trajectory-* input set → fail closed immediately (unsupported —
//                           see docs/trajectory-verify.md); checked before
//                           every other mode below
//   release-mode set      → POST-deploy candidate registration + verify
//                           against atlasent-control-plane /v1/release/*
//   vqp-snapshot-id set   → VQP re-derivation audit (hash check + optional
//                           AI rerun drift detection) via v1-verify-vqp
//   posture-scan=true     → advisory GitHub security-posture report
//                           (branch protection, CODEOWNERS, Dependabot,
//                           CodeQL, secret scanning, org 2FA) via postureScan.ts.
//                           Never gates; calls no AtlaSent API.
//   policy-sync=true      → v1-policy-sync (post bundle, fail CI on rejection)
//   evaluations input set → v2.1 batch path via runV21()
//   single action input   → @atlasent/enforce (canonical enforcement wrapper)
//
// The enforcement contract (evaluate → verify → verifyPermit) lives entirely
// in @atlasent/enforce. This file handles GH Actions I/O: reading inputs,
// masking secrets, and translating EnforceResult / EnforceError into step
// outputs and exit codes.

import {
  enforce,
  evaluate,
  reverifyPermit,
  requiredBindingsFor,
  verify,
  verifyPermit,
  waitForApprovalResolution,
  EnforceError,
} from "@atlasent/enforce";
import type { ApprovalSigningHint, Decision, EnforceConfig } from "@atlasent/enforce";
import { GateInfraError } from "./gate";
import { runV21 } from "./v21";
import { runPolicySync } from "./policySync";
import {
  type AgentSeverity,
  renderStepSummary,
  runGovernanceAgents,
} from "./governanceAgents";
import {
  assessFinancialGovernance,
} from "./financialGovernanceAdvisory";
import type { FinancialAdvisoryInput } from "./financialGovernanceAdvisory";
import { emitEvidenceEvent } from "./evidenceClient";
import { registerAndVerify, summarizeOutcome } from "./releaseCandidate";
import { buildEvidenceBundle } from "./evidenceBundle";
import {
  callPostDeployEvidenceBundle,
  VALID_EVIDENCE_REGIMES,
  type EvidenceBundleRegime,
} from "./postDeployEvidenceBundle";
import {
  GATE_PERMITTED_ACTIONS,
  LEGACY_PRODUCTION_DEPLOY_ALIAS,
  MANDATORY_CHANGE_CONTROL_ACTIONS,
  OPTIONAL_VERIFIED_ACTOR_ACTIONS,
  PRODUCTION_DEPLOY_ACTION,
  assertValidActionType,
  normalizeProtectedAction,
} from "./canonicalAction";
import { normalizeExecutionPayloadHash } from "./executionPayloadHash";
import { runVqpVerify } from "./vqpVerify";
import { resolveApprovals, type ApprovalEvidence } from "./approvals";
import { buildGateStepSummary, type GateOutcome } from "./stepSummary";
import {
  buildManagementDecisionBrief,
  ChangeBriefError,
  renderChangeBriefStepSummary,
  runChangeBrief,
} from "./changeBrief";
import {
  WorkloadIdentityError,
  mintGithubActionsActorIdentity,
  type MintedGithubActionsIdentity,
} from "./workloadIdentity";
import { SoloOperatorAttestError, attestSoloOperator } from "./soloOperatorAttest";
import {
  GithubApprovalMintError,
  buildApprovalQuorum,
  mintGithubApprovalArtifacts,
} from "./githubApprovalMint";
import { renderPostureStepSummary, runPostureScan } from "./postureScan";
import { runInsightsEvaluate } from "./insights";

function getApiKey(): string {
  const apiKey = (process.env["ATLASENT_API_KEY"] ?? "").trim();
  if (!apiKey) {
    setFailed("ATLASENT_API_KEY is required");
  }
  return apiKey;
}

/**
 * Normalize the workflow-supplied `action` input to a canonical gate action
 * string. Legacy alias `deployment.production` is accepted and rewritten to
 * `production.deploy`. The canonical value must be in GATE_PERMITTED_ACTIONS
 * (currently `production.deploy` and `package.release`); anything else fails
 * closed with `decision=error`.
 *
 * The permitted set is a conservative client-side guard, not the authority —
 * the runtime policy decides allow/deny, and deny-by-default still applies to
 * an accepted action type that has no published bundle. Keeping the set
 * explicit means a workflow typo surfaces as a clear gate error here rather
 * than a confusing silent deny at the runtime.
 *
 * Returns the canonical string for downstream use. Callers should use the
 * returned value, NOT the raw input, so every downstream surface (evaluate
 * body, GH outputs, audit) carries the canonical.
 */
function normalizeAndValidateProtectedAction(actionType: string): string {
  const { canonical } = normalizeProtectedAction(actionType);
  if (!GATE_PERMITTED_ACTIONS.has(canonical)) {
    setOutput("decision", "error");
    setOutput("verified", "false");
    setFailed(
      `AtlaSent Gate: unsupported protected action "${actionType}". ` +
        `Permitted actions: ${[...GATE_PERMITTED_ACTIONS].map((a) => `"${a}"`).join(", ")} ` +
        `(legacy alias "${LEGACY_PRODUCTION_DEPLOY_ALIAS}" is accepted and normalized to "${PRODUCTION_DEPLOY_ACTION}").`,
    );
  }
  return canonical;
}

// ---------------------------------------------------------------------------
// GitHub Actions helpers
// ---------------------------------------------------------------------------

function getInput(name: string, required = false): string {
  const envKey = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
  const val = (process.env[envKey] ?? "").trim();
  if (required && !val) {
    setFailed(`Input required and not supplied: ${name}`);
  }
  return val;
}

function setOutput(name: string, value: string): void {
  const outputFile = process.env["GITHUB_OUTPUT"];
  if (outputFile) {
    const fs = require("node:fs");
    fs.appendFileSync(outputFile, `${name}=${value}\n`);
  }
}

function setFailed(message: string): never {
  console.log(`::error::${message}`);
  process.exit(1);
}

function warning(message: string): void {
  console.log(`::warning::${message}`);
}

function info(message: string): void {
  console.log(message);
}

function maskValue(value: string): void {
  console.log(`::add-mask::${value}`);
}

// ---------------------------------------------------------------------------
// GitHub commit status — fallback for orgs without the full App installation
// ---------------------------------------------------------------------------
//
// When GITHUB_TOKEN is available (always set in GitHub Actions) and
// GITHUB_SHA + GITHUB_REPOSITORY are set, we post a commit status so the
// PR checks UI reflects the AtlaSent gate result even without the App.
//
// This is intentionally best-effort: any network failure is logged as a
// warning and never blocks the gate decision.

type CommitStatusState = "success" | "failure" | "pending" | "error";

async function postCommitStatus(args: {
  repository: string;
  sha: string;
  state: CommitStatusState;
  description: string;
  context?: string;
  targetUrl?: string;
}): Promise<void> {
  const token = process.env["GITHUB_TOKEN"];
  if (!token || !args.sha || !args.repository) return;

  const apiBase =
    process.env["GITHUB_API_URL"] ?? "https://api.github.com";
  const url = `${apiBase}/repos/${args.repository}/statuses/${args.sha}`;

  const body: Record<string, string> = {
    state: args.state,
    description: args.description.slice(0, 140), // GitHub caps at 140 chars
    context: args.context ?? "AtlaSent Policy Gate",
  };
  if (args.targetUrl) body.target_url = args.targetUrl;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "<unreadable>");
      warning(`AtlaSent: commit status post failed (${res.status}): ${text}`);
    }
  } catch (err) {
    warning(
      `AtlaSent: commit status post error (advisory, non-blocking): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

// ---------------------------------------------------------------------------
// Shared notification context — used by notifySlack, notifyTeams, and
// buildGateDenyComment so the "what happened" vocabulary (label) stays in
// one place across all three outbound-notification surfaces.
// ---------------------------------------------------------------------------

interface NotificationOpts {
  decision: string;
  action: string;
  actor: string;
  environment: string;
  reason: string;
  runUrl: string;
  evaluationId?: string;
  auditHash?: string;
}

/** Human-readable decision label shared by Slack, Teams, and PR-comment notifications. */
function decisionLabel(decision: string): string {
  switch (decision) {
    case "deny":
      return "DENIED";
    case "hold":
      return "ON HOLD";
    case "escalate":
      return "ESCALATED";
    default:
      return "BLOCKED";
  }
}

// ---------------------------------------------------------------------------
// Outbound Slack notification — informational, not interactive.
// Fires on deny / hold / escalate when the slack-webhook input is set.
// Best-effort: never blocks or alters the gate decision.
// ---------------------------------------------------------------------------
async function notifySlack(webhookUrl: string, opts: NotificationOpts): Promise<void> {
  const emoji =
    opts.decision === "deny"
      ? ":no_entry:"
      : opts.decision === "hold"
        ? ":hourglass_flowing_sand:"
        : opts.decision === "escalate"
          ? ":rotating_light:"
          : ":warning:";
  const label = decisionLabel(opts.decision);

  const fields: { type: "mrkdwn"; text: string }[] = [
    { type: "mrkdwn", text: `*Actor:*\n${opts.actor}` },
    { type: "mrkdwn", text: `*Environment:*\n${opts.environment}` },
  ];
  if (opts.evaluationId) {
    fields.push({ type: "mrkdwn", text: `*Evaluation ID:*\n${opts.evaluationId}` });
  }
  if (opts.auditHash) {
    fields.push({
      type: "mrkdwn",
      text: `*Audit hash:*\n\`${opts.auditHash.slice(0, 16)}…\``,
    });
  }

  const payload = {
    text: `${emoji} AtlaSent Deploy Gate ${label}: ${opts.action} (${opts.environment})`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `${emoji} AtlaSent: Deploy ${label}`, emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Action:* \`${opts.action}\`\n*Reason:* ${opts.reason}`,
        },
      },
      { type: "section", fields },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View Run", emoji: false },
            url: opts.runUrl,
          },
        ],
      },
    ],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      warning(`AtlaSent: Slack notification failed (${res.status}) — advisory, non-blocking`);
    }
  } catch (err) {
    warning(
      `AtlaSent: Slack notification error (advisory, non-blocking): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

// ---------------------------------------------------------------------------
// Outbound Microsoft Teams notification — informational, not interactive.
// Fires on deny / hold / escalate when the teams-webhook input is set.
// Best-effort: never blocks or alters the gate decision.
//
// Uses the legacy Office 365 Connector "MessageCard" schema (still the
// format accepted by a Teams channel's Incoming Webhook connector) rather
// than an Adaptive Card, since it needs no card-schema library and maps
// naturally onto the same title/section/facts/action shape notifySlack
// already builds.
// ---------------------------------------------------------------------------
async function notifyTeams(webhookUrl: string, opts: NotificationOpts): Promise<void> {
  const themeColor =
    opts.decision === "deny"
      ? "D9534F" // red
      : opts.decision === "hold"
        ? "F0AD4E" // amber
        : opts.decision === "escalate"
          ? "D9534F" // red
          : "808080"; // grey
  const label = decisionLabel(opts.decision);

  const facts: { name: string; value: string }[] = [
    { name: "Actor", value: opts.actor },
    { name: "Environment", value: opts.environment },
  ];
  if (opts.evaluationId) {
    facts.push({ name: "Evaluation ID", value: opts.evaluationId });
  }
  if (opts.auditHash) {
    facts.push({ name: "Audit hash", value: `${opts.auditHash.slice(0, 16)}…` });
  }

  const payload = {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    themeColor,
    summary: `AtlaSent Deploy Gate ${label}: ${opts.action} (${opts.environment})`,
    sections: [
      {
        activityTitle: `AtlaSent: Deploy ${label}`,
        text: `**Action:** \`${opts.action}\`\n\n**Reason:** ${opts.reason}`,
        facts,
      },
    ],
    potentialAction: [
      {
        "@type": "OpenUri",
        name: "View Run",
        targets: [{ os: "default", uri: opts.runUrl }],
      },
    ],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      warning(`AtlaSent: Teams notification failed (${res.status}) — advisory, non-blocking`);
    }
  } catch (err) {
    warning(
      `AtlaSent: Teams notification error (advisory, non-blocking): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

// ---------------------------------------------------------------------------
// PR comment — posted on deny / hold / escalate when a PR number is detected
// and pr-comment-on-deny is not "false".
// Best-effort: never blocks or alters the gate decision.
// ---------------------------------------------------------------------------
function buildGateDenyComment(opts: {
  decision: string;
  reason: string;
  action: string;
  actor: string;
  environment: string;
  runUrl: string;
  evaluationId?: string;
  auditHash?: string;
}): string {
  const icon =
    opts.decision === "deny"
      ? "🔴"
      : opts.decision === "hold"
        ? "🟡"
        : opts.decision === "escalate"
          ? "🚨"
          : "❌";
  const label = decisionLabel(opts.decision);

  const lines = [
    `## ${icon} AtlaSent Deploy Gate — ${label}`,
    "",
    `The AtlaSent gate blocked \`${opts.action}\` for actor **${opts.actor}** in **${opts.environment}**.`,
    "",
    `**Decision:** \`${opts.decision}\``,
    `**Reason:** ${opts.reason}`,
  ];
  if (opts.evaluationId) {
    lines.push(`**Evaluation ID:** \`${opts.evaluationId}\``);
  }
  if (opts.auditHash) {
    lines.push(`**Audit hash:** \`${opts.auditHash.slice(0, 24)}…\``);
  }
  lines.push("", `[View workflow run](${opts.runUrl})`);
  if (opts.decision === "hold" || opts.decision === "escalate") {
    lines.push(
      "",
      "> **Next step:** An authorized reviewer must approve this deployment in the [AtlaSent console](https://console.atlasent.io/approvals) or via the Slack Approval Bot.",
    );
  }
  return lines.join("\n");
}

async function postPRComment(args: {
  repository: string;
  prNumber: string;
  body: string;
}): Promise<void> {
  const token = process.env["GITHUB_TOKEN"];
  if (!token || !args.repository || !args.prNumber) return;

  const apiBase = process.env["GITHUB_API_URL"] ?? "https://api.github.com";
  const url = `${apiBase}/repos/${args.repository}/issues/${args.prNumber}/comments`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ body: args.body }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "<unreadable>");
      warning(
        `AtlaSent: PR comment post failed (${res.status}): ${text.slice(0, 200)} — advisory, non-blocking`,
      );
    }
  } catch (err) {
    warning(
      `AtlaSent: PR comment post error (advisory, non-blocking): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

// ---------------------------------------------------------------------------
// GitHub context
// ---------------------------------------------------------------------------

interface GitHubContext {
  repository: string;
  ref: string;
  sha: string;
  run_id: string;
  run_number: string;
  workflow: string;
  event_name: string;
  pr_number: string | undefined;
  server_url: string;
}

function getGitHubContext(): GitHubContext {
  return {
    repository: process.env["GITHUB_REPOSITORY"] ?? "",
    ref: process.env["GITHUB_REF"] ?? "",
    sha: process.env["GITHUB_SHA"] ?? "",
    run_id: process.env["GITHUB_RUN_ID"] ?? "",
    run_number: process.env["GITHUB_RUN_NUMBER"] ?? "",
    workflow: process.env["GITHUB_WORKFLOW"] ?? "",
    event_name: process.env["GITHUB_EVENT_NAME"] ?? "",
    pr_number: process.env["GITHUB_REF"]?.match(/^refs\/pull\/(\d+)\//)?.[1],
    server_url: process.env["GITHUB_SERVER_URL"] ?? "https://github.com",
  };
}

function resolveEnvironment(explicit: string, ref: string, apiKey: string): string {
  if (explicit) return explicit;
  if (apiKey.startsWith("ask_test_")) return "test";
  if (apiKey.startsWith("ask_live_")) return "live";
  const branch = ref.replace("refs/heads/", "");
  return branch === "main" || branch === "master" ? "live" : "test";
}

interface ProtectedActorResolution {
  actorId: string;
  triggeringActorId: string;
  workloadIdentity?: MintedGithubActionsIdentity;
}

/**
 * The four MANDATORY_CHANGE_CONTROL_ACTIONS are classified by the runtime as
 * requiring a verified workload actor. Resolve that actor through GitHub
 * OIDC + the runtime broker; never fall back to the workflow's caller-
 * supplied `actor` input — a minting failure here fails the step closed.
 *
 * OPTIONAL_VERIFIED_ACTOR_ACTIONS (currently just `package.release`, see its
 * own doc comment in canonicalAction.ts) get the SAME opportunistic minting
 * attempt, but a failure falls back to the existing self-asserted actor
 * instead of failing closed — the runtime does not (yet) require a verified
 * actor for these, so a broker/OIDC failure here is a missing enhancement,
 * not a security failure. This is what lets a repo/workflow start getting a
 * verified `package.release` actor the moment it's enrolled with the broker
 * and grants `id-token: write`, with zero behavior change for every caller
 * that hasn't done either yet. See atlasent-api#1942.
 *
 * Every other protected action retains its existing actor behavior until its
 * own Canon contract requires the same workload credential.
 */
async function resolveProtectedActor(args: {
  apiKey: string;
  apiUrl: string;
  actionType: string;
  environment: string;
  triggeringActor: string;
}): Promise<ProtectedActorResolution> {
  const triggeringActorId = `github:${args.triggeringActor}`;
  const isMandatory = MANDATORY_CHANGE_CONTROL_ACTIONS.has(args.actionType);
  const isOptional = OPTIONAL_VERIFIED_ACTOR_ACTIONS.has(args.actionType);
  if (!isMandatory && !isOptional) {
    return { actorId: triggeringActorId, triggeringActorId };
  }

  try {
    const workloadIdentity = await mintGithubActionsActorIdentity(
      {
        apiUrl: args.apiUrl,
        apiKey: args.apiKey,
        actionType: args.actionType,
        environment: args.environment,
      },
      { mask: maskValue },
    );
    return {
      actorId: workloadIdentity.actorId,
      triggeringActorId: `github:${workloadIdentity.source.actor}`,
      workloadIdentity,
    };
  } catch (error) {
    if (isMandatory) throw error;
    warning(
      `AtlaSent gate: could not obtain a verified workload actor for "${args.actionType}" — ` +
        `falling back to the caller-supplied actor "${triggeringActorId}": ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
    return { actorId: triggeringActorId, triggeringActorId };
  }
}

// ---------------------------------------------------------------------------
// Output helpers — translate a Decision object into GH Actions outputs.
// Must be called BEFORE setFailed/warning so outputs are visible on failure.
// ---------------------------------------------------------------------------

function setDecisionOutputs(d: Decision): void {
  if (d.permitToken) maskValue(d.permitToken);
  if (d.proofHash) maskValue(d.proofHash);
  setOutput("decision", d.decision);
  setOutput("permit-token", d.permitToken ?? "");
  setOutput("evaluation-id", d.evaluationId ?? "");
  setOutput("execution-hash", d.executionHashExpected ?? "");
  setOutput("proof-hash", d.proofHash ?? "");
  setOutput("risk-score", d.riskScore !== undefined ? String(d.riskScore) : "");
  setOutput("chain-entry", JSON.stringify(d.chainEntry ?? null));
  setOutput("snapshot", JSON.stringify(d.snapshot ?? null));
  setOutput("audit-hash", d.auditHash ?? "");
}

// ---------------------------------------------------------------------------
// Financial Governance Advisory — non-blocking, advisory only.
// ---------------------------------------------------------------------------

function appendToStepSummary(content: string): void {
  const summaryFile = process.env["GITHUB_STEP_SUMMARY"];
  if (summaryFile) {
    try {
      const fs = require("node:fs");
      fs.appendFileSync(summaryFile, content);
    } catch {
      // Non-fatal: advisory only
    }
  }
}

function emitFinancialGovernanceAdvisory(
  actionType: string,
  actor: string,
  orgId: string,
): void {
  const governanceMode = getInput("financial-governance");
  if (governanceMode !== "advisory") return;

  const rawValue = getInput("financial-action-value");
  const currency = getInput("financial-action-currency") || "USD";

  const actionValue = rawValue ? parseFloat(rawValue) : null;

  const advisoryInput: FinancialAdvisoryInput = {
    actionType,
    actionValue: actionValue !== null && !isNaN(actionValue) ? actionValue : null,
    currency,
    actorId: actor,
    orgId,
  };

  let advisory;
  try {
    advisory = assessFinancialGovernance(advisoryInput);
  } catch {
    warning("Financial governance advisory: assessment failed (non-fatal)");
    return;
  }

  setOutput("financial-governance-advice", JSON.stringify(advisory));

  info(`[Financial Governance Advisory] ${advisory.summary}`);
  for (const signal of advisory.signals) {
    info(`  • ${signal}`);
  }

  const tierEmoji: Record<string, string> = {
    non_financial: "⚪",
    low: "🟢",
    medium: "🟡",
    high: "🟠",
    critical: "🔴",
  };
  const emoji = tierEmoji[advisory.riskTier] ?? "⚪";
  const signalLines =
    advisory.signals.length > 0
      ? advisory.signals.map((s) => `- ${s}`).join("\n")
      : "- No advisory signals";

  const summaryBlock = [
    "",
    "---",
    `## ${emoji} Financial Governance Advisory`,
    "",
    `| Field | Value |`,
    `|---|---|`,
    `| Risk Tier | \`${advisory.riskTier}\` |`,
    `| Risk Score | ${advisory.riskScore} / 100 |`,
    `| Evidence Required | ${advisory.evidenceRequired ? "**Yes**" : "No"} |`,
    `| Action Type | \`${actionType}\` |`,
    `| Actor | \`${actor}\` |`,
    `| Currency | ${currency} |`,
    actionValue !== null
      ? `| Action Value | $${actionValue.toLocaleString("en-US", { maximumFractionDigits: 2 })} |`
      : `| Action Value | N/A |`,
    "",
    "### Advisory Signals",
    "",
    signalLines,
    "",
    "> **Advisory only** — this assessment is non-blocking and does not affect enforcement decisions.",
    "",
  ].join("\n");

  appendToStepSummary(summaryBlock);
}

// ---------------------------------------------------------------------------
// Policy Sync step handler
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Governance Agents step — advisory PR-check mode
// ---------------------------------------------------------------------------
//
// Findings are signal, not authorization. The step:
//   1. Parses the comma-separated `governance-agents` slug list.
//   2. Invokes each agent via /v1/governance/agents/<slug>/evaluate.
//   3. Renders a job-summary table per agent with severity / type /
//      authority / one-line summary.
//   4. Optionally fails the step when `governance-fail-on-severity` is set
//      and a finding meets or exceeds that severity. Default: never fails.
//
// Outputs:
//   governance-findings-count   total findings across agents
//   governance-highest-severity worst severity emitted (or empty)
//   governance-evaluations      JSON-encoded evaluation summaries
//   governance-findings         JSON-encoded findings array

const VALID_SEVERITIES: readonly AgentSeverity[] = [
  "info",
  "low",
  "medium",
  "high",
  "blocker",
];

// ── Verify-permit (execution boundary) step ──────────────────────────────────
//
// Re-verifies an existing permit immediately before the protected step. The
// artifact digest + environment are re-bound at verify time so a permit issued
// for one artifact/environment cannot authorize another. Fails closed on any
// missing / modified / expired / replayed / denied / mismatched permit.
async function runVerifyPermitStep(apiKey: string, apiUrl: string): Promise<void> {
  const permitToken = getInput("permit-token", true);
  const rawActionType = getInput("action", true);
  const actionType = normalizeAndValidateProtectedAction(rawActionType);
  const actor = getInput("actor") || "unknown";
  const targetId = getInput("target-id") || undefined;
  const artifactDigest = getInput("artifact-digest") || undefined;
  const runtimeExecutionHash = getInput("execution-hash") || undefined;
  const gh = getGitHubContext();
  const environment = resolveEnvironment(getInput("environment"), gh.ref, apiKey);

  // The cloud execution locus (context.aws / context.azure) signed into the
  // permit at evaluate must be presented again here: v1-verify-permit treats
  // an absent locus as AWS_/AZURE_LOCUS_MISMATCH. @atlasent/enforce sends only
  // those two keys from config.context, so pass the same `context` input the
  // evaluate step used. Unparseable JSON fails closed rather than silently
  // verifying without the locus.
  let boundaryContext: Record<string, unknown> | undefined;
  const rawContext = getInput("context");
  if (rawContext) {
    try {
      const parsed: unknown = JSON.parse(rawContext);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      boundaryContext = parsed as Record<string, unknown>;
    } catch {
      setOutput("decision", "deny");
      setOutput("verified", "false");
      setOutput("verify-outcome", "invalid");
      setOutput("verify-error-code", "INVALID_CONTEXT");
      setFailed("Deploy blocked at execution boundary: the 'context' input is not a JSON object.");
      return;
    }
  }

  // A prior evaluate-only step's resolved-actor output, passed through
  // unchanged, is authoritative when present for an
  // OPTIONAL_VERIFIED_ACTOR_ACTIONS type: it's the exact actor that step
  // presented to the runtime, so re-resolving here (a second, independent
  // OIDC + broker round trip) could disagree with it if minting is flaky
  // between the two jobs, breaking an otherwise-good permit's actor binding.
  // See resolveProtectedActor's doc comment and atlasent-action#166.
  //
  // SECURITY: restricted to OPTIONAL_VERIFIED_ACTOR_ACTIONS only (Codex
  // review on #167). For a MANDATORY_CHANGE_CONTROL_ACTIONS type (e.g.
  // production.deploy), honoring a caller-supplied resolved-actor here
  // would let a boundary job skip resolveProtectedActor()'s mandatory OIDC
  // mint + broker admission check entirely — a plain text input, not a
  // verified credential — defeating the exact fail-closed workload-identity
  // requirement this repo treats as non-negotiable for those four types.
  // Mandatory actions always re-resolve independently below, regardless of
  // whether resolved-actor was supplied.
  const carriedActor = OPTIONAL_VERIFIED_ACTOR_ACTIONS.has(actionType)
    ? getInput("resolved-actor") || undefined
    : undefined;
  let actorId: string;
  if (carriedActor) {
    actorId = carriedActor;
  } else {
    let actorResolution: ProtectedActorResolution;
    try {
      actorResolution = await resolveProtectedActor({
        apiKey,
        apiUrl,
        actionType,
        environment,
        triggeringActor: actor,
      });
    } catch (error) {
      setOutput("decision", "deny");
      setOutput("verified", "false");
      setOutput("verify-outcome", "actor_unverified");
      setOutput("verify-error-code", "ACTOR_UNVERIFIED");
      setFailed(
        `Deploy blocked at execution boundary: ${
          error instanceof WorkloadIdentityError || error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
      return;
    }
    actorId = actorResolution.actorId;
  }

  if (MANDATORY_CHANGE_CONTROL_ACTIONS.has(actionType) && !runtimeExecutionHash) {
    setOutput("decision", "deny");
    setOutput("verified", "false");
    setOutput("verify-outcome", "invalid");
    setOutput("verify-error-code", "MISSING_BINDING");
    setFailed(
      `Deploy blocked at execution boundary: "${actionType}" requires the opaque ` +
        "execution-hash output from its evaluate-only gate. The raw artifact-digest is " +
        "not the runtime-derived change-plan binding.",
    );
    return;
  }

  // Non-mandatory-change-control types (e.g. package.release) forward
  // artifact-digest directly as the payload hash the runtime binds into the
  // permit — normalize a common OCI-form digest (sha256:<hex>) to the bare
  // hex the server requires, or every such call deterministically fails
  // PAYLOAD_MISMATCH at this boundary re-verify. See executionPayloadHash.ts.
  const verificationPayloadHash =
    MANDATORY_CHANGE_CONTROL_ACTIONS.has(actionType)
      ? runtimeExecutionHash
      : normalizeExecutionPayloadHash(artifactDigest);

  maskValue(permitToken);

  const config: EnforceConfig = {
    apiKey,
    apiUrl,
    action: actionType,
    actor: actorId,
    environment,
    targetId,
    executionPayloadHash: verificationPayloadHash,
    ...(boundaryContext ? { context: boundaryContext } : {}),
    // Boundary re-verify must re-present every binding it was given, or fail
    // closed (MISSING_BINDING) — never a silently-unbound boundary verify.
    requiredBindings: requiredBindingsFor({
      environment,
      targetId,
      executionPayloadHash: verificationPayloadHash,
    }),
  };

  info(
    `AtlaSent boundary re-verification: "${actionType}" for "${actorId}" in ${environment}` +
      (artifactDigest ? ` (artifact=${artifactDigest})` : ""),
  );

  try {
    const r = await reverifyPermit(config, permitToken);
    setOutput("decision", "allow");
    setOutput("verified", "true");
    setOutput("verify-outcome", r.outcome ?? "verified");
    setOutput("verify-error-code", "");
    setOutput("permit-token", permitToken);
    setOutput("audit-hash", r.auditHash ?? "");
    setOutput("verify-audit-hash", r.verifyAuditHash ?? "");
    info(
      `Permit re-verified at the execution boundary (outcome=${r.outcome ?? "verified"}). Deployment may proceed.`,
    );
  } catch (err) {
    setOutput("decision", "deny");
    setOutput("verified", "false");
    if (err instanceof EnforceError) {
      setOutput("verify-outcome", err.outcome ?? "invalid");
      setOutput("verify-error-code", err.verifyErrorCode ?? "");
      setFailed(
        `Deploy blocked at execution boundary (outcome=${err.outcome ?? "unknown"}` +
          `${err.verifyErrorCode ? `, code=${err.verifyErrorCode}` : ""}): ${err.message}`,
      );
      // Fail closed, but do NOT fall through — that clobbered the precise
      // verify-outcome / verify-error-code with a generic "invalid".
      return;
    }
    setOutput("verify-outcome", "invalid");
    setOutput("verify-error-code", "");
    setFailed(
      `Deploy blocked at execution boundary: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Posture Scan step — advisory GitHub security-posture report
// ---------------------------------------------------------------------------
//
// Reports on the CALLING repo's own GitHub security hygiene using only the
// GITHUB_TOKEN + checked-out working tree already available in this run.
// Never gates, never calls the AtlaSent API, never fabricates a signal:
// every finding is either a directly observed present/absent result or an
// honest `unknown` with a specific, evidence-backed reason. See
// postureScan.ts's header for exactly what is/isn't observable and why.
async function runPostureScanStep(): Promise<void> {
  const gh = getGitHubContext();
  const token = getInput("posture-scan-token") || process.env["GITHUB_TOKEN"] || "";
  const apiBase = process.env["GITHUB_API_URL"] ?? "https://api.github.com";

  info(`AtlaSent Posture Scan: scanning ${gh.repository || "(repository unknown)"}`);

  const result = await runPostureScan({
    repository: gh.repository,
    token,
    apiBase,
    log: info,
    warn: warning,
  });

  setOutput("posture-findings", JSON.stringify(result.findings));
  setOutput("posture-observed-count", String(result.observed_count));
  setOutput("posture-not-observable-count", String(result.not_observable_count));
  setOutput("posture-not-applicable-count", String(result.not_applicable_count));
  setOutput(
    "posture-summary",
    `${result.present_count} present / ${result.absent_count} absent / ` +
      `${result.not_observable_count} not observable` +
      (result.not_applicable_count > 0 ? ` / ${result.not_applicable_count} not applicable` : "") +
      ` (of ${result.findings.length} signals)`,
  );

  appendToStepSummary(renderPostureStepSummary(result));

  for (const f of result.findings) {
    if (f.status === "unknown") {
      info(`Posture Scan: ${f.label} — unknown (${f.reason}): ${f.detail}`);
    } else {
      info(`Posture Scan: ${f.label} — ${f.status}: ${f.detail}`);
    }
  }

  info(
    `AtlaSent Posture Scan complete: ${result.observed_count}/${result.findings.length} signals ` +
      `observed. Advisory only — this step never fails the run.`,
  );
}

async function runGovernanceAgentsStep(apiKey: string, apiUrl: string): Promise<void> {
  const slugsRaw = getInput("governance-agents", true);
  const agentSlugs = slugsRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (agentSlugs.length === 0) {
    setFailed("governance-agents input is empty after trimming");
    return;
  }

  const changeId = getInput("governance-change-id", true);
  const artifactFile = getInput("governance-artifact-file") || undefined;
  const failOnBlocker = getInput("governance-fail-on-blocker").toLowerCase() === "true";
  const failOnSeverityRaw = getInput("governance-fail-on-severity");
  let failOnSeverity: AgentSeverity | undefined;
  if (failOnSeverityRaw) {
    if (!VALID_SEVERITIES.includes(failOnSeverityRaw as AgentSeverity)) {
      setFailed(
        `governance-fail-on-severity must be one of ${VALID_SEVERITIES.join("|")} (got "${failOnSeverityRaw}")`,
      );
      return;
    }
    failOnSeverity = failOnSeverityRaw as AgentSeverity;
  } else if (failOnBlocker) {
    failOnSeverity = "blocker";
  }

  const gh = getGitHubContext();
  info(
    `AtlaSent Governance Agents: running [${agentSlugs.join(", ")}] against change ${changeId} ` +
      `(commit ${gh.sha.slice(0, 8)})`,
  );

  let result;
  try {
    result = await runGovernanceAgents({
      apiKey,
      apiUrl,
      changeId,
      agentSlugs,
      artifactFile,
      failOnSeverity,
      invokedBy: `github-action:${gh.repository}@${gh.sha.slice(0, 8)}`,
    });
  } catch (err) {
    setOutput("governance-findings-count", "0");
    setOutput("governance-highest-severity", "");
    setOutput("governance-evaluations", "[]");
    setOutput("governance-findings", "[]");
    setFailed(
      `AtlaSent Governance Agents: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  setOutput("governance-findings-count", String(result.findings.length));
  setOutput("governance-highest-severity", result.highest_severity ?? "");
  setOutput("governance-evaluations", JSON.stringify(result.evaluations));
  setOutput("governance-findings", JSON.stringify(result.findings));

  appendToStepSummary(renderStepSummary(result));

  if (result.failed) {
    setFailed(
      `Governance findings at or above severity "${failOnSeverity}" — highest emitted: ${result.highest_severity}`,
    );
    return;
  }

  if (result.highest_severity) {
    warning(
      `Governance Agents: highest severity ${result.highest_severity} (advisory; not gating)`,
    );
  } else {
    info("Governance Agents: no findings.");
  }
}

async function runPolicySyncStep(apiKey: string, apiUrl: string): Promise<void> {
  const bundlePath = getInput("policy-bundle", true);
  const source = getInput("policy-source") || "github-action";
  const dryRun = getInput("policy-dry-run").toLowerCase() !== "false";
  const gh = getGitHubContext();

  info(
    `AtlaSent Policy Sync: submitting "${bundlePath}" ` +
      `(source=${source}, dry_run=${dryRun}, sha=${gh.sha.slice(0, 8)})`,
  );

  let result;
  try {
    result = await runPolicySync({
      apiKey,
      apiUrl,
      bundlePath,
      source,
      commitSha: gh.sha,
      ref: gh.ref,
      dryRun,
    });
  } catch (err) {
    setOutput("sync-run-id", "");
    setOutput("sync-status", "error");
    setOutput("sync-diff", "");
    setOutput("sync-summary", "");
    setFailed(
      `AtlaSent Policy Sync: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return;
  }

  const { run, diff, rejected } = result;

  setOutput("sync-run-id", run.id ?? "");
  setOutput("sync-status", run.status);
  setOutput("sync-diff", diff);
  setOutput(
    "sync-summary",
    JSON.stringify({
      added: run.policies_added,
      updated: run.policies_updated,
      removed: run.policies_removed,
      status: run.status,
    }),
  );

  appendToStepSummary(
    [
      "",
      "## 📋 AtlaSent Policy Sync",
      "",
      `| Field | Value |`,
      `|---|---|`,
      `| Run ID | \`${run.id ?? "n/a"}\` |`,
      `| Status | \`${run.status}\` |`,
      `| Mode | ${dryRun ? "Dry run (preview only)" : "Applied"} |`,
      `| Changes | ${diff} |`,
      `| Source | \`${source}\` |`,
      `| Ref | \`${gh.ref}\` |`,
      `| Commit | \`${gh.sha.slice(0, 8)}\` |`,
      "",
    ].join("\n"),
  );

  if (rejected) {
    setFailed(
      `AtlaSent Policy Sync: bundle ${run.status} — ${diff}. ` +
        `Fix policy errors and push again.`,
    );
    return;
  }

  if (dryRun) {
    info(`Policy sync dry run: ${diff}`);
    info(`  Run ID: ${run.id}`);
    info(`  Set policy-dry-run: 'false' on the default branch to apply.`);
  } else {
    info(`Policy sync applied: ${diff}`);
    info(`  Run ID: ${run.id}`);
  }
}

// ---------------------------------------------------------------------------
// Change Brief step — preparation artifact for human review.
//
// Gathers GitHub/CI facts this run already has access to (base/head SHA,
// changed files, check-run conclusions) and calls v1-change-brief. Never
// authorizes anything and never gates a deploy on its own — a separate
// evaluate/verify (the default `action:` mode) remains the actual
// authorization boundary. This step's job is to give a human reviewer real
// facts instead of "no change tool connected".
// ---------------------------------------------------------------------------

async function runChangeBriefStep(apiKey: string, apiUrl: string): Promise<void> {
  const gh = getGitHubContext();
  const actor = getInput("actor") || "unknown";
  const environment = resolveEnvironment(getInput("environment"), gh.ref, apiKey);
  const actionType = (
    getInput("change-brief-action") || getInput("action") || PRODUCTION_DEPLOY_ACTION
  ).trim();
  const targetSystem = getInput("change-brief-target-system") || "github";
  const targetId = getInput("change-brief-target-id") || getInput("target-id") || gh.repository;
  const changeRequest = getInput("change-request") || undefined;
  const consoleBaseUrl = (getInput("console-base-url") || "https://console.atlasent.io").replace(
    /\/$/,
    "",
  );

  const rollbackPreviousSha = getInput("rollback-previous-sha") || undefined;
  const rollbackWorkflow = getInput("rollback-workflow") || undefined;
  const rollbackReference = getInput("rollback-reference") || undefined;
  const rollback =
    rollbackPreviousSha || rollbackWorkflow || rollbackReference
      ? {
          previous_deployed_sha: rollbackPreviousSha ?? null,
          rollback_workflow: rollbackWorkflow ?? null,
          rollback_reference: rollbackReference ?? null,
        }
      : undefined;

  info(
    `AtlaSent Change Brief: preparing "${actionType}" for ${targetSystem}/${targetId} ` +
      `(${environment}), commit ${gh.sha.slice(0, 8)}`,
  );

  const clearOutputs = (): void => {
    setOutput("change-brief-id", "");
    setOutput("change-brief-recommendation", "");
    setOutput("change-brief-classification", "");
    setOutput("change-brief-material-differences-count", "");
    setOutput("change-brief-canonical-plan-digest", "");
    setOutput("change-brief-console-url", "");
    setOutput("change-brief-decision-readiness", "");
    setOutput("change-brief-source-collection", "");
    setOutput("change-brief-blocking-evidence-count", "");
    setOutput("change-brief-decision-brief", "");
  };

  let result;
  try {
    result = await runChangeBrief({
      apiKey,
      apiUrl,
      actionType,
      targetSystem,
      targetId,
      environment,
      actorId: `github:${actor}`,
      changeRequest,
      githubToken: process.env["GITHUB_TOKEN"],
      githubApiBase: process.env["GITHUB_API_URL"],
      repository: gh.repository,
      eventName: gh.event_name,
      eventPath: process.env["GITHUB_EVENT_PATH"],
      fallbackSha: gh.sha,
      fallbackRef: gh.ref,
      overrideBaseSha: getInput("change-brief-base-sha") || undefined,
      overrideHeadSha: getInput("change-brief-head-sha") || undefined,
      workflow: {
        name: gh.workflow,
        run_id: gh.run_id,
        run_url: `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`,
      },
      rollback,
      log: info,
      warn: warning,
    });
  } catch (err) {
    clearOutputs();
    const message =
      err instanceof ChangeBriefError || err instanceof Error ? err.message : String(err);
    setFailed(`AtlaSent Change Brief: ${message}`);
    return;
  }

  const { brief, canonicalPlanDigest, collection } = result;
  const managementBrief = buildManagementDecisionBrief(result);

  setOutput("change-brief-id", brief.brief_id);
  setOutput("change-brief-recommendation", brief.recommendation.value);
  setOutput("change-brief-classification", brief.classification.value);
  setOutput("change-brief-material-differences-count", String(brief.material_differences.length));
  setOutput("change-brief-canonical-plan-digest", canonicalPlanDigest);
  setOutput("change-brief-decision-readiness", managementBrief.readiness);
  setOutput("change-brief-source-collection", collection.status);
  setOutput(
    "change-brief-blocking-evidence-count",
    String(managementBrief.management_summary.automated_analysis.blocking_evidence_gaps),
  );
  setOutput("change-brief-decision-brief", JSON.stringify(managementBrief));

  // NOTE: this deep link does NOT carry `github_change_plan` — the console's
  // /change-brief route builds its request from URL query params only, and a
  // structured fact blob (changed-file lists, check-run arrays) doesn't fit
  // in a URL. A human following this link today gets the base identity
  // (subject/reviewer/consequence, all sourced independently of GitHub) but
  // NOT the GitHub-sourced impact/material_differences this step just
  // computed — those are in the Job Summary below, which is the authoritative
  // record of this run's facts until that gap is closed.
  const consoleUrl =
    `${consoleBaseUrl}/change-brief?` +
    new URLSearchParams({
      action_type: actionType,
      target_system: targetSystem,
      target_id: targetId,
      environment,
      canonical_plan_digest: canonicalPlanDigest,
      actor_id: `github:${actor}`,
    }).toString();
  setOutput("change-brief-console-url", consoleUrl);

  info(`  Brief ID:             ${brief.brief_id}`);
  info(`  Recommendation:       ${brief.recommendation.value}`);
  info(`  Classification:       ${brief.classification.value}`);
  info(`  Decision readiness:   ${managementBrief.readiness}`);
  info(`  Source collection:    ${collection.status}`);
  info(`  Material differences: ${brief.material_differences.length}`);

  // Lead with a plain-language, human-approvable summary and a prominent
  // link into the console's decision UI — a business reviewer should not
  // have to parse a raw evidence table to find "what is this and where do
  // I approve it". The full evidence detail (source facts, hashes) stays
  // available immediately below, collapsed by default, for anyone who
  // wants to verify the automated analysis rather than just act on it.
  const summary =
    "\n## 📋 AtlaSent Change Brief\n\n" +
    `**Decision requested:** ${managementBrief.decision_requested}\n\n` +
    `**Recommendation:** \`${brief.recommendation.value}\` — ${brief.recommendation.rationale}\n\n` +
    `### 👉 [Review and decide in the AtlaSent console](${consoleUrl})\n\n` +
    "<details>\n" +
    "<summary>Full evidence detail (source facts, hashes, evidence binding — click to expand)</summary>\n\n" +
    renderChangeBriefStepSummary(result) +
    "\n</details>\n\n" +
    "> Note: the console page above does not yet carry this run's GitHub-sourced facts " +
    "(see this action's README); the expanded detail is the full picture for those.\n";
  appendToStepSummary(summary);

  const commentEnabled = getInput("pr-comment-on-change-brief").toLowerCase() === "true";
  if (commentEnabled && gh.pr_number) {
    await postPRComment({ repository: gh.repository, prNumber: gh.pr_number, body: summary });
  }
}

// ---------------------------------------------------------------------------
// Release-candidate post-deploy mode
// ---------------------------------------------------------------------------

async function runReleaseModeStep(): Promise<void> {
  const cpUrl = getInput("control-plane-url", true);
  const cpToken =
    getInput("control-plane-token") || (process.env["ATLASENT_CP_TOKEN"] ?? "").trim();
  if (!cpToken) {
    setFailed(
      "release-mode: control-plane-token input or ATLASENT_CP_TOKEN env var is required",
    );
    return;
  }
  maskValue(cpToken);

  const targetUrl = getInput("release-target-runtime-url", true);
  const gh = getGitHubContext();
  const repo = getInput("release-repo") || gh.repository;
  const commitSha = getInput("release-commit-sha") || gh.sha;
  if (!commitSha) {
    setFailed("release-mode: commit SHA is required (set release-commit-sha or GITHUB_SHA)");
    return;
  }
  const imageDigest = getInput("release-image-digest") || undefined;
  const semver = getInput("release-semver") || undefined;
  const environment = getInput("release-environment", true) as
    | "preview"
    | "staging"
    | "production";
  if (!["preview", "staging", "production"].includes(environment)) {
    setFailed(
      `release-mode: release-environment must be preview | staging | production (got "${environment}")`,
    );
    return;
  }
  const failOnVerify = getInput("release-fail-on-verify").toLowerCase() !== "false";

  info(
    `AtlaSent release: registering candidate for ${repo}@${commitSha.slice(0, 8)} in ${environment} against ${targetUrl}`,
  );

  let result;
  try {
    result = await registerAndVerify({
      controlPlaneUrl: cpUrl,
      controlPlaneToken: cpToken,
      targetRuntimeUrl: targetUrl,
      repo,
      commitSha,
      imageDigest,
      semver,
      environment,
    });
  } catch (err) {
    setOutput("release-candidate-id", "");
    setOutput("release-runtime-status", "error");
    setOutput("release-deploy-status", "error");
    setOutput("release-runtime-result", "{}");
    setOutput("release-deploy-result", "{}");
    setFailed(
      `AtlaSent release: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  setOutput("release-candidate-id", result.candidateId);
  setOutput("release-runtime-status", result.runtime.status);
  setOutput("release-deploy-status", result.deploy.status);
  setOutput("release-runtime-result", JSON.stringify(result.runtime));
  setOutput("release-deploy-result", JSON.stringify(result.deploy));

  const runtimeSummary = summarizeOutcome(result.runtime);
  const deploySummary = summarizeOutcome(result.deploy);

  info(`  Candidate: ${result.candidateId}`);
  info(`  Runtime verify: ${result.runtime.status}`);
  for (const c of result.runtime.checks) {
    info(`    • ${c.name}: ${c.status}${c.detail ? ` — ${c.detail}` : ""}`);
  }
  info(`  Deploy verify: ${result.deploy.status}`);
  for (const c of result.deploy.checks) {
    info(`    • ${c.name}: ${c.status}${c.detail ? ` — ${c.detail}` : ""}`);
  }

  appendToStepSummary(
    [
      "",
      "## 🚀 AtlaSent Release Candidate",
      "",
      `| Field | Value |`,
      `|---|---|`,
      `| Candidate ID | \`${result.candidateId}\` |`,
      `| Repo | \`${repo}\` |`,
      `| Commit | \`${commitSha.slice(0, 8)}\` |`,
      `| Environment | \`${environment}\` |`,
      `| Runtime verify | ${runtimeSummary.level === "passed" ? "✅" : runtimeSummary.level === "warned" ? "⚠️" : "❌"} \`${result.runtime.status}\` |`,
      `| Deploy verify | ${deploySummary.level === "passed" ? "✅" : deploySummary.level === "warned" ? "⚠️" : "❌"} \`${result.deploy.status}\` |`,
      "",
    ].join("\n"),
  );

  if (failOnVerify && (!runtimeSummary.ok || !deploySummary.ok)) {
    const failed: string[] = [];
    if (!runtimeSummary.ok) failed.push(`runtime=${result.runtime.status}`);
    if (!deploySummary.ok) failed.push(`deploy=${result.deploy.status}`);
    setFailed(
      `AtlaSent release: verification failed (${failed.join(", ")}). Promotion should not proceed.`,
    );
    return;
  }
}

// ---------------------------------------------------------------------------
// Solo-operator compensating-control attestation step
// ---------------------------------------------------------------------------
//
// Records evidence for the runtime's solo-operator compensating control
// (atlasent-api _shared/solo-operator-compensating-control.ts) BEFORE a
// later `action:` evaluate step tries to use it. This step authorizes
// nothing by itself — see soloOperatorAttest.ts's header for the full
// trust model. Run it as its own step, then pass
// `context: '{"solo_operator_compensating_control": {}}'` (and, for a
// non-production.deploy action, the SAME `evidence-profile` JSON again) to
// the actual `action:` evaluate step that follows.

async function runSoloOperatorAttestStep(apiKey: string, apiUrl: string): Promise<void> {
  const rawAction = getInput("action", true);
  try {
    assertValidActionType(rawAction);
  } catch (err) {
    setOutput("solo-attestation-id", "");
    setFailed(
      `AtlaSent solo-operator-attest: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }
  const actionType = normalizeProtectedAction(rawAction).canonical;

  const actionClassId = getInput("solo-operator-action-class-id", true);
  const attestationReason = getInput("solo-operator-attestation-reason", true);
  const gh = getGitHubContext();
  const commitSha = getInput("commit-sha") || gh.sha;
  if (!commitSha) {
    setOutput("solo-attestation-id", "");
    setFailed(
      "AtlaSent solo-operator-attest: commit SHA is required (set commit-sha or GITHUB_SHA)",
    );
    return;
  }
  const targetId = getInput("target-id") || undefined;
  const environment = getInput("environment") || undefined;
  const artifactDigest = getInput("artifact-digest") || undefined;

  let evidenceProfile: Record<string, unknown> | undefined;
  const evidenceProfileRaw = getInput("evidence-profile");
  if (evidenceProfileRaw) {
    try {
      evidenceProfile = JSON.parse(evidenceProfileRaw) as Record<string, unknown>;
    } catch {
      setOutput("solo-attestation-id", "");
      setFailed("AtlaSent solo-operator-attest: `evidence-profile` is not valid JSON");
      return;
    }
  }

  info(
    `AtlaSent solo-operator attest: recording evidence for ${actionType}@${commitSha.slice(0, 8)}`,
  );

  let result;
  try {
    result = await attestSoloOperator(
      {
        apiUrl,
        apiKey,
        actionType,
        actionClassId,
        commitSha,
        attestationReason,
        targetId,
        environment,
        artifactDigest,
        evidenceProfile,
      },
      { mask: maskValue },
    );
  } catch (err) {
    setOutput("solo-attestation-id", "");
    const msg =
      err instanceof SoloOperatorAttestError || err instanceof WorkloadIdentityError
        ? err.message
        : `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
    setFailed(`AtlaSent solo-operator-attest: ${msg}. No attestation recorded (fail-closed).`);
    return;
  }

  setOutput("solo-attestation-id", result.attestationId);
  setOutput("solo-attested-by", result.attestedBy);
  info(`  Attestation recorded: ${result.attestationId} (attested by ${result.attestedBy})`);
}

// ---------------------------------------------------------------------------
// VQP re-derivation audit step
// ---------------------------------------------------------------------------

async function runVqpVerifyStep(): Promise<void> {
  const snapshotId = getInput("vqp-snapshot-id", true);
  const supabaseUrl =
    getInput("vqp-supabase-url") ||
    (process.env["ATLASENT_SUPABASE_URL"] ?? "").trim();
  if (!supabaseUrl) {
    setFailed(
      "vqp-verify: vqp-supabase-url input or ATLASENT_SUPABASE_URL env var is required",
    );
    return;
  }
  const serviceRoleKey =
    getInput("vqp-service-role-key") ||
    (process.env["ATLASENT_SUPABASE_SERVICE_ROLE_KEY"] ?? "").trim();
  if (!serviceRoleKey) {
    setFailed(
      "vqp-verify: vqp-service-role-key input or ATLASENT_SUPABASE_SERVICE_ROLE_KEY env var is required",
    );
    return;
  }
  maskValue(serviceRoleKey);

  const rerun = getInput("vqp-rerun").toLowerCase() === "true";
  const failOnDrift = getInput("vqp-fail-on-drift").toLowerCase() !== "false";

  info(
    `AtlaSent VQP verify: re-deriving snapshot ${snapshotId}` +
      (rerun ? " (with AI rerun)" : " (hash check only)"),
  );

  const setEmptyVqpOutputs = (): void => {
    setOutput("vqp-hash-match", "false");
    setOutput("vqp-score-delta", "");
    setOutput("vqp-verdict-changed", "false");
    setOutput("vqp-audit-id", "");
  };

  let result;
  try {
    result = await runVqpVerify({ supabaseUrl, serviceRoleKey, snapshotId, rerun });
  } catch (err) {
    setEmptyVqpOutputs();
    setFailed(
      `AtlaSent VQP verify: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  setOutput("vqp-hash-match", result.hashMatch ? "true" : "false");
  setOutput(
    "vqp-score-delta",
    result.scoreDelta !== null ? String(result.scoreDelta) : "",
  );
  setOutput("vqp-verdict-changed", result.verdictChanged ? "true" : "false");
  setOutput("vqp-audit-id", result.auditId);

  info(`  Hash match:      ${result.hashMatch}`);
  if (result.scoreDelta !== null) {
    info(`  Score delta:     ${result.scoreDelta}`);
    info(`  Verdict changed: ${result.verdictChanged}`);
  }
  info(`  Audit ID:        ${result.auditId}`);

  appendToStepSummary(
    [
      "",
      "## 🧬 AtlaSent VQP Re-Derivation Audit",
      "",
      `| Field | Value |`,
      `|---|---|`,
      `| Snapshot ID | \`${snapshotId}\` |`,
      `| Hash Match | ${result.hashMatch ? "✅ \`true\`" : "❌ \`false\`"} |`,
      result.scoreDelta !== null
        ? `| Score Delta | \`${result.scoreDelta}\` |`
        : "| Score Delta | N/A (rerun not requested) |",
      result.scoreDelta !== null
        ? `| Verdict Changed | ${result.verdictChanged ? "⚠️ \`true\`" : "✅ \`false\`"} |`
        : "| Verdict Changed | N/A |",
      `| Audit ID | \`${result.auditId || "—"}\` |`,
      "",
    ].join("\n"),
  );

  if (!failOnDrift) {
    if (!result.hashMatch) {
      warning(
        `VQP hash mismatch for snapshot ${snapshotId} (advisory; vqp-fail-on-drift=false)`,
      );
    }
    return;
  }

  if (!result.hashMatch) {
    setFailed(
      `AtlaSent VQP verify: hash mismatch for snapshot ${snapshotId} — ` +
        `prompt was mutated after snapshot creation (integrity violation). ` +
        `Investigate vqp_snapshots and vqp_audit_log for root cause.`,
    );
    return;
  }

  if (result.verdictChanged) {
    setFailed(
      `AtlaSent VQP verify: verdict changed for snapshot ${snapshotId} — ` +
        `score drift detected (rerun verdict differs from original). ` +
        `Review score_delta in vqp_audit_log.`,
    );
    return;
  }

  info(
    `AtlaSent VQP verify: integrity confirmed for snapshot ${snapshotId}` +
      (rerun ? " — no score drift" : ""),
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// The five trajectory-verify inputs. No version of this action has ever
// implemented the mode they describe — the runtime has no
// /v1/trajectory-verify endpoint, and no code path here ever called it. A
// workflow that still sets one of these would otherwise fall through
// silently into whichever other mode `action`/apiKey happen to satisfy,
// running an unrelated evaluation while the caller believes its trajectory
// permit/step was verified (or, with no `action` set, hitting a misleading
// "ATLASENT_API_KEY is required" error that has nothing to do with the
// actual problem). See docs/trajectory-verify.md and AtlaSent API #2932.
const LEGACY_TRAJECTORY_INPUTS = [
  "trajectory-verify",
  "trajectory-permit-id",
  "trajectory-step-id",
  "trajectory-step-name",
  "trajectory-halt-on-deviation",
] as const;

export async function run(): Promise<void> {
  // ── Legacy trajectory-verify input guard (fail closed) ──────────────────────
  // Checked FIRST, before any other mode dispatch or API-key handling, so a
  // workflow that still sets a trajectory input never silently runs a
  // different mode instead.
  const trajectoryInputsSet = LEGACY_TRAJECTORY_INPUTS.filter((name) => getInput(name) !== "");
  if (trajectoryInputsSet.length > 0) {
    setOutput("decision", "error");
    setOutput("verified", "false");
    setFailed(
      `AtlaSent Gate: trajectory-verify mode is not supported — the runtime does not implement ` +
        `/v1/trajectory-verify and no version of this action has ever called it. Remove ` +
        `${trajectoryInputsSet.join(", ")} from this step's inputs. Use the evaluate-only + ` +
        `verify-permit execution-boundary pattern instead — see docs/trajectory-verify.md.`,
    );
    return;
  }

  // ── Release-mode path (post-deploy verification) ───────────────────────────
  // Runs against the control-plane, not the runtime — does NOT require
  // ATLASENT_API_KEY. Routed first so it can short-circuit before the other
  // paths' input requirements.
  if (getInput("release-mode") === "register-and-verify") {
    await runReleaseModeStep();
    return;
  }

  // ── VQP re-derivation audit path ────────────────────────────────────────────
  // Runs directly against the Supabase edge functions via service role key.
  // Does NOT require ATLASENT_API_KEY.
  if (getInput("vqp-snapshot-id")) {
    await runVqpVerifyStep();
    return;
  }

  // ── Posture scan path ────────────────────────────────────────────────────
  // Advisory GitHub security-posture report for the CALLING repo. Reads
  // only the GITHUB_TOKEN/checked-out tree already available to the run —
  // does NOT call the AtlaSent API at all, so it does NOT require
  // ATLASENT_API_KEY. Routed here (before getApiKey()) so it works even
  // when no AtlaSent key is configured yet.
  if (getInput("posture-scan").toLowerCase() === "true") {
    await runPostureScanStep();
    return;
  }

  // 1. Read shared inputs
  const apiKey = getApiKey();
  maskValue(apiKey);

  const apiUrl =
    getInput("api-url") ||
    (process.env["ATLASENT_BASE_URL"] ?? "").trim() ||
    "https://api.atlasent.io/functions/v1";
  if (!apiUrl.includes("/functions/v1")) {
    warning(
      "ATLASENT_BASE_URL does not contain '/functions/v1'. " +
        "For Supabase-hosted AtlaSent instances set ATLASENT_BASE_URL to your project URL " +
        "ending in /functions/v1 (e.g. https://<project-ref>.supabase.co/functions/v1). " +
        "Without this suffix every API call will 404.",
    );
  }
  const failOnDeny = getInput("fail-on-deny") !== "false";
  if (!failOnDeny) {
    warning(
      "Input fail-on-deny=false is deprecated for Deploy Gate V1 pilot readiness; deny/hold/escalate now fail closed.",
    );
  }

  maskValue(apiKey);

  // ── Policy sync path ────────────────────────────────────────────────────────
  if (getInput("policy-sync").toLowerCase() === "true") {
    await runPolicySyncStep(apiKey, apiUrl);
    return;
  }

  // ── Governance agents path ──────────────────────────────────────────────────
  //
  // Advisory mode: invoke one or more constrained governance agents and post
  // findings as a non-required step result. Does NOT gate by default; the
  // `governance-fail-on-severity` input is opt-in.
  if (getInput("governance-agents")) {
    await runGovernanceAgentsStep(apiKey, apiUrl);
    return;
  }

  // ── Change Brief path ────────────────────────────────────────────────────
  //
  // A preparation artifact for human review — gathers GitHub/CI facts and
  // calls v1-change-brief. Mints no permit and authorizes nothing; a
  // separate evaluate/verify step (the default `action:` mode) remains the
  // actual authorization boundary for the deploy itself.
  if (getInput("change-brief").toLowerCase() === "true") {
    await runChangeBriefStep(apiKey, apiUrl);
    return;
  }

  // ── Solo-operator attest path ───────────────────────────────────────────────
  //
  // Records solo-operator compensating-control evidence for a LATER `action:`
  // evaluate step (this action's ordinary mode) to use — see
  // soloOperatorAttest.ts's header. Mints no permit and authorizes nothing by
  // itself.
  if (getInput("solo-operator-attest").toLowerCase() === "true") {
    await runSoloOperatorAttestStep(apiKey, apiUrl);
    return;
  }

  // ── Verify-permit path (execution boundary) ─────────────────────────────────
  //
  // Re-verify an already-issued permit immediately before the protected step,
  // independent of the gate that issued it. Fails closed on any missing /
  // modified / expired / replayed / denied / context-mismatched permit — so a
  // workflow cannot evaluate one artifact and execute another.
  if (getInput("verify-permit").toLowerCase() === "true") {
    await runVerifyPermitStep(apiKey, apiUrl);
    return;
  }

  // ── v2.1 batch path (scope-excluded from this unification) ─────────────────
  const evaluationsRaw = getInput("evaluations");
  if (evaluationsRaw) {
    const waitForId = getInput("wait-for-id") || undefined;
    const waitTimeoutMs = parseInt(getInput("wait-timeout-ms") || "600000", 10);
    const v2Streaming = getInput("v2-streaming") === "true";

    let result;
    try {
      result = await runV21(
        {
          ATLASENT_API_KEY: apiKey,
          "INPUT_API-URL": apiUrl,
          "INPUT_FAIL-ON-DENY": failOnDeny ? "true" : "false",
          INPUT_EVALUATIONS: evaluationsRaw,
          "INPUT_WAIT-FOR-ID": waitForId,
          "INPUT_WAIT-TIMEOUT-MS": String(waitTimeoutMs),
        },
        { v2Streaming },
        { mask: maskValue },
      );
    } catch (err) {
      const msg =
        err instanceof EnforceError ||
        err instanceof GateInfraError ||
        err instanceof WorkloadIdentityError
          ? err.message
          : `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
      setOutput("verified", "false");
      setOutput("decisions", "[]");
      setOutput("batch-id", "");
      setFailed(`AtlaSent Gate (batch): ${msg}. Deploy blocked (fail-closed).`);
      return;
    }

    const decisionsJson = JSON.stringify(
      result.decisions.map((d) => ({
        decision: d.decision,
        verified: d.verified ?? false,
        evaluationId: d.id ?? "",
        permitToken: d.permitToken ? "(masked)" : "",
        reasons: d.reasons ?? [],
        verifyOutcome: d.verifyOutcome ?? "",
      })),
    );

    const allVerified = result.decisions.every(
      (d) => d.decision !== "allow" || d.verified === true,
    );

    setOutput("batch-id", result.batchId);
    setOutput("decisions", decisionsJson);
    setOutput("verified", allVerified ? "true" : "false");

    if (result.failed) {
      // Fire Slack + PR-comment notifications for the batch deny path, mirroring
      // the single-eval path. Aggregate across all blocked decisions.
      {
        const gh = getGitHubContext();
        const runUrl = `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`;
        const slackWebhook = getInput("slack-webhook");
        const teamsWebhook = getInput("teams-webhook");
        const prCommentEnabled = getInput("pr-comment-on-deny").toLowerCase() !== "false";

        // Includes both decision-level blocks (deny/hold/escalate) and an
        // "allow" whose permit failed verification (verified !== true) —
        // the latter is authorized nothing, per "gate on verified, not
        // decision", and must get the same operator-facing notification a
        // deny/hold/escalate does rather than passing silently.
        const blockedDecisions = result.decisions.filter(
          (d) =>
            d.decision === "deny" ||
            d.decision === "hold" ||
            d.decision === "escalate" ||
            (d.decision === "allow" && d.verified !== true),
        );
        const worstDecision: string = blockedDecisions.some((d) => d.decision === "deny")
          ? "deny"
          : blockedDecisions.some((d) => d.decision === "escalate")
            ? "escalate"
            : blockedDecisions.some((d) => d.decision === "hold")
              ? "hold"
              : "verification_failed";
        const batchActor = getInput("actor") || "unknown";
        const batchEnv = resolveEnvironment(getInput("environment"), gh.ref, apiKey);
        const reasonSummary = `${blockedDecisions.length} of ${result.decisions.length} evaluation(s) blocked (${worstDecision})`;

        if (slackWebhook) {
          await notifySlack(slackWebhook, {
            decision: worstDecision,
            action: "batch evaluation",
            actor: batchActor,
            environment: batchEnv,
            reason: reasonSummary,
            runUrl,
          });
        }
        if (teamsWebhook) {
          await notifyTeams(teamsWebhook, {
            decision: worstDecision,
            action: "batch evaluation",
            actor: batchActor,
            environment: batchEnv,
            reason: reasonSummary,
            runUrl,
          });
        }
        if (prCommentEnabled && gh.pr_number) {
          await postPRComment({
            repository: gh.repository,
            prNumber: gh.pr_number,
            body: buildGateDenyComment({
              decision: worstDecision,
              reason: reasonSummary,
              action: "batch evaluation",
              actor: batchActor,
              environment: batchEnv,
              runUrl,
            }),
          });
        }
      }

      setFailed(
        `AtlaSent Gate: one or more evaluations were not allowed (deny/hold/escalate) or ` +
          `had an allow decision that failed permit verification. See 'decisions' output for details.`,
      );
      return;
    }
    // Belt-and-braces: `result.failed` (above) now already covers this exact
    // condition (an allow decision with verified !== true), so this branch
    // should be unreachable in practice — kept as a defense-in-depth
    // fail-closed backstop in case `result.failed`'s computation ever drifts
    // from `allVerified` again.
    if (!allVerified) {
      setFailed(
        `AtlaSent Gate: one or more allow decisions failed permit verification. Deploy blocked.`,
      );
      return;
    }

    info(`AtlaSent Gate: all ${result.decisions.length} evaluation(s) allowed and verified`);
    info(`  Batch ID: ${result.batchId}`);
    return;
  }

  // ── Single-eval path via @atlasent/enforce ─────────────────────────────────
  // Normalize the raw input to the canonical (`production.deploy`) before
  // any downstream use. Legacy callers passing `deployment.production`
  // continue to work; the evaluate body, GH outputs, and audit context
  // all carry the canonical string from here on.
  const rawActionType = getInput("action", true);
  const actionType = normalizeAndValidateProtectedAction(rawActionType);
  const actor = getInput("actor") || "unknown";
  const targetId = getInput("target-id") || undefined;
  const explicitEnv = getInput("environment");
  let extraContext: Record<string, unknown> = {};
  try {
    extraContext = JSON.parse(getInput("context") || "{}");
  } catch {
    warning("Could not parse 'context' input as JSON — ignoring");
  }

  const gh = getGitHubContext();
  const environment = resolveEnvironment(explicitEnv, gh.ref, apiKey);
  const orgId = gh.repository.split("/")[0] ?? "unknown";

  let actorResolution: ProtectedActorResolution;
  try {
    actorResolution = await resolveProtectedActor({
      apiKey,
      apiUrl,
      actionType,
      environment,
      triggeringActor: actor,
    });
  } catch (error) {
    setOutput("decision", "deny");
    setOutput("verified", "false");
    setOutput("permit-issued", "false");
    setOutput("verify-outcome", "actor_unverified");
    setOutput("verify-error-code", "ACTOR_UNVERIFIED");
    setFailed(
      `AtlaSent Gate: ${
        error instanceof WorkloadIdentityError || error instanceof Error
          ? error.message
          : String(error)
      } Deploy blocked (fail-closed).`,
    );
    return;
  }
  const actorId = actorResolution.actorId;
  const triggeringActorId = actorResolution.triggeringActorId;
  // Carried forward by a later verify-permit step (via its own resolved-actor
  // input) so a split evaluate/verify pair never independently re-resolves a
  // possibly-different actor for an OPTIONAL_VERIFIED_ACTOR_ACTIONS type —
  // see resolveProtectedActor's doc comment and atlasent-action#166.
  setOutput("resolved-actor", actorId);

  info(
    `AtlaSent Gate: evaluating "${actionType}" for actor "${actorId}" in ${environment} environment` +
      (targetId ? ` (target=${targetId})` : ""),
  );

  // Derive verified approval evidence from PR reviews so the
  // `allow-2-approvals-change-window` policy template can read a trustworthy
  // `context.approvals` count without a second integration. Best-effort and
  // fail-open-to-zero: any failure leaves approvals at 0, which denies a
  // count-gated deploy (the fail-closed direction). `approvals-from: none`
  // skips the lookup entirely. The operator's `context` input always wins,
  // so an explicit `approvals` there overrides what we derive.
  const approvalsFrom = (getInput("approvals-from") || "pr-reviews").toLowerCase();
  let approvalEvidence: ApprovalEvidence | null = null;
  if (approvalsFrom === "pr-reviews") {
    approvalEvidence = await resolveApprovals({
      repository: gh.repository,
      sha: gh.sha,
      prNumber: gh.pr_number ?? null,
      token: process.env["GITHUB_TOKEN"],
      apiBase: process.env["GITHUB_API_URL"],
      log: info,
      warn: warning,
    });
  }

  // ADR-055 two-call acceptance lane: when the evaluate() call below denies
  // with INSUFFICIENT_APPROVALS and a signing_hint (the action class
  // requires a real, verified approval_artifact.v1/approval_quorum.v1 — a
  // bare context.approvals count was never sufficient proof), mint real
  // evidence FROM the PR reviews we just read, bound to the server's exact
  // action_hash, and retry once. Only offered when approvals-from actually
  // resolved a PR to read reviews from — a workflow with no PR (e.g. a
  // manual dispatch with no associated pull request) has nothing to mint
  // from here; see soloOperatorAttest.ts for that shape instead. A minting
  // failure (no qualifying reviewer, endpoint unreachable, missing scope)
  // is NOT escalated into a harder failure — it just means the original
  // deny stands, exactly the behavior before this feature existed.
  const approvalArtifactMintEnabled =
    (getInput("approval-artifact-mint") || "true").trim().toLowerCase() !== "false";
  const mintPrNumber: number | null =
    approvalEvidence?.pr_number ??
    (gh.pr_number && /^\d+$/.test(gh.pr_number) ? parseInt(gh.pr_number, 10) : null);
  const onInsufficientApprovals =
    approvalsFrom === "pr-reviews" && approvalArtifactMintEnabled && mintPrNumber
      ? async (
          hint: ApprovalSigningHint,
          evaluationId: string | undefined,
        ): Promise<Record<string, unknown> | undefined> => {
          // v1-github-approval-mint requires evaluation_id to independently
          // bind the mint to the exact evaluate() call it is evidence for
          // (Codex review on atlasent-api#2832, P1). Without it there is
          // nothing safe to mint against — decline, same as any other
          // minting precondition failure, rather than calling an endpoint
          // that will refuse the request anyway.
          if (!evaluationId) {
            warning(
              "AtlaSent Gate: the evaluate() deny carried no evaluation_id — cannot mint a bound " +
                "GitHub approval artifact for it",
            );
            return undefined;
          }
          try {
            const minted = await mintGithubApprovalArtifacts({
              apiUrl,
              apiKey,
              repository: gh.repository,
              pullRequestNumber: mintPrNumber,
              actionType,
              hint,
              evaluationId,
              resourceId: targetId,
            });
            info(
              `AtlaSent Gate: minted ${minted.artifacts.length} approval_artifact.v1 ` +
                `from GitHub PR review(s) by ${minted.reviewers.join(", ")}`,
            );
            return buildApprovalQuorum(hint, minted.artifacts);
          } catch (error) {
            if (error instanceof GithubApprovalMintError) {
              warning(`AtlaSent Gate: could not mint a GitHub approval artifact: ${error.message}`);
              return undefined;
            }
            throw error;
          }
        }
      : undefined;

  const artifactDigest = getInput("artifact-digest") || undefined;
  // "operation" just needs to be a non-empty string identifying what kind of
  // mutation this is (_shared/mandatory-execution-binding.ts's
  // isCompleteChangePlan has no fixed vocabulary) -- derived from the action
  // type's own trailing segment so each of the four mandatory-change-control
  // action types gets an accurate label instead of a hardcoded "deploy".
  const changePlanOperation = actionType.split(".").pop() || actionType;
  const productionChangePlan = MANDATORY_CHANGE_CONTROL_ACTIONS.has(actionType)
    ? {
        operation: changePlanOperation,
        revision: actorResolution.workloadIdentity?.source.sha ?? "",
        ...(artifactDigest ? { artifact_ref: artifactDigest } : {}),
      }
    : undefined;

  if (productionChangePlan && !productionChangePlan.revision) {
    setOutput("decision", "deny");
    setOutput("verified", "false");
    setOutput("permit-issued", "false");
    setOutput("verify-outcome", "invalid");
    setOutput("verify-error-code", "MISSING_BINDING");
    setFailed(
      `AtlaSent Gate: the verified GitHub workload identity did not carry a commit SHA, ` +
        `so a complete "${actionType}" change_plan cannot be derived. Deploy blocked ` +
        "(fail-closed).",
    );
    return;
  }

  // Mandatory production-change controls reject caller-supplied raw hashes.
  // The runtime derives the execution hash from this verified revision plus
  // the optional artifact identity and echoes that opaque binding for verify.
  // For every other action type (e.g. package.release), artifact-digest IS
  // the raw payload hash the runtime binds — normalize a common OCI-form
  // digest (sha256:<hex>) to the bare hex the server requires, or the
  // binding is silently never set and boundary verify deterministically
  // fails PAYLOAD_MISMATCH. See executionPayloadHash.ts.
  const directExecutionPayloadHash =
    MANDATORY_CHANGE_CONTROL_ACTIONS.has(actionType)
      ? undefined
      : normalizeExecutionPayloadHash(artifactDigest);

  // Typed solo-operator compensating-control evidence for a NON-production.deploy
  // action type — the same JSON a prior `solo-operator-attest: true` step in
  // this workflow was given, so the hash this evaluate() call derives matches
  // what was attested. A no-op unless the action class both requires
  // independent approval and the ordinary approving_reviewers path is
  // unprovable — see atlasent-api _shared/solo-operator-evidence-profile.ts.
  let evidenceProfile: Record<string, unknown> | undefined;
  const evidenceProfileRaw = getInput("evidence-profile") || undefined;
  if (evidenceProfileRaw) {
    try {
      evidenceProfile = JSON.parse(evidenceProfileRaw) as Record<string, unknown>;
    } catch {
      setOutput("decision", "deny");
      setOutput("verified", "false");
      setFailed("AtlaSent Gate: `evidence-profile` is not valid JSON");
      return;
    }
  }

  // evaluate-only (issue-permit) mode: ISSUE a permit without verifying or
  // consuming it, so a workflow can express the two-step EXECUTION-BOUNDARY
  // pattern entirely with atlasent-action — this step issues the permit, and a
  // later `verify-permit: true` step re-verifies + consumes it at the deploy
  // step (the real cryptographic boundary). The default `enforce` model
  // evaluate→verify→consumes the single-use permit in this step, so a second
  // boundary verify on the same permit would fail `replay_blocked`.
  const evaluateOnly =
    (getInput("mode") || "enforce").trim().toLowerCase() === "evaluate-only";

  // Pause-and-resume approval protocol. Off by default — a hold/escalate
  // still fails the step immediately unless a caller opts in. Only applies
  // to the enforce (evaluate+verify) path: evaluate-only mode issues an
  // unconsumed permit for a LATER step to verify, so waiting synchronously
  // in THIS step would fight that split-across-jobs pattern rather than
  // serve it — see the evaluateOnly branch below, which rejects the
  // combination explicitly instead of silently ignoring the wait input.
  const waitForApprovalInput =
    (getInput("wait-for-approval") || "false").trim().toLowerCase() === "true";
  const maxWaitMinutesRaw = parseInt(getInput("max-wait-minutes") || "30", 10);
  const maxWaitMinutes =
    Number.isFinite(maxWaitMinutesRaw) && maxWaitMinutesRaw > 0 ? maxWaitMinutesRaw : 30;
  const maxWaitMs = maxWaitMinutes * 60_000;

  // Convenience trigger for the solo-operator compensating control — an
  // alternative to hand-writing `context: '{"solo_operator_compensating_control": {}}'`.
  // Only the PRESENCE of this key is ever read server-side (see atlasent-api
  // _shared/solo-operator-compensating-control.ts); it grants no authority by
  // itself, and is a no-op unless this evaluate call also reaches a genuinely
  // unprovable independent-approval branch AND a matching, fresh
  // solo-operator-attest step already recorded evidence for this exact
  // change_plan/evidence_profile.
  const soloOperatorContext =
    (getInput("solo-operator-context") || "false").trim().toLowerCase() === "true";

  const config: EnforceConfig = {
    apiKey,
    apiUrl,
    action: actionType,
    actor: actorId,
    actorIdentity: actorResolution.workloadIdentity?.assertion,
    environment,
    targetId,
    changePlan: productionChangePlan,
    evidenceProfile,
    onInsufficientApprovals,
    // Canonical artifact binding — the runtime binds this into the permit and
    // re-checks it at verify time (artifact-substitution defense).
    executionPayloadHash: directExecutionPayloadHash,
    // Re-present every binding provided here at verify, or fail closed
    // (MISSING_BINDING) rather than silently drop it.
    requiredBindings: requiredBindingsFor({
      environment,
      targetId,
      executionPayloadHash: directExecutionPayloadHash,
    }),
    // state_snapshot is required for all action classes (requires_state_snapshot=true).
    // Auto-populate from GitHub Actions context; callers can override via the context input.
    state_snapshot: {
      source: "github-actions",
      complete: true,
      run_id: gh.run_id,
    },
    context: {
      source: "github-action",
      // The operator's `context` input is spread FIRST so it can supply
      // arbitrary additional fields (target-specific business context, e.g.
      // `financial-action-value`), but every key below is applied AFTER it
      // and therefore always wins. Those keys are either read directly from
      // the GitHub Actions environment (repository/ref/sha/workflow/run_id/
      // ...) or, for `approvals`/`approving_reviewers`, derived from a live
      // GitHub API call to the PR's actual review state. A caller writing
      // `context: '{"approvals": 999}'` or `context: '{"ref": "..."}'` in
      // their workflow YAML must NOT be able to shadow these — self-asserting
      // a verified fact defeats the entire point of deriving it. Do not
      // reorder this spread; a prior version had `...extraContext` last,
      // which silently let operator-supplied context override the real
      // PR-review-derived approval count (and repository/ref/sha/workflow)
      // for every caller of this action.
      ...extraContext,
      repository: gh.repository,
      ref: gh.ref,
      sha: gh.sha,
      workflow: gh.workflow,
      run_id: gh.run_id,
      run_number: gh.run_number,
      event_name: gh.event_name,
      // Human provenance is deliberately separate from the authorizing
      // workload principal. For production.deploy this value comes from the
      // broker's signature-verified GitHub OIDC `actor` claim when present.
      triggering_actor: triggeringActorId,
      pr_number: approvalEvidence?.pr_number ?? gh.pr_number ?? null,
      run_url: `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`,
      // Verified approval evidence from PR reviews. Only present (and only
      // overrides) when approvals-from: pr-reviews actually consulted the
      // API; in approvals-from: none mode, an operator-supplied `approvals`
      // in `context` is intentionally honored (the operator has opted out
      // of automatic verification and is expected to source evidence some
      // other way, e.g. a separate approval-artifact integration).
      ...(approvalEvidence && approvalEvidence.source === "pr-reviews"
        ? {
            approvals: approvalEvidence.approvals,
            approving_reviewers: approvalEvidence.approving_reviewers,
          }
        : {}),
      ...(soloOperatorContext ? { solo_operator_compensating_control: {} } : {}),
    },
  };

  // Fail-closed reporting shared by every EnforceError outcome: sets all the
  // "not authorized" outputs, posts the fallback commit status, fires the
  // advisory Slack/PR notifications, writes the job summary, then setFailed()
  // with a message keyed off err.phase/err.decision. Extracted so the
  // pause-and-resume wait step below (which can itself end in an EnforceError
  // — denied, still-not-verified, or a wait timeout) reuses EXACTLY this
  // reporting instead of a second, divergent copy.
  async function reportEnforceFailure(err: EnforceError): Promise<void> {
    {
      if (err.decision) {
        setDecisionOutputs(err.decision);
      } else {
        setOutput("decision", "error");
        setOutput("permit-token", "");
        setOutput("evaluation-id", "");
        setOutput("proof-hash", "");
        setOutput("risk-score", "");
        setOutput("chain-entry", JSON.stringify(null));
        setOutput("snapshot", JSON.stringify(null));
        setOutput("audit-hash", "");
      }
      setOutput("verified", "false");
      setOutput("permit-issued", "false");
      setOutput("verify-outcome", err.outcome ?? "");
      setOutput("verify-error-code", err.verifyErrorCode ?? "");
      setOutput("evidence-receipt", JSON.stringify(null));
      setOutput("evidence-bundle", JSON.stringify(null));

      // Fallback commit status for orgs without the full GitHub App installation.
      {
        const decision = err.decision?.decision;
        let statusState: CommitStatusState = "error";
        let statusDesc = `AtlaSent: gate error — ${err.message.slice(0, 100)}`;
        if (decision === "deny") {
          statusState = "failure";
          statusDesc = `AtlaSent: denied — ${err.decision?.denyReason ?? actionType}`.slice(0, 140);
        } else if (decision === "hold") {
          statusState = "pending";
          statusDesc = `AtlaSent: on hold — awaiting approval (${actionType})`;
        } else if (decision === "escalate") {
          statusState = "pending";
          statusDesc = `AtlaSent: escalated — manual review required (${actionType})`;
        }
        await postCommitStatus({
          repository: gh.repository,
          sha: gh.sha,
          state: statusState,
          description: statusDesc,
          targetUrl: `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`,
        });
      }

      emitFinancialGovernanceAdvisory(actionType, actorId, orgId);

      // ── Outbound Slack/Teams notification + PR comment (best-effort, advisory) ──
      {
        const slackWebhook = getInput("slack-webhook");
        const teamsWebhook = getInput("teams-webhook");
        const runUrl = `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`;
        const decisionStr = err.decision?.decision ?? "error";
        const isActionable =
          decisionStr === "deny" || decisionStr === "hold" || decisionStr === "escalate";

        const reason =
          decisionStr === "deny"
            ? (err.decision?.denyReason ?? "no reason provided")
            : decisionStr === "hold"
              ? (err.decision?.holdReason ?? "awaiting approval")
              : decisionStr === "escalate"
                ? "escalated — manual review required"
                : err.message.slice(0, 200);

        if (slackWebhook && isActionable) {
          await notifySlack(slackWebhook, {
            decision: decisionStr,
            action: actionType,
            actor: actorId,
            environment,
            reason,
            runUrl,
            evaluationId: err.decision?.evaluationId,
            auditHash: err.decision?.auditHash,
          });
        }

        if (teamsWebhook && isActionable) {
          await notifyTeams(teamsWebhook, {
            decision: decisionStr,
            action: actionType,
            actor: actorId,
            environment,
            reason,
            runUrl,
            evaluationId: err.decision?.evaluationId,
            auditHash: err.decision?.auditHash,
          });
        }

        const prCommentEnabled =
          getInput("pr-comment-on-deny").toLowerCase() !== "false";
        if (prCommentEnabled && gh.pr_number && isActionable) {
          await postPRComment({
            repository: gh.repository,
            prNumber: gh.pr_number,
            body: buildGateDenyComment({
              decision: decisionStr,
              reason,
              action: actionType,
              actor: actorId,
              environment,
              runUrl,
              evaluationId: err.decision?.evaluationId,
              auditHash: err.decision?.auditHash,
            }),
          });
        }
      }

      // ── Job summary — written BEFORE setFailed (which exits the process) ──
      // so the customer always gets the rich "why was I blocked" panel on the
      // run page, never a bare one-line ::error::. Best-effort.
      {
        const blockedDecision = err.decision?.decision;
        const summaryOutcome: GateOutcome =
          blockedDecision === "deny" ||
          blockedDecision === "hold" ||
          blockedDecision === "escalate"
            ? blockedDecision
            : "error";
        const summaryReason =
          summaryOutcome === "deny"
            ? (err.decision?.denyReason ?? err.message)
            : summaryOutcome === "hold"
              ? (err.decision?.holdReason ?? "awaiting approval")
              : summaryOutcome === "escalate"
                ? "manual review required"
                : err.message;
        appendToStepSummary(
          buildGateStepSummary({
            outcome: summaryOutcome,
            action: actionType,
            actor: actorId,
            environment,
            targetId,
            runUrl: `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`,
            reason: summaryReason,
            denyCode: err.decision?.denyCode,
            remediation: err.decision?.remediation,
            evaluationId: err.decision?.evaluationId,
            auditHash: err.decision?.auditHash,
            riskScore: err.decision?.riskScore,
            riskClass: err.decision?.risk_class,
          }),
        );
      }

      switch (err.phase) {
        case "evaluate":
          setFailed(
            `AtlaSent Gate: ${err.message}. Deploy blocked — the gate cannot confirm authorization (fail-closed).`,
          );
          break;
        case "verify":
          switch (err.decision?.decision) {
            case "deny":
              setFailed(
                `Authorization DENIED: ${err.decision.denyReason ?? "no reason provided"}`,
              );
              break;
            case "hold":
              setFailed(
                `Authorization on HOLD: ${err.decision.holdReason ?? "awaiting approval"}`,
              );
              break;
            case "escalate":
              setFailed("Authorization ESCALATED — manual review required");
              break;
            default:
              setFailed(`Unexpected decision from AtlaSent: ${err.decision?.decision ?? "unknown"}`);
          }
          break;
        case "verify-permit":
          setFailed(
            `AtlaSent Gate: ${err.message}. Deploy blocked (fail-closed).`,
          );
          break;
        default:
          setFailed(`AtlaSent Gate: ${err.message}`);
      }
    }
  }

  // Claim body for a mandatory change-control approval (IMPL-026B claim-time
  // reevaluation). Built at claim time, not evaluate time: the evaluate-time
  // actor_identity.v1 is short-lived and a human decision can take up to
  // max-wait-minutes. Throwing here fails the wait closed (no claim sent).
  const buildMandatoryClaimBody = async (row: {
    status: string;
    claimEnvironment?: string;
  }): Promise<Record<string, unknown>> => {
    if (!productionChangePlan) {
      throw new Error(`no change plan was derived for "${actionType}"`);
    }
    if (row.claimEnvironment != null && row.claimEnvironment !== environment) {
      throw new Error(
        `the approval must be claimed for environment "${row.claimEnvironment}", but this gate ` +
          `evaluated "${environment}"`,
      );
    }
    const claimer = await resolveProtectedActor({
      apiKey,
      apiUrl,
      actionType,
      environment,
      triggeringActor: actor,
    });
    if (!claimer.workloadIdentity) {
      throw new Error("no verified workload identity could be minted for the claim");
    }
    if (claimer.actorId !== actorId) {
      throw new Error(
        `the re-minted actor "${claimer.actorId}" is not the actor that was evaluated ("${actorId}")`,
      );
    }
    return {
      actor_identity: claimer.workloadIdentity.assertion,
      change_plan: productionChangePlan,
    };
  };

  // Default false; flipped to true only if the pause-and-resume branch below
  // is actually entered, regardless of how that wait ultimately resolves —
  // this output reports whether the action waited, not whether it allowed.
  setOutput("waited-for-approval", "false");

  let enforceResult: Awaited<ReturnType<typeof enforce>>;
  try {
    if (evaluateOnly) {
      // Issue the permit only — do NOT verify/consume it here. evaluate()
      // throws EnforceError (phase "evaluate") on any non-allow, so the
      // fail-closed handler below is shared with the enforce path.
      const decision = await evaluate(config);
      verify(decision);
      enforceResult = { result: undefined, decision, verifyOutcome: undefined };
    } else {
      enforceResult = await enforce(config, async () => {});
    }
  } catch (err) {
    if (err instanceof EnforceError) {
      // Applies to BOTH enforce and evaluate-only mode. In evaluate-only mode
      // the claimed permit is output UNCONSUMED (permit-token +
      // execution-hash) for a later `verify-permit: true` step to consume at
      // the execution boundary — the same split the direct-allow path uses.
      const canWaitForApproval =
        waitForApprovalInput &&
        err.phase === "verify" &&
        (err.decision?.decision === "hold" || err.decision?.decision === "escalate") &&
        !!err.decision?.approvalRequestId;

      if (!canWaitForApproval) {
        await reportEnforceFailure(err);
        return;
      }

      setOutput("waited-for-approval", "true");

      // Non-null by canWaitForApproval above (decision hold/escalate + a
      // real approvalRequestId were both just confirmed present) — named so
      // the rest of this branch doesn't need repeated `!`/`?.` on a value
      // already known non-null.
      const originalDecision = err.decision as Decision;

      // ── Pause-and-resume approval protocol ──────────────────────────────
      // The decision came back hold/escalate AND carries the
      // approval_request_id v1-evaluate links it to. Poll the runtime for a
      // human resolution, bounded by max-wait-minutes. Every branch below
      // either sets enforceResult to a FRESH, VERIFIED allow (and falls
      // through to the normal success path after this try/catch) or reports
      // through reportEnforceFailure and returns — there is no third
      // outcome, and nothing here ever treats "approved" alone as
      // sufficient to deploy without a verified permit.
      info(
        `AtlaSent Gate: authorization ${originalDecision.decision.toUpperCase()} — waiting up to ` +
          `${maxWaitMinutes}m for a human decision (approval_request_id=${originalDecision.approvalRequestId}).`,
      );

      let resolution: Awaited<ReturnType<typeof waitForApprovalResolution>>;
      try {
        resolution = await waitForApprovalResolution({
          apiKey,
          apiUrl,
          approvalId: originalDecision.approvalRequestId as string,
          maxWaitMs,
          // Mandatory change-control actions claim with the EXECUTOR's own,
          // freshly minted verified identity and the SAME change plan sent
          // at evaluate, so the runtime's claim-time reevaluation binds the
          // permit to this executor and this plan (a changed plan answers
          // 409 change_plan_mismatch). Approval alone never authorizes
          // execution: nothing is minted until this claim runs. Every other
          // action keeps the legacy `{}` claim, unchanged.
          ...(MANDATORY_CHANGE_CONTROL_ACTIONS.has(actionType)
            ? { buildClaimBody: buildMandatoryClaimBody }
            : {}),
        });
      } catch (waitErr) {
        // Timeout, poll auth failure, or any other error from the wait
        // itself. phase "evaluate" (rather than "verify") so
        // reportEnforceFailure's switch surfaces THIS message via err.message
        // instead of the generic hold/escalate one — the original decision
        // is preserved so evaluation-id/risk-score/etc. stay in the outputs.
        await reportEnforceFailure(
          waitErr instanceof EnforceError
            ? new EnforceError(waitErr.message, "evaluate", originalDecision)
            : new EnforceError(
                `Approval wait failed: ${waitErr instanceof Error ? waitErr.message : String(waitErr)}`,
                "evaluate",
                originalDecision,
              ),
        );
        return;
      }

      if (
        (resolution.status !== "approved" && resolution.status !== "approved_awaiting_claim") ||
        !resolution.permitToken
      ) {
        // Denied, expired, denied_by_timeout, revoked, a refused claim
        // (409 change_plan_mismatch, claim_in_progress, not the originating
        // key, ...), an approval accepted with no
        // fresh permit minted (a legitimate "accepted the human input but a
        // different constraint still blocks" outcome — see IMPL-026A in
        // atlasent-api), or any other terminal non-allow — fail closed.
        // Reported as a synthetic "deny" so the shared deny-shaped reporting
        // (commit status, Slack, PR comment, denyReason) carries the REAL
        // post-wait reason, not the stale original hold/escalate one.
        const reason =
          (resolution.claimFailure === "change_plan_mismatch"
            ? `human approval resolved to '${resolution.status}', but the claim was refused: the change ` +
              "plan presented at claim differs from the plan that was approved (change_plan_mismatch)"
            : `human approval resolved to '${resolution.status}'` +
              (resolution.claimFailure ? ` (permit claim failed: ${resolution.claimFailure})` : "")) +
          (resolution.reEvaluationDecision
            ? ` (fresh reevaluation: ${resolution.reEvaluationDecision})`
            : "") +
          " — deploy blocked (fail-closed).";
        await reportEnforceFailure(
          new EnforceError(`Authorization DENIED: ${reason}`, "verify", {
            ...originalDecision,
            decision: "deny",
            denyReason: reason,
          }),
        );
        return;
      }

      // A mandatory change-control permit is bound to a runtime-derived
      // execution hash, and v1-verify-permit requires it back as
      // payload_hash (PAYLOAD_HASH_REQUIRED otherwise). The hold decision's
      // own hash (if any) describes the ORIGINAL evaluation, not the claimed
      // permit, so it is never reused. No hash on the claim → refuse rather
      // than attempt an unbound verify or hand an unbindable permit onward.
      if (MANDATORY_CHANGE_CONTROL_ACTIONS.has(actionType) && !resolution.executionHashExpected) {
        const reason =
          "human approval was granted and a permit was claimed, but the claim response carried no " +
          "execution_hash_expected, so the permit cannot be verified against its bound change plan " +
          "— deploy blocked (fail-closed).";
        await reportEnforceFailure(
          new EnforceError(`Authorization DENIED: ${reason}`, "verify", {
            ...originalDecision,
            decision: "deny",
            denyReason: reason,
          }),
        );
        return;
      }

      // Approved with a fresh permit token. `executionHashExpected` is set
      // explicitly (even to undefined) so the hold decision's stale value
      // can never be re-presented for the claimed permit.
      const freshDecision: Decision = {
        ...originalDecision,
        decision: "allow",
        permitToken: resolution.permitToken,
        executionHashExpected: resolution.executionHashExpected,
        ...(resolution.reEvaluationId ? { evaluationId: resolution.reEvaluationId } : {}),
      };

      if (evaluateOnly) {
        // Issue-only: hand the claimed permit to the execution-boundary
        // verify step UNCONSUMED. The evaluate-only success branch below
        // outputs permit-token + execution-hash and reports verified=false.
        info(
          "AtlaSent Gate: human approval resolved — permit CLAIMED (not verified or consumed). " +
            "Re-verify it at the execution boundary.",
        );
        enforceResult = { result: undefined, decision: freshDecision, verifyOutcome: undefined };
      } else {
        // Re-verify and CONSUME it (same bindings as the original evaluate,
        // fail-closed) before treating this as allow. "approved" alone never
        // authorizes the deploy; only a verified permit does — the exact
        // contract the direct-allow path already has.
        // verifyPermit throws on a non-verified outcome (replay, expiry,
        // binding mismatch) and on infra failure; route every such throw
        // through the same fail-closed reporting instead of letting it
        // escape as an "unexpected error".
        let vr: Awaited<ReturnType<typeof verifyPermit>>;
        try {
          vr = await verifyPermit(config, freshDecision);
        } catch (verifyErr) {
          await reportEnforceFailure(
            verifyErr instanceof EnforceError
              ? new EnforceError(
                  `Human approval was granted, but the claimed permit failed verification: ` +
                    `${verifyErr.message}`,
                  "verify-permit",
                  freshDecision,
                  {
                    outcome: verifyErr.outcome,
                    verifyErrorCode: verifyErr.verifyErrorCode,
                    mismatchFields: verifyErr.mismatchFields,
                  },
                )
              : new EnforceError(
                  `Human approval was granted, but verifying the claimed permit failed: ` +
                    `${verifyErr instanceof Error ? verifyErr.message : String(verifyErr)}`,
                  "verify-permit",
                  freshDecision,
                ),
          );
          return;
        }
        if (!vr.verified) {
          await reportEnforceFailure(
            new EnforceError(
              `Human approval was granted, but the fresh permit failed verification ` +
                `(${vr.outcome ?? "unknown"}) — deploy blocked (fail-closed).`,
              "verify-permit",
              freshDecision,
              { outcome: vr.outcome, verifyErrorCode: vr.verifyErrorCode, mismatchFields: vr.mismatchFields },
            ),
          );
          return;
        }

        info(
          "AtlaSent Gate: human approval resolved ALLOW — fresh permit verified " +
            `(${vr.outcome ?? "verified"}). Proceeding.`,
        );
        enforceResult = { result: undefined, decision: freshDecision, verifyOutcome: vr.outcome };
      }
    } else {
      setOutput("decision", "error");
      setOutput("permit-token", "");
      setOutput("evaluation-id", "");
      setOutput("proof-hash", "");
      setOutput("risk-score", "");
      setOutput("chain-entry", JSON.stringify(null));
      setOutput("snapshot", JSON.stringify(null));
      setOutput("audit-hash", "");
      setOutput("verified", "false");
      setOutput("permit-issued", "false");
      setOutput("evidence-receipt", JSON.stringify(null));
      setOutput("evidence-bundle", JSON.stringify(null));

      // Fallback commit status — unexpected error path.
      await postCommitStatus({
        repository: gh.repository,
        sha: gh.sha,
        state: "error",
        description: `AtlaSent: unexpected error — ${
          (err instanceof Error ? err.message : String(err)).slice(0, 100)
        }`,
        targetUrl: `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`,
      });

      emitFinancialGovernanceAdvisory(actionType, actorId, orgId);

      appendToStepSummary(
        buildGateStepSummary({
          outcome: "error",
          action: actionType,
          actor: actorId,
          environment,
          targetId,
          runUrl: `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`,
          reason: err instanceof Error ? err.message : String(err),
        }),
      );

      setFailed(
        `AtlaSent Gate: Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
  }

  const { decision: d, verifyOutcome } = enforceResult;

  // ── evaluate-only (issue-permit) success ──────────────────────────────────
  // A permit was ISSUED but deliberately NOT verified/consumed. `verified` is
  // honestly `false` — the caller MUST re-verify at the execution boundary
  // (a `verify-permit: true` step) and gate the protected step on THAT step.
  if (evaluateOnly) {
    setDecisionOutputs(d);
    setOutput("verified", "false");
    setOutput("permit-issued", d.permitToken ? "true" : "false");
    setOutput("verify-outcome", "");
    setOutput("verify-error-code", "");

    if (!d.permitToken) {
      // allow with no permit — nothing to re-verify at the boundary. Same
      // fail-closed invariant as verifyPermit(): refuse rather than proceed.
      await postCommitStatus({
        repository: gh.repository,
        sha: gh.sha,
        state: "error",
        description: `AtlaSent: allow without permit (evaluate-only) — ${actionType}`.slice(0, 140),
        targetUrl: `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`,
      });
      setFailed(
        "AtlaSent Gate (evaluate-only): evaluate returned allow but no permit_token was issued — " +
          "there is nothing to re-verify at the execution boundary. Deploy blocked (fail-closed).",
      );
      return;
    }

    const boundaryBindingGuidance = MANDATORY_CHANGE_CONTROL_ACTIONS.has(actionType)
      ? "this step's `execution-hash` output"
      : "the SAME `artifact-digest` (when one was evaluated)";

    warning(
      "AtlaSent Gate: evaluate-only mode — a permit was ISSUED but NOT verified or consumed. " +
        "The single-use permit is consumed at the EXECUTION BOUNDARY. Add a second AtlaSent step with " +
        "`verify-permit: true`, this step's `permit-token` output, and " + boundaryBindingGuidance + ", then " +
        "gate the protected step on THAT step's `verified == 'true'`. Do NOT gate the deploy on this " +
        "step's `decision` or `permit-issued` — neither proves the artifact/environment were re-bound at the boundary.",
    );

    await postCommitStatus({
      repository: gh.repository,
      sha: gh.sha,
      state: "pending",
      description: `AtlaSent: permit issued (evaluate-only) — re-verify at boundary (${actionType})`.slice(0, 140),
      targetUrl: `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`,
    });

    appendToStepSummary(
      [
        "",
        "---",
        "## 🟦 AtlaSent Deploy Gate — PERMIT ISSUED (evaluate-only)",
        "",
        `A permit was **issued** for \`${actionType}\` by **${actorId}** in **${environment}**, ` +
          "but has **not** been verified or consumed. It must be re-verified at the execution boundary " +
          "before the protected step runs.",
        "",
        `| Field | Value |`,
        `|---|---|`,
        `| Decision | \`${d.decision}\` |`,
        "| Verified | `false` — re-verify at the boundary |",
        "| Permit | issued (single-use, unconsumed) |",
        `| Action | \`${actionType}\` |`,
        `| Actor | \`${actorId}\` |`,
        `| Environment | \`${environment}\` |`,
        ...(targetId ? [`| Target | \`${targetId}\` |`] : []),
        ...(d.evaluationId ? [`| Evaluation ID | \`${d.evaluationId}\` |`] : []),
        "",
        "> **Next step:** add an AtlaSent step with `verify-permit: true`, " +
          "`permit-token: ${{ steps.<this-step>.outputs.permit-token }}`, and " +
          boundaryBindingGuidance + ", " +
          "then gate the deploy on that step's `verified == 'true'`.",
        `[View workflow run](${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id})`,
        "",
      ].join("\n"),
    );

    info(
      "Authorization EVALUATED (permit issued, NOT yet verified). " +
        `Re-verify at the execution boundary (verify-permit: true). Evaluation: ${d.evaluationId ?? ""}`,
    );

    emitFinancialGovernanceAdvisory(actionType, actorId, orgId);
    return;
  }

  setDecisionOutputs(d);
  setOutput("verified", "true");
  setOutput("permit-issued", "true");
  setOutput("verify-outcome", verifyOutcome ?? "verified");
  setOutput("verify-error-code", "");

  // Fallback commit status for orgs without the full GitHub App installation.
  // Best-effort: failure to post never blocks the gate.
  await postCommitStatus({
    repository: gh.repository,
    sha: gh.sha,
    state: "success",
    description: `AtlaSent: authorized — ${actionType}`,
    targetUrl: `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`,
  });

  info(`Authorization GRANTED (evaluate + verify)`);
  info(`  Permit token: (set as 'permit-token' output, masked in logs)`);
  info(`  Proof hash:   (set as 'proof-hash' output, masked in logs)`);
  info(`  Evaluation:   ${d.evaluationId ?? ""}`);
  if (d.riskScore !== undefined) info(`  Risk score:   ${d.riskScore}`);
  info(`  Verify:       ${verifyOutcome ?? "verified"}`);

  // ── Build evidence bundle ─────────────────────────────────────────────────
  // Best-effort: evidence output failures must never block the gate decision.
  let evidenceReceiptId: string | undefined;
  try {
    const receiptSigningSecret = process.env["ATLASENT_RECEIPT_SIGNING_SECRET"];
    const receiptSigningKeyId = getInput("receipt-signing-key-id");
    const runUrl = `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`;

    const bundle = buildEvidenceBundle({
      evaluationId: d.evaluationId ?? "",
      permitToken: d.permitToken ?? "",
      auditHash: d.auditHash,
      action: actionType,
      actor: actorId,
      environment,
      repository: gh.repository,
      sha: gh.sha,
      runId: gh.run_id,
      runUrl,
      signingSecret: receiptSigningSecret || undefined,
      signingKeyId: receiptSigningKeyId || undefined,
    });

    setOutput("evidence-receipt", JSON.stringify(bundle.receipt));
    setOutput("evidence-bundle", JSON.stringify(bundle));
    evidenceReceiptId = bundle.receipt.receipt_id;
    info(
      `  Evidence:     receipt=${bundle.receipt.receipt_id} algorithm=${bundle.receipt.algorithm}`,
    );
  } catch (bundleErr) {
    warning(
      `AtlaSent: evidence bundle build failed (advisory; gate decision unaffected): ${
        bundleErr instanceof Error ? bundleErr.message : String(bundleErr)
      }`,
    );
    setOutput("evidence-receipt", JSON.stringify(null));
    setOutput("evidence-bundle", JSON.stringify(null));
  }

  // ── Job summary — the rich panel a customer reads on the run page ─────────
  // Best-effort: a summary failure must never affect the (already-granted) gate.
  appendToStepSummary(
    buildGateStepSummary({
      outcome: "allow",
      action: actionType,
      actor: actorId,
      environment,
      targetId,
      runUrl: `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`,
      verified: true,
      verifyOutcome,
      evaluationId: d.evaluationId,
      auditHash: d.auditHash,
      riskScore: d.riskScore,
      riskClass: d.risk_class,
      permitIssued: !!d.permitToken,
      evidenceReceiptId,
    }),
  );

  // ── B7: emit execution_started evidence event ────────────────────────────
  // Best-effort, fire-and-forget. Build outcome is already determined above.
  if (d.permitToken && d.evaluationId) {
    await emitEvidenceEvent(
      { apiKey, apiUrl },
      {
        event_type: "execution_started",
        permit_token: d.permitToken,
        evaluation_id: d.evaluationId,
        environment,
        execution_started_at: new Date().toISOString(),
        metadata: {
          source: "github-action",
          repository: gh.repository,
          ref: gh.ref,
          sha: gh.sha,
          workflow: gh.workflow,
          run_id: gh.run_id,
          run_url: `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`,
          action: actionType,
          actor: actorId,
        },
      },
      { info, warning },
    );
  }

  emitFinancialGovernanceAdvisory(actionType, actorId, orgId);

  // ── Post-deploy compliance evidence bundle (optional) ───────────────────
  // Only fires when the gate passed (decision=allow + verified=true).
  // Gracefully degrades on 402 (enterprise only) or network errors.
  await runPostDeployEvidenceBundleStep(apiKey, apiUrl, orgId, actorId);

  // ── Behavior insights campaign evaluation (optional) ─────────────────────
  // Only fires when the gate passed (decision=allow + verified=true), per
  // the insights-org-id input's own documented contract in action.yml.
  await runInsightsStep(apiKey, apiUrl, actorId);
}

// ---------------------------------------------------------------------------
// Post-deploy evidence bundle step
// ---------------------------------------------------------------------------

async function runPostDeployEvidenceBundleStep(
  apiKey: string,
  apiUrl: string,
  orgId: string,
  actorId: string,
): Promise<void> {
  const bundleInput = getInput("evidence-bundle").toLowerCase();

  // Always set outputs so downstream steps can reference them unconditionally.
  const setEmptyBundleOutputs = (): void => {
    setOutput("evidence-bundle-sha256", "");
    setOutput("evidence-bundle-id", "");
  };

  if (!bundleInput || bundleInput === "false") {
    setEmptyBundleOutputs();
    return;
  }

  // Resolve regime: 'true' → 'soc2_type_ii', else treat as literal regime id.
  const regime: EvidenceBundleRegime =
    bundleInput === "true"
      ? "soc2_type_ii"
      : (bundleInput as EvidenceBundleRegime);

  if (!VALID_EVIDENCE_REGIMES.has(regime)) {
    warning(
      `AtlaSent evidence-bundle: unrecognized regime "${regime}". ` +
        `Expected one of: ${Array.from(VALID_EVIDENCE_REGIMES).join(", ")}. Skipping.`,
    );
    setEmptyBundleOutputs();
    return;
  }

  const rawDays = getInput("evidence-bundle-days") || "90";
  const days = parseInt(rawDays, 10);
  if (Number.isNaN(days) || days < 1) {
    warning(
      `AtlaSent evidence-bundle: evidence-bundle-days must be a positive integer (got "${rawDays}"). Skipping.`,
    );
    setEmptyBundleOutputs();
    return;
  }

  info(
    `AtlaSent evidence-bundle: generating ${regime} bundle (${days}-day window) for org ${orgId}`,
  );

  const result = await callPostDeployEvidenceBundle(
    { apiUrl, apiKey, orgId, regime, days, actor: actorId },
    { info, warning },
  );

  setOutput("evidence-bundle-sha256", result.sha256);
  setOutput("evidence-bundle-id", result.exportId);

  if (result.sha256) {
    info(`AtlaSent evidence-bundle: bundle_sha256=${result.sha256}`);
  }
}

// ---------------------------------------------------------------------------
// Behavior insights campaign evaluation step
// ---------------------------------------------------------------------------

/**
 * When `insights-org-id` is set, fire a best-effort behavior-insights
 * campaign evaluate call for the acting subject after a successful
 * authorization. Never blocks or reverses the (already-granted) gate
 * decision — `runInsightsEvaluate` itself swallows every failure mode
 * (403 flag-not-enabled, non-2xx, network error) and returns null, and this
 * wrapper always sets both outputs so a downstream step can reference them
 * unconditionally, matching `runPostDeployEvidenceBundleStep`'s contract.
 */
async function runInsightsStep(
  apiKey: string,
  apiUrl: string,
  actorId: string,
): Promise<void> {
  const orgId = getInput("insights-org-id");

  const setEmptyInsightsOutputs = (): void => {
    setOutput("insights-fired", JSON.stringify([]));
    setOutput("insights-skipped", JSON.stringify([]));
  };

  if (!orgId) {
    setEmptyInsightsOutputs();
    return;
  }

  const subjectId = getInput("insights-subject-id") || actorId;
  const rawSessionCount = getInput("insights-session-count");
  let sessionCount: number | undefined;
  if (rawSessionCount) {
    const parsed = parseInt(rawSessionCount, 10);
    sessionCount = Number.isNaN(parsed) ? undefined : parsed;
  }

  const result = await runInsightsEvaluate(
    { apiKey, apiUrl, orgId, subjectId, sessionCount },
    { info, warning },
  );

  if (!result) {
    setEmptyInsightsOutputs();
    return;
  }

  setOutput("insights-fired", JSON.stringify(result.fired));
  setOutput("insights-skipped", JSON.stringify(result.skipped));
}

if (require.main === module) {
  run().catch((err) => {
    console.log(`::error::Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
