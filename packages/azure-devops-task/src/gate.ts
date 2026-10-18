// @atlasent/azure-devops-task — core gate logic.
//
// Platform-agnostic apart from the small TaskLogger interface below, so it
// can be unit-tested without azure-pipelines-task-lib and without a real
// Azure Pipelines agent. The AtlaSentGate task entrypoint
// (AtlaSentGate/dist/index.js, built from src/index.ts) is a thin adapter
// that reads Azure Pipelines task inputs/variables, calls parseInputs() +
// runGate() here, and reports the result via azure-pipelines-task-lib.
//
// Mirrors atlasent-action's own single-eval GitHub Action path (src/index.ts
// in this repo) against Azure Pipelines instead of @actions/core: evaluate
// -> verify -> verify-permit (+ optional pause-and-resume), fail-closed on
// anything but decision=allow AND a verified, unreplayed permit.
//
// Deliberately narrower scope than the GitHub Action for this first slice:
// no GitHub-OIDC-style verified-workload-actor minting, no mandatory
// change-plan derivation, no approval-artifact minting, no
// batch/policy-sync/release-mode/governance-agents/change-brief/posture-scan
// modes. Single-eval only. See packages/azure-devops-task/README.md.
//
// An Azure-scoped step (azureSubscriptionId/azureResourceGroup given) runs as
// a Consequential Operation instead (./azureOperation.ts): evaluate-only ->
// admit-operation (consume-and-admit, provider "azure") -> the deployment ->
// establish-effect (v1-azure-effect-verify, then establish-effect). A plain
// consuming verify (enforce / verifyPermit) is refused for an Azure scope,
// because it spends the permit with no operation for the effect to close.

import {
  evaluate,
  verify,
  verifyPermit,
  reverifyPermit,
  requiredBindingsFor,
  waitForApprovalResolution,
  EnforceError,
  type Decision,
  type EnforceConfig,
} from "@atlasent/enforce";
import {
  AzureOperationError,
  admissionOperationKey,
  admitAzureOperation,
  establishAzureEffect,
  normalizeDeploymentOutcome,
  recordAzureEffect,
  recordNonSuccess,
  type AzureLocus,
  type DeploymentOutcome,
} from "./azureOperation";

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

export interface TaskLogger {
  debug(message: string): void;
  info(message: string): void;
  warning(message: string): void;
  error(message: string): void;
}

/** A logger that discards everything — useful as a test default. */
export const nullLogger: TaskLogger = {
  debug: () => {},
  info: () => {},
  warning: () => {},
  error: () => {},
};

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

export type ApprovalsFrom = "pr-reviews" | "none";
export type GateMode = "enforce" | "evaluate-only" | "admit-operation" | "establish-effect";

export interface GateInputs {
  apiKey: string;
  apiUrl?: string;
  action: string;
  actor: string;
  targetId?: string;
  environment: string;
  context: Record<string, unknown>;
  approvalsFrom: ApprovalsFrom;
  waitForApproval: boolean;
  maxWaitMinutes: number;
  /**
   * "enforce" (default): evaluate -> verify -> verify-permit in one task
   * invocation, consuming the single-use permit here. "evaluate-only":
   * evaluate -> verify only — ISSUES a permit without consuming it, for a
   * later task invocation (verifyPermitOnly: true, same action/actor/
   * targetId/environment) to re-verify and consume immediately before the
   * protected step actually runs — the execution-boundary pattern. Ignored
   * when verifyPermitOnly is true.
   */
  mode: GateMode;
  /**
   * When true, this task invocation does NOT call evaluate() at all — it
   * re-verifies (and consumes) an already-issued permit token immediately
   * before a protected step, independent of the task invocation that issued
   * it. Requires permitToken. See reverifyPermit() in @atlasent/enforce.
   */
  verifyPermitOnly: boolean;
  /** Required when verifyPermitOnly is true: the permit token from an
   *  earlier mode: evaluate-only task invocation. */
  permitToken?: string;
  /** The Azure scope bound into context.azure, when one was given. */
  azure?: AzureLocus;
  /** admit-operation: the evaluate-only step's executionHash output. */
  executionHash?: string;
  /** establish-effect inputs. */
  operationId?: string;
  attemptId?: string;
  evaluationId?: string;
  correlationId?: string;
  deploymentOutcome?: DeploymentOutcome;
  /** establish-effect: how long to keep asking while the Activity Log has not surfaced the event. */
  effectWaitMinutes?: number;
}

/**
 * Raw, unvalidated strings as read from the Azure Pipelines environment —
 * task inputs (tl.getInput) and predefined variables (tl.getVariable) are
 * both just strings (or undefined), so this is the seam parseInputs()
 * validates and defaults from. Kept separate from the ADO SDK itself so
 * tests can supply plain objects.
 */
