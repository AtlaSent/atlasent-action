// Authorization rehearsal mode (atlasent-console#3377).
//
// A customer's own workflow runs this mode to exercise five authorization
// cases against the AtlaSent runtime for ONE protected action, under this
// job's verified workload actor_identity.v1. Every evaluate carries
// `context.rehearsal_request_id` and `context.rehearsal_case`, so the console
// can read the RUNTIME's own records of these calls and decide, server-side,
// whether the rehearsal passed.
//
// The verdict computed here is informational only. It is never authority:
// the console's server-side check is what counts, and a rehearsal never
// authorizes a protected step (the mode always outputs verified=false).
//
// Fail-closed: an invalid input, any transport/HTTP failure, any identity
// mint failure, and any case that is not exactly as expected all fail the
// step. Permit tokens are masked the moment they are received and never
// appear in an output, a log line or the step summary.
//
// Identity: a FRESH actor_identity.v1 is minted for every evaluate, claim and
// verify call that presents one (the broker refuses a replayed GitHub OIDC
// token, and each mint requests a new one). Case 1 presents none.
//
// Approval (founder decision 2026-10-27): the approval-requiring case is
// approved by a real, verified person in the AtlaSent console, under an
// organization grant with a fresh second factor. This mode never sends a
// caller-asserted approval count (every evaluate carries approvals: 0). Case
// 2's held request IS the one that person approves: case 3 waits for that
// resolution, claims the permit with a freshly minted identity and the same
// change plan, and the runtime's claim-time reevaluation mints it. One held
// request per rehearsal means no second approvable request is left pending.

import {
  EnforceError,
  evaluate,
  requiredBindingsFor,
  verifyPermit,
  waitForApprovalResolution,
} from "@atlasent/enforce";
import type { Decision, EnforceConfig } from "@atlasent/enforce";
import { buildMandatoryChangePlan, type MandatoryChangePlan } from "./changePlan";
import {
  WorkloadIdentityError,
  mintGithubActionsActorIdentity,
  type MintedGithubActionsIdentity,
} from "./workloadIdentity";

export const REHEARSAL_CASE_IDS = [
  "unauthorized_denied",
  "missing_approval_denied_or_held",
  "authorized_action_succeeds",
  "changed_or_replayed_denied",
  "changed_target_denied",
] as const;

export type RehearsalCaseId = (typeof REHEARSAL_CASE_IDS)[number];
export type RehearsalCaseStatus = "expected" | "unexpected" | "not_run";
export type RehearsalVerdict = "all_expected" | "unexpected";

/** What each case must observe to count as expected. Shown in the step summary. */
export const REHEARSAL_CASE_EXPECTATIONS: Readonly<Record<RehearsalCaseId, string>> = {
  unauthorized_denied: "deny ACTOR_UNVERIFIED (no verified actor), no permit",
  missing_approval_denied_or_held:
    "held (hold/escalate) with an approval request and no permit; a deny INSUFFICIENT_APPROVALS also refuses, but leaves case 3 nothing to approve",
  authorized_action_succeeds:
    "a person approves case 2's held request in the AtlaSent console; the claim's reevaluation allows with a permit and execution hash, which then verifies for its own target",
  changed_or_replayed_denied: "case 3's consumed permit presented again is refused PERMIT_ALREADY_USED",
  changed_target_denied:
    "case 3's permit presented for a changed target, before its own verify, is refused PERMIT_BINDING_MISMATCH and not consumed",
};

/** actor_id sent by case 1, which presents no actor_identity. */
export const UNVERIFIED_REHEARSAL_ACTOR = "rehearsal:unverified-actor";
/** Appended to target-id for case 5's changed-target verify. */
export const CHANGED_TARGET_SUFFIX = "--rehearsal-changed";

/**
 * One case's result. Never carries a permit token, proof hash or identity
 * assertion.
 */
export interface RehearsalCaseResult {
  case_id: RehearsalCaseId;
  status: RehearsalCaseStatus;
  /** The evaluate decision this case produced; null when it made no evaluate call. */
  decision: string | null;
  deny_code: string | null;
  /**
   * Runtime evaluation id of the evaluation this case is about. Case 3: the
   * claim-time reevaluation that minted the permit. Cases 4 and 5, which only
   * present case 3's permit: the same id.
   */
  request_id: string | null;
  /** Cases 2 and 3: the approval request case 2's hold created. */
  approval_request_id?: string;
  /** Case 3: the approval's status when the wait ended, and why no permit was claimed, if none was. */
  approval_status?: string;
  claim_failure?: string;
  /** The verify the case is about (case 5: the changed-target verify). */
  verify_outcome?: string;
  verify_error_code?: string;
  /** Case 5 only: case 3's own-target verify, which follows the changed-target one. */
  control_verify_outcome?: string;
  control_verify_error_code?: string;
}

export interface RehearsalReport {
  requestId: string;
  cases: RehearsalCaseResult[];
  verdict: RehearsalVerdict;
  /** Set when the run stopped early (transport/HTTP failure, identity mint failure, invariant). */
  error?: string;
}

export interface RehearsalGithubContext {
  repository: string;
  ref: string;
  sha: string;
  workflow: string;
  run_id: string;
  run_number: string;
  event_name: string;
  pr_number: string | undefined;
  server_url: string;
}

export interface RehearsalArgs {
  apiKey: string;
  apiUrl: string;
  /** Validated, lowercase UUID (see parseRehearsalRequestId). */
  requestId: string;
  /** One of MANDATORY_CHANGE_CONTROL_ACTIONS. */
  actionType: string;
  targetId: string;
  /** Explicit, non-empty. */
  environment: string;
  /** Passed through as change_plan.artifact_ref, as the single-eval path does. */
  artifactDigest?: string;
  /** Bound on case 3's wait for a person to resolve case 2's held request. */
  maxWaitMs: number;
  github: RehearsalGithubContext;
}

export interface RehearsalDeps {
  mask: (value: string) => void;
  log: (message: string) => void;
}

/** An invariant this mode enforces itself (not a runtime answer). */
export class RehearsalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RehearsalError";
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The lowercase UUID, or null when `raw` is not a UUID. */
export function parseRehearsalRequestId(raw: string): string | null {
  const value = raw.trim();
  return UUID_RE.test(value) ? value.toLowerCase() : null;
}

// Codes @atlasent/enforce raises itself before any request is sent. They are
// local refusals, not the runtime's answer, so they never satisfy a case.
const CLIENT_SIDE_VERIFY_CODES = new Set(["MISSING_BINDING", "MISSING_PERMIT"]);

interface VerifyAttempt {
  verified: boolean;
  outcome?: string;
  code?: string;
}

/**
 * The runtime's refusal carried by a verify-permit EnforceError, or null when
 * the error is a transport/HTTP failure or a local refusal. verifyPermit()
 * attaches outcome/verifyErrorCode only when the runtime answered
 * `valid: false`; every unreachable, non-2xx or non-JSON failure carries
 * neither, and those must fail the step rather than read as a refusal.
 */
function runtimeVerifyRefusal(err: unknown): { outcome?: string; code?: string } | null {
  if (!(err instanceof EnforceError) || err.phase !== "verify-permit") return null;
  if (err.verifyErrorCode && CLIENT_SIDE_VERIFY_CODES.has(err.verifyErrorCode)) return null;
  if (err.outcome === undefined && err.verifyErrorCode === undefined) return null;
  return { outcome: err.outcome, code: err.verifyErrorCode };
}

/** hold/escalate with an approval request and no permit: the only shape case 3 can approve. */
function isApprovableHold(d: Decision): boolean {
  return (d.decision === "hold" || d.decision === "escalate") && !!d.approvalRequestId && !d.permitToken;
}

function decisionFields(d: Decision): Pick<RehearsalCaseResult, "decision" | "deny_code" | "request_id"> {
  return {
    decision: typeof d.decision === "string" ? d.decision : null,
    deny_code: d.denyCode ?? null,
    request_id: d.evaluationId ?? null,
  };
}

function notRun(caseId: RehearsalCaseId, requestId: string | null = null): RehearsalCaseResult {
  return { case_id: caseId, status: "not_run", decision: null, deny_code: null, request_id: requestId };
}