export interface RawGateEnv {
  /** ATLASENT_API_KEY — read from the environment, same convention as the
   *  GitHub Action (a secret, never a plain task input). */
  apiKey: string | undefined;
  /** ATLASENT_BASE_URL, or the optional `apiUrl` task input override. */
  apiUrl: string | undefined;
  action: string | undefined;
  actor: string | undefined;
  targetId: string | undefined;
  environment: string | undefined;
  contextRaw: string | undefined;
  approvalsFromRaw: string | undefined;
  waitForApprovalRaw: string | undefined;
  maxWaitMinutesRaw: string | undefined;
  /** "enforce" (default) | "evaluate-only". */
  modeRaw: string | undefined;
  /** "true" to run in verify-permit-only (execution-boundary) mode. */
  verifyPermitRaw: string | undefined;
  /** The permit token to re-verify — required when verifyPermitRaw is "true". */
  permitTokenRaw: string | undefined;
  /** Build.RequestedFor — classic/YAML pipeline predefined variable. */
  buildRequestedFor: string | undefined;
  /** Release.RequestedFor — classic release pipeline predefined variable. */
  releaseRequestedFor: string | undefined;
  /** Build.SourceBranch — used for the same "main => live" auto-environment
   *  heuristic atlasent-action's GitHub Action applies to `github.ref`. */
  sourceBranch: string | undefined;
  /** Azure scope this step will change. Both or neither. Bound into the
   *  evaluate context as `context.azure`, which v1-evaluate signs into the
   *  permit and v1-verify-permit re-checks at the execution boundary. */
  azureSubscriptionIdRaw?: string | undefined;
  azureResourceGroupRaw?: string | undefined;
  azureDeploymentNameRaw?: string | undefined;
  /** Azure DevOps predefined variables describing this run. Recorded as
   *  `context.azure_devops` for audit and later correlation; they are the
   *  pipeline's own claims about itself, never authority. */
  run?: Partial<Record<keyof AzureDevOpsRunContext, string | undefined>>;
  /** admit-operation: the evaluate-only step's executionHash output. */
  executionHashRaw?: string | undefined;
  /** establish-effect: the admit-operation step's operationId / attemptId outputs. */
  operationIdRaw?: string | undefined;
  attemptIdRaw?: string | undefined;
  /** establish-effect: the evaluate-only step's evaluationId output. */
  evaluationIdRaw?: string | undefined;
  /** establish-effect: the ARM deployment's correlation id. */
  correlationIdRaw?: string | undefined;
  /** establish-effect: succeeded | failed | unknown, or an Agent.JobStatus value. */
  deploymentOutcomeRaw?: string | undefined;
  effectWaitMinutesRaw?: string | undefined;
}

/** Run metadata recorded under `context.azure_devops`. */
export interface AzureDevOpsRunContext {
  organization_url: string;
  project: string;
  pipeline: string;
  run_id: string;
  repository: string;
  commit: string;
}

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESOURCE_GROUP_RE = /^[-\w.()]{1,90}$/;
/** ARM deployment names: 1-64 of alphanumerics, underscore, hyphen, period and parentheses. */
const DEPLOYMENT_NAME_RE = /^[-\w.()]{1,64}$/;

/**
 * Resolve the Azure locus from the dedicated inputs and/or `context.azure`.
 * The inputs are the supported path; a `context.azure` given in the JSON
 * context must agree with them. Values are normalized to lowercase so the
 * same scope is presented identically at evaluate and at verify.
 */
export function resolveAzureLocus(
  subscriptionRaw: string | undefined,
  resourceGroupRaw: string | undefined,
  context: Record<string, unknown>,
  deploymentNameRaw?: string | undefined,
): { subscription_id: string; resource_group: string; deployment_name?: string } | undefined {
  let sub = (subscriptionRaw ?? "").trim();
  let rg = (resourceGroupRaw ?? "").trim();

  let fromContext: Record<string, unknown> | undefined;
  if (context["azure"] !== undefined) {
    const c = context["azure"];
    if (!c || typeof c !== "object" || Array.isArray(c)) {
      throw new GateInputError("`context.azure` must be an object with subscription_id and resource_group");
    }
    fromContext = c as Record<string, unknown>;
  }

  if (!sub && !rg) {
    if (!fromContext) {
      if ((deploymentNameRaw ?? "").trim()) {
        throw new GateInputError("azureDeploymentName requires azureSubscriptionId and azureResourceGroup");
      }
      return undefined;
    }
    sub = typeof fromContext.subscription_id === "string" ? fromContext.subscription_id.trim() : "";
    rg = typeof fromContext.resource_group === "string" ? fromContext.resource_group.trim() : "";
    if (!sub || !rg) {
      throw new GateInputError("`context.azure` must carry both subscription_id and resource_group");
    }
  } else if (!sub || !rg) {
    throw new GateInputError("azureSubscriptionId and azureResourceGroup must be given together");
  }

  if (!GUID_RE.test(sub)) throw new GateInputError("azureSubscriptionId must be a subscription GUID");
  if (!RESOURCE_GROUP_RE.test(rg) || rg.endsWith(".")) {
    throw new GateInputError("azureResourceGroup is not a valid Azure resource group name");
  }
  const locus = { subscription_id: sub.toLowerCase(), resource_group: rg.toLowerCase() };

  if (
    fromContext &&
    (String(fromContext.subscription_id ?? "").trim().toLowerCase() !== locus.subscription_id ||
      String(fromContext.resource_group ?? "").trim().toLowerCase() !== locus.resource_group)
  ) {
    throw new GateInputError("`context.azure` disagrees with azureSubscriptionId/azureResourceGroup");
  }

  // The ARM deployment this step will run, named before it runs. AtlaSent
  // stores it with the decision, and only that deployment can later verify
  // the decision's effect. Given as azureDeploymentName or as
  // context.azure.deployment_name; if both, they must agree.
  const fromInput = (deploymentNameRaw ?? "").trim();
  const ctxName = fromContext?.deployment_name;
  if (ctxName !== undefined && typeof ctxName !== "string") {
    throw new GateInputError("`context.azure.deployment_name` must be a string");
  }
  const fromCtx = (ctxName ?? "").trim();
  if (fromInput && fromCtx && fromInput.toLowerCase() !== fromCtx.toLowerCase()) {
    throw new GateInputError("`context.azure.deployment_name` disagrees with azureDeploymentName");
  }
  const deploymentName = fromInput || fromCtx;
  if (deploymentName) {
    if (!DEPLOYMENT_NAME_RE.test(deploymentName)) {
      throw new GateInputError("azureDeploymentName is not a valid ARM deployment name (1-64 of letters, digits, _ - . ( ))");
    }
    return { ...locus, deployment_name: deploymentName };
  }
  return locus;
}

function runContext(run: RawGateEnv["run"]): Partial<AzureDevOpsRunContext> {
  const out: Partial<AzureDevOpsRunContext> = {};
  for (const [k, v] of Object.entries(run ?? {})) {
    const t = (v ?? "").trim();
    if (t) out[k as keyof AzureDevOpsRunContext] = t;
  }
  return out;
}

export class GateInputError extends Error {}

/**
 * Resolve `environment` the same way atlasent-action's GitHub Action does
 * (src/index.ts's resolveEnvironment): an explicit value always wins;
 * otherwise infer from the API key's test/live prefix; otherwise infer from
 * the source branch (main/master => live, anything else => test).
 *
 * Mirrored here rather than imported — this package has no dependency on the
 * GitHub Action's own src/ (that is application code for a different task
 * runtime, not a published library). Keep in sync by hand; a mismatch only
 * changes the DEFAULT this task guesses when `environment` is omitted, never
 * what the runtime itself enforces.
 */