function describeError(err: unknown): string {
  if (err instanceof WorkloadIdentityError) return `workload identity mint failed: ${err.message}`;
  if (err instanceof EnforceError) return `AtlaSent ${err.phase} call failed: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

/**
 * Run the five cases in order. Never throws: an error stops the run, the
 * remaining cases are reported `not_run`, and `error` says why.
 */
export async function runRehearsal(args: RehearsalArgs, deps: RehearsalDeps): Promise<RehearsalReport> {
  const results = new Map<RehearsalCaseId, RehearsalCaseResult>();
  const record = (r: RehearsalCaseResult): void => {
    results.set(r.case_id, r);
    deps.log(
      `  [${r.status}] ${r.case_id}: decision=${r.decision ?? "-"} deny_code=${r.deny_code ?? "-"}` +
        (r.verify_outcome !== undefined || r.verify_error_code !== undefined
          ? ` verify=${r.verify_outcome ?? "-"}/${r.verify_error_code ?? "-"}`
          : "") +
        (r.control_verify_outcome !== undefined || r.control_verify_error_code !== undefined
          ? ` control_verify=${r.control_verify_outcome ?? "-"}/${r.control_verify_error_code ?? "-"}`
          : "") +
        (r.approval_request_id !== undefined || r.approval_status !== undefined
          ? ` approval=${r.approval_request_id ?? "-"}/${r.approval_status ?? "-"}` +
            (r.claim_failure !== undefined ? `/${r.claim_failure}` : "")
          : "") +
        ` request_id=${r.request_id ?? "-"}`,
    );
  };
  const finish = (error?: string): RehearsalReport => {
    const cases = REHEARSAL_CASE_IDS.map((id) => results.get(id) ?? notRun(id));
    const verdict: RehearsalVerdict =
      error === undefined && cases.every((c) => c.status === "expected") ? "all_expected" : "unexpected";
    return { requestId: args.requestId, cases, verdict, ...(error !== undefined ? { error } : {}) };
  };

  try {
    await runCases(args, deps, record);
    return finish();
  } catch (err) {
    return finish(describeError(err));
  }
}

async function runCases(
  args: RehearsalArgs,
  deps: RehearsalDeps,
  record: (r: RehearsalCaseResult) => void,
): Promise<void> {
  const { apiKey, apiUrl, requestId, actionType, targetId, environment, github: gh } = args;

  let evaluatedActorId: string | undefined;
  let revision: string | undefined;

  // A fresh broker-minted identity for exactly one evaluate or verify call.
  // Every one must name the same actor and commit as the first, or the five
  // cases would not be rehearsing the same workload.
  const mintFresh = async (purpose: string): Promise<MintedGithubActionsIdentity> => {
    const minted = await mintGithubActionsActorIdentity(
      { apiUrl, apiKey, actionType, environment },
      { mask: deps.mask },
    );
    if (evaluatedActorId === undefined) {
      evaluatedActorId = minted.actorId;
    } else if (minted.actorId !== evaluatedActorId) {
      throw new RehearsalError(
        `the identity minted for ${purpose} names actor "${minted.actorId}", not "${evaluatedActorId}"`,
      );
    }
    if (revision !== undefined && minted.source.sha !== revision) {
      throw new RehearsalError(
        `the identity minted for ${purpose} carries commit "${minted.source.sha}", not "${revision}"`,
      );
    }
    return minted;
  };

  // Minted before case 1, and presented ONLY by case 2's evaluate. Minting it
  // first gives every case, case 1 included, the same change_plan, whose
  // revision is the broker-verified commit exactly as the single-eval path
  // derives it. Case 1 must differ from case 3 only by its missing identity.
  const case2Identity = await mintFresh("case 2 evaluate");
  revision = case2Identity.source.sha;
  if (!revision) {
    throw new RehearsalError(
      "the verified GitHub workload identity did not carry a commit SHA, so a complete change_plan cannot be derived",
    );
  }
  const changePlan: MandatoryChangePlan | undefined = buildMandatoryChangePlan(
    actionType,
    revision,
    args.artifactDigest,
  );
  if (!changePlan) {
    throw new RehearsalError(`"${actionType}" is not a mandatory change-control action`);
  }
  const triggeringActor = `github:${case2Identity.source.actor}`;

  const evalConfig = (
    caseId: RehearsalCaseId,
    opts: { actor: string; identity?: MintedGithubActionsIdentity },
  ): EnforceConfig => ({
    apiKey,
    apiUrl,
    action: actionType,
    actor: opts.actor,
    ...(opts.identity ? { actorIdentity: opts.identity.assertion } : {}),
    environment,
    targetId,
    changePlan,
    state_snapshot: { source: "github-actions", complete: true, run_id: gh.run_id },
    context: {
      source: "github-action",
      repository: gh.repository,
      ref: gh.ref,
      sha: gh.sha,
      workflow: gh.workflow,
      run_id: gh.run_id,
      run_number: gh.run_number,
      event_name: gh.event_name,
      triggering_actor: triggeringActor,
      pr_number: gh.pr_number ?? null,
      run_url: `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`,
      // Applied last: nothing above can shadow them. No approval count is
      // ever asserted by the caller; the only approval is a person's, in the
      // console. The rehearsal markers are how the console finds these
      // evaluations.
      approvals: 0,
      rehearsal_request_id: requestId,
      rehearsal_case: caseId,
    },
  });

  // Transport/HTTP failures throw EnforceError and stop the run.
  const evaluateCase = async (config: EnforceConfig): Promise<Decision> => {
    const d = await evaluate(config);
    if (d.permitToken) deps.mask(d.permitToken);
    if (d.proofHash) deps.mask(d.proofHash);
    return d;
  };

  // A consuming verify of `decision`'s permit with its runtime execution hash
  // and a freshly minted identity, presenting `presentedTarget`. Every binding
  // is required, so an unbound verify is refused locally and fails the step.
  const verifyCase = async (
    decision: Decision,
    presentedTarget: string,
    purpose: string,
  ): Promise<VerifyAttempt> => {
    const minted = await mintFresh(purpose);
    const config: EnforceConfig = {
      apiKey,
      apiUrl,
      action: actionType,
      actor: minted.actorId,
      actorIdentity: minted.assertion,
      environment,
      targetId: presentedTarget,
      requiredBindings: requiredBindingsFor({
        environment,
        targetId: presentedTarget,
        executionPayloadHash: decision.executionHashExpected,
      }),
    };
    try {
      const r = await verifyPermit(config, decision);
      return { verified: r.verified === true, outcome: r.outcome, code: r.verifyErrorCode };
    } catch (err) {
      const refusal = runtimeVerifyRefusal(err);
      if (refusal) return { verified: false, ...refusal };
      throw err;
    }
  };

  // ── Case 1: no verified actor ─────────────────────────────────────────────
  {
    const d = await evaluateCase(evalConfig("unauthorized_denied", { actor: UNVERIFIED_REHEARSAL_ACTOR }));
    const expected = d.decision === "deny" && d.denyCode === "ACTOR_UNVERIFIED" && !d.permitToken;
    record({ case_id: "unauthorized_denied", status: expected ? "expected" : "unexpected", ...decisionFields(d) });
  }

  // ── Case 2: verified actor, no approval ───────────────────────────────────
  const d2 = await evaluateCase(
    evalConfig("missing_approval_denied_or_held", { actor: case2Identity.actorId, identity: case2Identity }),
  );
  const held = isApprovableHold(d2);
  const deniedForApprovals = d2.decision === "deny" && d2.denyCode === "INSUFFICIENT_APPROVALS" && !d2.permitToken;
  record({
    case_id: "missing_approval_denied_or_held",
    status: held || deniedForApprovals ? "expected" : "unexpected",
    ...decisionFields(d2),
    ...(d2.approvalRequestId ? { approval_request_id: d2.approvalRequestId } : {}),
  });

  // ── Case 3: a person approves case 2's hold; the claim mints the permit ───
  if (!held) {
    // A deny (or anything else) leaves no request a person could approve.
    record({
      case_id: "authorized_action_succeeds",
      status: "unexpected",
      decision: null,
      deny_code: null,
      request_id: null,
      approval_status: "no_approval_request",
    });
    record(notRun("changed_or_replayed_denied"));
    record(notRun("changed_target_denied"));
    return;
  }
  const approvalId = d2.approvalRequestId as string;
  deps.log(
    `AtlaSent rehearsal ${requestId}: case 2 is held as approval request ${approvalId}. Waiting up to ` +
      `${Math.round(args.maxWaitMs / 60_000)} minute(s) for a person to approve it in the AtlaSent ` +
      "console (My approvals). Approve that request only; nothing else in this run asks for approval.",
  );
  const waitStarted = Date.now();
  let resolution: Awaited<ReturnType<typeof waitForApprovalResolution>>;
  try {
    resolution = await waitForApprovalResolution({
      apiKey,
      apiUrl,
      approvalId,
      maxWaitMs: args.maxWaitMs,
      // Built at claim time: the approval may take minutes, and the claimer
      // must be this same workload, with the same change plan (the runtime
      // refuses a changed plan with 409 change_plan_mismatch).
      buildClaimBody: async (row) => {
        if (row.claimEnvironment != null && row.claimEnvironment !== environment) {
          throw new RehearsalError(
            `the approval must be claimed for environment "${row.claimEnvironment}", not "${environment}"`,
          );
        }
        const claimer = await mintFresh("case 3 claim");
        return { actor_identity: claimer.assertion, change_plan: changePlan };
      },
    });
  } catch (err) {
    // Running out the bounded wait is this case's outcome, not a transport
    // failure: nobody approved. Anything else (auth, a missing request, an
    // unbuildable claim) stops the run.
    if (err instanceof EnforceError && Date.now() - waitStarted >= args.maxWaitMs) {
      record({
        case_id: "authorized_action_succeeds",
        status: "unexpected",
        decision: null,
        deny_code: null,
        request_id: null,
        approval_request_id: approvalId,
        approval_status: "timed_out",
      });
      record(notRun("changed_or_replayed_denied"));
      record(notRun("changed_target_denied"));
      return;
    }
    throw err;
  }
  if (resolution.permitToken) deps.mask(resolution.permitToken);

  const claimed =
    (resolution.status === "approved" || resolution.status === "approved_awaiting_claim") &&
    !!resolution.permitToken &&
    !!resolution.executionHashExpected;
  const approvalFields = {
    approval_request_id: approvalId,
    approval_status: resolution.status,
    ...(resolution.claimFailure ? { claim_failure: resolution.claimFailure } : {}),
  };
  if (!claimed) {
    // Denied, expired, revoked, a refused claim, or a claim with no permit
    // or no execution hash to verify it against.
    record({
      case_id: "authorized_action_succeeds",
      status: "unexpected",
      decision: resolution.reEvaluationDecision ?? null,
      deny_code: null,
      request_id: resolution.reEvaluationId ?? null,
      ...approvalFields,
      ...(resolution.permitToken && !resolution.executionHashExpected
        ? { claim_failure: resolution.claimFailure ?? "no_execution_hash" }
        : {}),
    });
    record(notRun("changed_or_replayed_denied", resolution.reEvaluationId ?? null));
    record(notRun("changed_target_denied", resolution.reEvaluationId ?? null));
    return;
  }
  // The claimed permit as a decision. Nothing from case 2's hold is reused
  // for verify: the token, execution hash and evaluation are the claim's.
  const d3: Decision = {
    decision: "allow",
    permitToken: resolution.permitToken,
    executionHashExpected: resolution.executionHashExpected,
    evaluationId: resolution.reEvaluationId,
    approvalRequestId: approvalId,
  };
  const case3Fields = {
    decision: "allow" as string | null,
    deny_code: null,
    request_id: resolution.reEvaluationId ?? null,
    ...approvalFields,
  };

  // ── Case 5: case 3's permit, presented for a changed target first ─────────
  // v1-verify-permit refuses a target binding mismatch before it consumes
  // anything, so the permit is still unused for case 3's own verify below,
  // which is this case's control.
  const changed = await verifyCase(d3, `${targetId}${CHANGED_TARGET_SUFFIX}`, "case 5 changed-target verify");
  if (changed.verified) {
    // The changed target was accepted and consumed the permit: neither case
    // 3's own verify nor the replay check has anything left to show.
    record({
      case_id: "changed_target_denied",
      status: "unexpected",
      ...case3Fields,
      verify_outcome: changed.outcome ?? "verified",
      ...(changed.code !== undefined ? { verify_error_code: changed.code } : {}),
    });
    record({ case_id: "authorized_action_succeeds", status: "unexpected", ...case3Fields });
    record(notRun("changed_or_replayed_denied", resolution.reEvaluationId ?? null));
    return;
  }

  // ── Case 3 (continued): its own target ────────────────────────────────────
  const own = await verifyCase(d3, targetId, "case 3 verify");
  record({
    case_id: "authorized_action_succeeds",
    status: own.verified ? "expected" : "unexpected",
    ...case3Fields,
    verify_outcome: own.outcome ?? (own.verified ? "verified" : undefined),
    ...(own.code !== undefined ? { verify_error_code: own.code } : {}),
  });
  record({
    case_id: "changed_target_denied",
    status: changed.code === "PERMIT_BINDING_MISMATCH" && own.verified ? "expected" : "unexpected",
    ...case3Fields,
    verify_outcome: changed.outcome,
    ...(changed.code !== undefined ? { verify_error_code: changed.code } : {}),
    control_verify_outcome: own.outcome ?? (own.verified ? "verified" : undefined),
    ...(own.code !== undefined ? { control_verify_error_code: own.code } : {}),
  });

  // ── Case 4: the consumed case-3 permit, presented again ───────────────────
  if (!own.verified) {
    record(notRun("changed_or_replayed_denied", resolution.reEvaluationId ?? null));
    return;
  }
  const replay = await verifyCase(d3, targetId, "case 4 replay verify");
  record({
    case_id: "changed_or_replayed_denied",
    status: !replay.verified && replay.code === "PERMIT_ALREADY_USED" ? "expected" : "unexpected",
    decision: null,
    deny_code: null,
    request_id: resolution.reEvaluationId ?? null,
    verify_outcome: replay.outcome ?? (replay.verified ? "verified" : undefined),
    ...(replay.code !== undefined ? { verify_error_code: replay.code } : {}),
  });
}

// ---------------------------------------------------------------------------
// Step summary
// ---------------------------------------------------------------------------

/** Make a runtime-supplied value safe inside a Markdown table cell. */
function cell(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return `\`${value.replace(/[`|\r\n]/g, " ").slice(0, 120)}\``;
}