export function resolveEnvironment(
  explicit: string | undefined,
  apiKey: string,
  sourceBranch: string | undefined,
): string {
  const trimmed = (explicit ?? "").trim();
  if (trimmed) return trimmed;
  if (apiKey.startsWith("ask_test_")) return "test";
  if (apiKey.startsWith("ask_live_")) return "live";
  const branch = (sourceBranch ?? "").replace(/^refs\/heads\//, "");
  return branch === "main" || branch === "master" ? "live" : "test";
}

export function parseInputs(env: RawGateEnv): GateInputs {
  const apiKey = (env.apiKey ?? "").trim();
  if (!apiKey) {
    throw new GateInputError(
      "Missing required environment variable: ATLASENT_API_KEY. Set it as a secret " +
        "pipeline variable and map it into this task's environment, e.g. " +
        "`env: { ATLASENT_API_KEY: $(AtlasentApiKey) }` on the task step.",
    );
  }

  const action = (env.action ?? "").trim();
  if (!action) {
    throw new GateInputError("Missing required input: action");
  }

  const actor =
    (env.actor ?? "").trim() ||
    (env.buildRequestedFor ?? "").trim() ||
    (env.releaseRequestedFor ?? "").trim() ||
    "unknown";

  const environment = resolveEnvironment(env.environment, apiKey, env.sourceBranch);

  let context: Record<string, unknown> = {};
  const contextRaw = (env.contextRaw ?? "").trim();
  if (contextRaw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(contextRaw);
    } catch {
      throw new GateInputError("`context` input is not valid JSON — expected a JSON object");
    }
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new GateInputError("`context` input must be a JSON object");
    }
    context = parsed as Record<string, unknown>;
  }

  const azure = resolveAzureLocus(
    env.azureSubscriptionIdRaw,
    env.azureResourceGroupRaw,
    context,
    env.azureDeploymentNameRaw,
  );
  if (azure) context = { ...context, azure };
  const run = runContext(env.run);
  if (Object.keys(run).length > 0 && context["azure_devops"] === undefined) {
    context = { ...context, azure_devops: run };
  }

  const approvalsFromRaw = (env.approvalsFromRaw ?? "none").trim().toLowerCase();
  const approvalsFrom: ApprovalsFrom = approvalsFromRaw === "pr-reviews" ? "pr-reviews" : "none";

  const waitForApproval = (env.waitForApprovalRaw ?? "false").trim().toLowerCase() === "true";

  const maxWaitMinutesParsed = parseInt((env.maxWaitMinutesRaw ?? "30").trim(), 10);
  const maxWaitMinutes =
    Number.isFinite(maxWaitMinutesParsed) && maxWaitMinutesParsed > 0 ? maxWaitMinutesParsed : 30;

  // An unrecognized mode is refused, never defaulted: a typo of
  // "admit-operation" must not silently become a consuming "enforce".
  const modeText = (env.modeRaw ?? "").trim().toLowerCase();
  const MODES: readonly GateMode[] = ["enforce", "evaluate-only", "admit-operation", "establish-effect"];
  if (modeText && !(MODES as readonly string[]).includes(modeText)) {
    throw new GateInputError(`Unknown mode "${modeText}" (expected one of: ${MODES.join(", ")})`);
  }
  const mode: GateMode = (modeText || "enforce") as GateMode;

  const verifyPermitOnly = (env.verifyPermitRaw ?? "false").trim().toLowerCase() === "true";
  const permitToken = (env.permitTokenRaw ?? "").trim() || undefined;
  if (verifyPermitOnly && !permitToken) {
    throw new GateInputError(
      "Missing required input: permitToken (required when verifyPermit is 'true' — pass the " +
        "permitToken output from an earlier mode: evaluate-only task invocation).",
    );
  }

  const targetId = (env.targetId ?? "").trim() || undefined;
  const extra: Partial<GateInputs> = {};

  if (!verifyPermitOnly && mode === "admit-operation") {
    if (!permitToken) {
      throw new GateInputError("Missing required input: permitToken (the permitToken output of the evaluate-only step)");
    }
    const hash = (env.executionHashRaw ?? "").trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hash)) {
      throw new GateInputError(
        "Missing or malformed input: executionHash (the executionHash output of the evaluate-only step, 64 hex characters)",
      );
    }
    if (!targetId) {
      throw new GateInputError("Missing required input: targetId (the admitted operation is bound to it; give the same value as the evaluate-only step)");
    }
    if (!azure || !azure.deployment_name) {
      throw new GateInputError(
        "admit-operation needs azureSubscriptionId, azureResourceGroup and azureDeploymentName, the same values as the " +
          "evaluate-only step: AtlaSent can close an Azure operation only for the ARM deployment its decision named",
      );
    }
    extra.executionHash = hash;
  }

  if (!verifyPermitOnly && mode === "establish-effect") {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const operationId = (env.operationIdRaw ?? "").trim();
    const attemptId = (env.attemptIdRaw ?? "").trim();
    if (!uuid.test(operationId) || !uuid.test(attemptId)) {
      throw new GateInputError("Missing or malformed input: operationId and attemptId (the outputs of the admit-operation step)");
    }
    const deploymentOutcome = normalizeDeploymentOutcome(env.deploymentOutcomeRaw ?? "succeeded");
    const evaluationId = (env.evaluationIdRaw ?? "").trim();
    const correlationId = (env.correlationIdRaw ?? "").trim();
    if (deploymentOutcome === "succeeded") {
      if (!evaluationId) {
        throw new GateInputError("Missing required input: evaluationId (the evaluationId output of the evaluate-only step)");
      }
      if (!uuid.test(correlationId)) {
        throw new GateInputError(
          "Missing or malformed input: correlationId (the ARM deployment's correlation id, e.g. " +
            "`az deployment group create ... --query properties.correlationId -o tsv`)",
        );
      }
    }
    const waitParsed = parseInt((env.effectWaitMinutesRaw ?? "15").trim(), 10);
    Object.assign(extra, {
      operationId: operationId.toLowerCase(),
      attemptId: attemptId.toLowerCase(),
      evaluationId: evaluationId || undefined,
      correlationId: correlationId.toLowerCase() || undefined,
      deploymentOutcome,
      effectWaitMinutes: Number.isFinite(waitParsed) && waitParsed > 0 ? Math.min(waitParsed, 120) : 15,
    });
  }

  return {
    apiKey,
    apiUrl: (env.apiUrl ?? "").trim() || undefined,
    action,
    actor,
    targetId,
    environment,
    context,
    approvalsFrom,
    waitForApproval,
    maxWaitMinutes,
    mode,
    verifyPermitOnly,
    permitToken,
    ...(azure ? { azure } : {}),
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

/** Stringly-typed to match Azure Pipelines' own variable convention — every
 *  task/pipeline variable is a string, same posture the GitHub Action takes
 *  with core.setOutput(). */
export interface GateOutputs {
  decision: string;
  verified: string; // "true" | "false"
  permitToken: string;
  proofHash: string;
  riskScore: string;
  evaluationId: string;
  waitedForApproval: string; // "true" | "false"
  /** The payload binding the runtime put in the permit (execution_hash_expected). */
  executionHash: string;
  /** admit-operation: the admitted Consequential Operation. */
  operationId: string;
  attemptId: string;
  operationKey: string;
  /** "true" when admission may have committed with the response lost. */
  admissionOutcomeUnknown: string;
  /** establish-effect: the recorded Activity Log observation and the runtime's answer. */
  azureObservationId: string;
  effectState: string;
  /** "true" only when the runtime established the effect. */
  effectEstablished: string;
}

export function emptyOutputs(): GateOutputs {
  return {
    decision: "",
    verified: "false",
    permitToken: "",
    proofHash: "",
    riskScore: "",
    evaluationId: "",
    waitedForApproval: "false",
    executionHash: "",
    operationId: "",
    attemptId: "",
    operationKey: "",
    admissionOutcomeUnknown: "false",
    azureObservationId: "",
    effectState: "",
    effectEstablished: "false",
  };
}

function decisionOutputs(d: Decision, waitedForApproval: boolean): GateOutputs {
  return {
    ...emptyOutputs(),
    decision: d.decision,
    verified: "false",
    permitToken: d.permitToken ?? "",
    proofHash: d.proofHash ?? "",
    riskScore: d.riskScore != null ? String(d.riskScore) : "",
    evaluationId: d.evaluationId ?? "",
    waitedForApproval: waitedForApproval ? "true" : "false",
    executionHash: d.executionHashExpected ?? "",
  };
}

export interface GateResult {
  /** true only when decision=allow AND the permit was verified. Gate on
   *  this — same "verified, not decision" rule as the GitHub Action. */
  ok: boolean;
  message: string;
  outputs: GateOutputs;
}

function describeError(err: unknown): string {
  if (err instanceof EnforceError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

// ---------------------------------------------------------------------------
// The gate itself: evaluate -> (optional wait-for-approval) -> verify -> verify-permit
// ---------------------------------------------------------------------------

export async function runGate(inputs: GateInputs, log: TaskLogger): Promise<GateResult> {
  const config: EnforceConfig = {
    apiKey: inputs.apiKey,
    apiUrl: inputs.apiUrl,
    action: inputs.action,
    actor: inputs.actor,
    targetId: inputs.targetId,
    environment: inputs.environment,
    context: inputs.context,
    // Re-present every binding provided here at verify, or fail closed
    // (MISSING_BINDING) rather than silently drop it — same contract the
    // GitHub Action's single-eval path uses.
    requiredBindings: requiredBindingsFor({
      environment: inputs.environment,
      targetId: inputs.targetId,
    }),
  };

  // ── Azure scope: a Consequential Operation, never a plain consuming verify ─
  if (inputs.azure && (inputs.verifyPermitOnly || inputs.mode === "enforce")) {
    return {
      ok: false,
      message:
        "AtlaSent Gate: an Azure-scoped step must not consume its permit with a plain verify " +
        `(${inputs.verifyPermitOnly ? "verifyPermit: true" : "mode: enforce"}), because that leaves the deployment with ` +
        "no Consequential Operation for its effect to close. Use mode: evaluate-only, then mode: admit-operation " +
        "immediately before the deployment, then mode: establish-effect after it. Nothing was evaluated or consumed " +
        "(fail-closed).",
      outputs: emptyOutputs(),
    };
  }
  if (!inputs.verifyPermitOnly && inputs.mode === "admit-operation") return runAdmitOperation(inputs, log);
  if (!inputs.verifyPermitOnly && inputs.mode === "establish-effect") return runEstablishEffect(inputs, log);

  // ── Execution-boundary mode: verify (and consume) an already-issued
  // permit from an earlier `mode: evaluate-only` task invocation. No
  // evaluate() call at all — see reverifyPermit()'s own doc comment in
  // @atlasent/enforce. ────────────────────────────────────────────────────
  if (inputs.verifyPermitOnly) {
    const permitToken = inputs.permitToken as string; // guaranteed by parseInputs
    log.info(
      `AtlaSent Gate: re-verifying permit at the execution boundary for "${inputs.action}" ` +
        `(actor=${inputs.actor}, environment=${inputs.environment}` +
        (inputs.targetId ? `, target=${inputs.targetId}` : "") + ").",
    );
    try {
      const r = await reverifyPermit(config, permitToken);
      log.info(
        `AtlaSent Gate: permit re-verified at the execution boundary` +
          (r.outcome ? ` (outcome=${r.outcome})` : "") + ". Proceeding.",
      );
      return {
        ok: true,
        message: "AtlaSent Gate: permit re-verified at the execution boundary.",
        outputs: { ...emptyOutputs(), decision: "allow", verified: "true", permitToken },
      };
    } catch (err) {
      return {
        ok: false,
        message: `AtlaSent Gate: ${describeError(err)}. Deploy blocked at execution boundary (fail-closed).`,
        outputs: { ...emptyOutputs(), decision: "deny", verified: "false", permitToken },
      };
    }
  }

  if (inputs.approvalsFrom === "pr-reviews") {
    log.warning(
      "approvalsFrom: pr-reviews is not implemented for Azure DevOps Pipelines in this v1 task " +
        "— no approval count is auto-derived from Azure Repos pull request reviews. Pass " +
        "context.approvals explicitly (e.g. from an Azure Repos PR API call in an earlier step) " +
        "if your policy requires one. Proceeding as approvalsFrom: none.",
    );
  }

  // ── Step 1: evaluate ────────────────────────────────────────────────────
  let decision: Decision;
  try {
    decision = await evaluate(config);
  } catch (err) {
    return {
      ok: false,
      message: `AtlaSent Gate: ${describeError(err)}. Deploy blocked (fail-closed).`,
      outputs: emptyOutputs(),
    };
  }

  log.info(
    `AtlaSent Gate: evaluating "${inputs.action}" for actor "${inputs.actor}" in ` +
      `${inputs.environment} environment` + (inputs.targetId ? ` (target=${inputs.targetId})` : "") +
      ` -> decision=${decision.decision}` +
      (decision.evaluationId ? ` (evaluation_id=${decision.evaluationId})` : ""),
  );

  // ── Step 1b: optional pause-and-resume for hold/escalate ───────────────
  // Off unless the caller opts in AND the decision actually carries an
  // approval_request_id to poll — otherwise fall straight through to
  // verify() below, which reports the ordinary hold/escalate denial.
  let waitedForApproval = false;
  if (
    inputs.mode === "enforce" &&
    inputs.waitForApproval &&
    (decision.decision === "hold" || decision.decision === "escalate") &&
    decision.approvalRequestId
  ) {
    waitedForApproval = true;
    log.info(
      `AtlaSent Gate: authorization ${decision.decision.toUpperCase()} — waiting up to ` +
        `${inputs.maxWaitMinutes}m for a human decision (approval_request_id=${decision.approvalRequestId}).`,
    );

    let resolution: Awaited<ReturnType<typeof waitForApprovalResolution>>;
    try {
      resolution = await waitForApprovalResolution({
        apiKey: inputs.apiKey,
        apiUrl: inputs.apiUrl,
        approvalId: decision.approvalRequestId,
        maxWaitMs: inputs.maxWaitMinutes * 60_000,
      });
    } catch (err) {
      return {
        ok: false,
        message: `AtlaSent Gate: ${describeError(err)}. Deploy blocked (fail-closed).`,
        outputs: decisionOutputs(decision, waitedForApproval),
      };
    }

    if (resolution.status !== "approved" || !resolution.permitToken) {
      const reason =
        `human approval resolved to '${resolution.status}'` +
        (resolution.reEvaluationDecision
          ? ` (fresh reevaluation: ${resolution.reEvaluationDecision})`
          : "") +
        " — deploy blocked (fail-closed).";
      return {
        ok: false,
        message: `AtlaSent Gate: Authorization DENIED: ${reason}`,
        outputs: decisionOutputs({ ...decision, decision: "deny", denyReason: reason }, waitedForApproval),
      };
    }

    // Approved with a fresh permit — re-verify it below (same bindings as
    // the original evaluate) before treating this as allow. "approved"
    // alone never authorizes the deploy; only a verified permit does.
    decision = { ...decision, decision: "allow", permitToken: resolution.permitToken };
  }

  // ── Step 2: verify (decision check — no HTTP call) ─────────────────────
  try {
    verify(decision);
  } catch (err) {
    return {
      ok: false,
      message: `AtlaSent Gate: ${describeError(err)}. Deploy blocked (fail-closed).`,
      outputs: decisionOutputs(decision, waitedForApproval),
    };
  }

  // ── evaluate-only (issue-permit) success ────────────────────────────────
  // A permit was ISSUED but deliberately NOT verified/consumed. `verified`
  // is honestly "false" — the caller MUST re-verify at the execution
  // boundary (a later task invocation with verifyPermitOnly: true) and gate
  // the protected step on THAT invocation's result, not this one.
  if (inputs.mode === "evaluate-only") {
    const outputs = decisionOutputs(decision, waitedForApproval);
    if (inputs.azure && !inputs.azure.deployment_name) {
      log.warning(
        "AtlaSent Gate: this Azure-scoped permit names no ARM deployment (azureDeploymentName). mode: admit-operation " +
          "will refuse it, because AtlaSent can establish an Azure effect only for the deployment the decision named.",
      );
    }
    log.info(
      "AtlaSent Gate: permit issued (not yet verified/consumed) — re-verify it at the " +
        "execution boundary with verifyPermit: true before the protected step runs.",
    );
    return { ok: true, message: "AtlaSent Gate: permit issued (evaluate-only mode).", outputs };
  }

  // ── Step 3: verify-permit (consumes the single-use permit) ─────────────
  let verifyOutcome: string | undefined;
  try {
    const vp = await verifyPermit(config, decision);
    verifyOutcome = vp.outcome;
  } catch (err) {
    return {
      ok: false,
      message: `AtlaSent Gate: ${describeError(err)}. Deploy blocked (fail-closed).`,
      outputs: decisionOutputs(decision, waitedForApproval),
    };
  }

  const outputs = decisionOutputs(decision, waitedForApproval);
  outputs.verified = "true";
  log.info(
    `AtlaSent Gate: allowed and verified` + (verifyOutcome ? ` (outcome=${verifyOutcome})` : "") + ".",
  );
  return { ok: true, message: "AtlaSent Gate: allowed and verified.", outputs };
}

// ---------------------------------------------------------------------------
// Azure Consequential Operation: admission and effect establishment
// ---------------------------------------------------------------------------

/**
 * mode: admit-operation. Consume the evaluate-only permit AND admit a durable
 * operation + attempt in one runtime transaction, immediately before the
 * deployment. `ok` (and verified="true") only when the runtime returned both
 * ids; the deployment step must be conditioned on this step succeeding.
 */
async function runAdmitOperation(inputs: GateInputs, log: TaskLogger): Promise<GateResult> {
  const permitToken = inputs.permitToken as string; // guaranteed by parseInputs
  const azure = inputs.azure as AzureLocus; // guaranteed by parseInputs
  log.info(
    `AtlaSent Gate: admitting "${inputs.action}" as an Azure Consequential Operation ` +
      `(subscription=${azure.subscription_id}, resource group=${azure.resource_group}, ` +
      `deployment=${azure.deployment_name}, target=${inputs.targetId}).`,
  );
  try {
    const r = await admitAzureOperation({
      apiUrl: inputs.apiUrl,
      apiKey: inputs.apiKey,
      permitToken,
      actionType: inputs.action,
      actorId: inputs.actor,
      targetId: inputs.targetId as string,
      environment: inputs.environment,
      payloadHash: inputs.executionHash as string,
      azure,
    });
    log.info(
      `AtlaSent Gate: permit consumed and operation admitted (operation_id=${r.operationId}, attempt_id=${r.attemptId}). ` +
        `Run the deployment named "${azure.deployment_name}" now, then establish its effect with mode: establish-effect.`,
    );
    return {
      ok: true,
      message: "AtlaSent Gate: permit consumed and Azure operation admitted.",
      outputs: {
        ...emptyOutputs(),
        decision: "allow",
        verified: "true",
        permitToken,
        evaluationId: inputs.evaluationId ?? "",
        executionHash: inputs.executionHash ?? "",
        operationId: r.operationId,
        attemptId: r.attemptId,
        operationKey: r.operationKey,
      },
    };
  } catch (err) {
    const e = err instanceof AzureOperationError ? err : null;
    // The key is a digest of the permit, never the permit: it is what an
    // operator looks the operation up by to reconcile an unknown outcome.
    const operationKey = admissionOperationKey(permitToken);
    const message = e?.outcomeUnknown
      ? `AtlaSent Gate: Azure admission outcome UNKNOWN (code=${e.code ?? "ADMISSION_OUTCOME_UNKNOWN"}): ${describeError(err)}. ` +
        `It may have committed, so the permit may be spent and an operation may exist. Do not run the deployment, and ` +
        `do not retry or mint a fresh permit until operation_key=${operationKey} has been looked up and reconciled.`
      : `AtlaSent Gate: Azure operation NOT admitted (refused${e?.code ? `, code=${e.code}` : ""}): ${describeError(err)}. ` +
        `Nothing was consumed or admitted (operation_key=${operationKey}). Do not run the deployment (fail-closed).`;
    return {
      ok: false,
      message,
      outputs: {
        ...emptyOutputs(),
        decision: "deny",
        permitToken,
        operationKey,
        admissionOutcomeUnknown: e?.outcomeUnknown ? "true" : "false",
      },
    };
  }
}

/**
 * mode: establish-effect. After the deployment: have AtlaSent read Azure's
 * Activity Log for it (v1-azure-effect-verify) and then ask the runtime to
 * establish the admitted operation's effect from that recorded observation.
 * `ok` only when the runtime itself answers established; this task never
 * reports success on its own. A deployment the pipeline reports as failed or
 * cancelled is recorded as `unknown` (record-attempt), never `failure`: only
 * the runtime records a definitive failure, from Azure evidence. The step fails.
 */
async function runEstablishEffect(inputs: GateInputs, log: TaskLogger): Promise<GateResult> {
  const base = {
    ...emptyOutputs(),
    evaluationId: inputs.evaluationId ?? "",
    operationId: inputs.operationId ?? "",
    attemptId: inputs.attemptId ?? "",
  };
  const operationId = inputs.operationId as string;
  const attemptId = inputs.attemptId as string;

  if (inputs.deploymentOutcome !== "succeeded") {
    const reported = inputs.deploymentOutcome ?? "unknown";
    const r = await recordNonSuccess({
      apiUrl: inputs.apiUrl,
      apiKey: inputs.apiKey,
      operationId,
      attemptId,
      detail: reported,
    });
    const ids = `operation_id=${operationId} attempt_id=${attemptId}`;
    return {
      ok: false,
      message:
        `AtlaSent Gate: the pipeline reported the deployment ${reported}; its effect was NOT established. ` +
        (r.recorded
          ? `The attempt was recorded as unknown (a pipeline step status is not Azure evidence of failure)` +
            `${r.state ? `, operation state=${r.state}` : ""} (${ids}).`
          : `Recording it as unknown FAILED (HTTP ${r.status || "unreachable"}); the operation is still open. ` +
            `Record it before any retry (${ids}).`),
      outputs: { ...base, effectState: r.recorded ? (r.state ?? "unknown_recorded") : `record_attempt_http_${r.status}` },
    };
  }

  log.info(
    `AtlaSent Gate: asking AtlaSent to read Azure's Activity Log for correlation id ${inputs.correlationId} ` +
      `(waiting up to ${inputs.effectWaitMinutes}m for the event to appear).`,
  );
  let observationId: string;
  let mismatch = false;
  try {
    const obs = await recordAzureEffect({
      apiUrl: inputs.apiUrl,
      apiKey: inputs.apiKey,
      requestId: inputs.evaluationId as string,
      correlationId: inputs.correlationId as string,
      waitMs: (inputs.effectWaitMinutes ?? 15) * 60_000,
    });
    observationId = obs.id;
    mismatch = obs.outcome === "mismatch";
  } catch (err) {
    const e = err instanceof AzureOperationError ? err : null;
    return {
      ok: false,
      message:
        `AtlaSent Gate: the deployment's effect was NOT verified${e?.code ? ` (code=${e.code})` : ""}: ${describeError(err)}. ` +
        "The operation stays open; do not report this change as verified.",
      outputs: { ...base, effectState: e?.code ?? "effect_verify_failed" },
    };
  }

  log.info(
    mismatch
      ? `AtlaSent Gate: Activity Log observation ${observationId} is a MISMATCH; handing it to the runtime, which records a definitive one as failure.`
      : `AtlaSent Gate: Activity Log observation ${observationId} is verified and bound; establishing the effect.`,
  );
  const est = await establishAzureEffect({
    apiUrl: inputs.apiUrl,
    apiKey: inputs.apiKey,
    operationId,
    attemptId,
    observationId,
  });
  const outputs: GateOutputs = {
    ...base,
    azureObservationId: observationId,
    effectState: est.state,
    effectEstablished: est.established ? "true" : "false",
  };
  if (mismatch) {
    return {
      ok: false,
      message:
        `AtlaSent Gate: Azure's Activity Log does not match the allowed decision (observation ${observationId}). ` +
        `The runtime answered HTTP ${est.httpStatus || "unreachable"}, state=${est.state}` +
        `${est.verdict ? `, verdict=${est.verdict}` : ""}${est.reason ? `, reason=${est.reason}` : ""}. ` +
        `The effect was NOT established (operation_id=${operationId} attempt_id=${attemptId}).`,
      outputs: { ...outputs, effectEstablished: "false" },
    };
  }
  if (!est.established) {
    return {
      ok: false,
      message:
        `AtlaSent Gate: the runtime did NOT establish the effect (HTTP ${est.httpStatus || "unreachable"}, state=${est.state}` +
        `${est.verdict ? `, verdict=${est.verdict}` : ""}${est.reason ? `, reason=${est.reason}` : ""}). ` +
        "The operation stays open; do not report this change as verified.",
      outputs,
    };
  }
  log.info(`AtlaSent Gate: effect established by the runtime (operation ${operationId} succeeded).`);
  return { ok: true, message: "AtlaSent Gate: Azure deployment effect established.", outputs };
}