function verifyCell(outcome?: string, code?: string): string {
  if (outcome === undefined && code === undefined) return "—";
  return [outcome, code].filter((v) => v !== undefined && v !== "").map((v) => cell(v)).join(" / ");
}

export function renderRehearsalStepSummary(
  report: RehearsalReport,
  meta: { actionType: string; targetId: string; environment: string; runUrl: string },
): string {
  const statusLabel: Record<RehearsalCaseStatus, string> = {
    expected: "expected",
    unexpected: "**UNEXPECTED**",
    not_run: "**not run**",
  };
  const rows = report.cases.map((c) => {
    const verify =
      verifyCell(c.verify_outcome, c.verify_error_code) +
      (c.control_verify_outcome !== undefined || c.control_verify_error_code !== undefined
        ? `; own target: ${verifyCell(c.control_verify_outcome, c.control_verify_error_code)}`
        : "");
    const approval =
      c.approval_request_id === undefined && c.approval_status === undefined
        ? "—"
        : [c.approval_request_id, c.approval_status, c.claim_failure]
            .filter((v) => v !== undefined && v !== "")
            .map((v) => cell(v))
            .join(" / ");
    return (
      `| \`${c.case_id}\` | ${REHEARSAL_CASE_EXPECTATIONS[c.case_id]} | ${statusLabel[c.status]} | ` +
      `${cell(c.decision)} | ${cell(c.deny_code)} | ${approval} | ${verify} | ${cell(c.request_id)} |`
    );
  });
  const heading =
    report.verdict === "all_expected"
      ? "## AtlaSent authorization rehearsal: all five cases as expected"
      : "## AtlaSent authorization rehearsal: NOT all cases as expected";
  return [
    "",
    "---",
    heading,
    "",
    `Rehearsal \`${report.requestId}\` for \`${meta.actionType}\` on target \`${meta.targetId}\` ` +
      `in \`${meta.environment}\`.`,
    "",
    "| Case | Expected | Status | Decision | Deny code | Approval | Verify | Evaluation ID |",
    "|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    ...(report.error ? [`Stopped early: ${report.error.replace(/[\r\n]/g, " ").slice(0, 500)}`, ""] : []),
    "> **This verdict is informational.** The AtlaSent console decides whether the rehearsal passed " +
      "from the runtime's own records of these calls (found by `context.rehearsal_request_id`), " +
      "including who approved case 2's held request and the second factor recorded with that " +
      "approval. That server-side check is what counts. A rehearsal never authorizes a protected step.",
    "",
    `[View workflow run](${meta.runUrl})`,
    "",
  ].join("\n");
}
