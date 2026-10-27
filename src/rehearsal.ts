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
// Identity: a FRESH actor_identity.v1 is minted for every evaluate and every
// verify call that presents one (the broker refuses a replayed GitHub OIDC
// token, and each mint requests a new one). Case 1 presents none.

import {
  EnforceError,
  evaluate,
  requiredBindingsFor,
  verifyPermit,
} from "@atlasent/enforce";
import type { Decision, EnforceConfig } from "@atlasent/enforce";
import type { ApprovalEvidence } from "./approvals";
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
    "deny INSUFFICIENT_APPROVALS, or hold/escalate (approvals 0), no permit",
  authorized_action_succeeds: "allow with a permit and execution hash, then verified",
  changed_or_replayed_denied: "the same permit presented again is refused PERMIT_ALREADY_USED",
  changed_target_denied:
    "a fresh permit presented for a changed target is refused PERMIT_BINDING_MISMATCH, then verified for its own target",
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
   * Runtime request id of the evaluation this case created. For case 4,
   * which only re-presents case 3's permit, the id of case 3's evaluation.
   */
  request_id: string | null;
  /** The verify the case is about (case 5: the changed-target verify). */
  verify_outcome?: string;
  verify_error_code?: string;
  /** Case 5 only: the verify that presents the permit's own target. */
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
  /**
   * PR-review approval evidence derived exactly as the single-eval path
   * derives it; null when approvals-from is not "pr-reviews".
   */
  approvalEvidence: ApprovalEvidence | null;
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

/** allow + permit + runtime execution hash: the only decision a case can verify. */
function isVerifiableAllow(d: Decision): boolean {
  return d.decision === "allow" && !!d.permitToken && !!d.executionHashExpected;
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

  // Approval evidence as the single-eval path sends it. A failed PR-review
  // lookup is 0 approvals, never omitted, whenever pr-reviews was requested.
  const derivedApprovals: Record<string, unknown> = args.approvalEvidence
    ? {
        approvals: args.approvalEvidence.approvals,
        approving_reviewers: args.approvalEvidence.approving_reviewers,
      }
    : {};

  const evalConfig = (
    caseId: RehearsalCaseId,
    opts: { actor: string; identity?: MintedGithubActionsIdentity; approvals: Record<string, unknown> },
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
      pr_number: args.approvalEvidence?.pr_number ?? gh.pr_number ?? null,
      run_url: `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`,
      ...opts.approvals,
      // Applied last: nothing above can shadow the markers the console
      // finds these evaluations by.
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
    const d = await evaluateCase(
      evalConfig("unauthorized_denied", { actor: UNVERIFIED_REHEARSAL_ACTOR, approvals: derivedApprovals }),
    );
    const expected = d.decision === "deny" && d.denyCode === "ACTOR_UNVERIFIED" && !d.permitToken;
    record({ case_id: "unauthorized_denied", status: expected ? "expected" : "unexpected", ...decisionFields(d) });
  }

  // ── Case 2: verified actor, zero approvals ────────────────────────────────
  // approvals: 0 is set explicitly and never derived from PR reviews. A hold
  // or escalate is not waited on.
  {
    const d = await evaluateCase(
      evalConfig("missing_approval_denied_or_held", {
        actor: case2Identity.actorId,
        identity: case2Identity,
        approvals: { approvals: 0 },
      }),
    );
    const refused =
      (d.decision === "deny" && d.denyCode === "INSUFFICIENT_APPROVALS") ||
      d.decision === "hold" ||
      d.decision === "escalate";
    record({
      case_id: "missing_approval_denied_or_held",
      status: refused && !d.permitToken ? "expected" : "unexpected",
      ...decisionFields(d),
    });
  }

  // ── Case 3: verified actor, derived approvals: allow, then consume ────────
  const case3Identity = await mintFresh("case 3 evaluate");
  const d3 = await evaluateCase(
    evalConfig("authorized_action_succeeds", {
      actor: case3Identity.actorId,
      identity: case3Identity,
      approvals: derivedApprovals,
    }),
  );
  const case3Allowed = isVerifiableAllow(d3);
  let case3Verified = false;
  if (!case3Allowed) {
    record({ case_id: "authorized_action_succeeds", status: "unexpected", ...decisionFields(d3) });
  } else {
    const v = await verifyCase(d3, targetId, "case 3 verify");
    case3Verified = v.verified;
    record({
      case_id: "authorized_action_succeeds",
      status: v.verified ? "expected" : "unexpected",
      ...decisionFields(d3),
      verify_outcome: v.outcome ?? (v.verified ? "verified" : undefined),
      ...(v.code !== undefined ? { verify_error_code: v.code } : {}),
    });
  }

  // ── Case 4: the consumed case-3 permit, presented again ───────────────────
  if (!case3Verified) {
    record(notRun("changed_or_replayed_denied", d3.evaluationId ?? null));
  } else {
    const v = await verifyCase(d3, targetId, "case 4 replay verify");
    record({
      case_id: "changed_or_replayed_denied",
      status: !v.verified && v.code === "PERMIT_ALREADY_USED" ? "expected" : "unexpected",
      decision: null,
      deny_code: null,
      request_id: d3.evaluationId ?? null,
      verify_outcome: v.outcome ?? (v.verified ? "verified" : undefined),
      ...(v.code !== undefined ? { verify_error_code: v.code } : {}),
    });
  }

  // ── Case 5: a fresh permit, presented for a changed target, then its own ──
  if (!case3Allowed) {
    record(notRun("changed_target_denied"));
    return;
  }
  const case5Identity = await mintFresh("case 5 evaluate");
  const d5 = await evaluateCase(
    evalConfig("changed_target_denied", {
      actor: case5Identity.actorId,
      identity: case5Identity,
      approvals: derivedApprovals,
    }),
  );
  if (!isVerifiableAllow(d5)) {
    record({ case_id: "changed_target_denied", status: "not_run", ...decisionFields(d5) });
    return;
  }
  const changed = await verifyCase(d5, `${targetId}${CHANGED_TARGET_SUFFIX}`, "case 5 changed-target verify");
  // A changed-target verify that succeeded has consumed the permit; there is
  // nothing left for the control verify to show.
  const control = changed.verified ? undefined : await verifyCase(d5, targetId, "case 5 control verify");
  const expected =
    !changed.verified && changed.code === "PERMIT_BINDING_MISMATCH" && control?.verified === true;
  record({
    case_id: "changed_target_denied",
    status: expected ? "expected" : "unexpected",
    ...decisionFields(d5),
    verify_outcome: changed.outcome ?? (changed.verified ? "verified" : undefined),
    ...(changed.code !== undefined ? { verify_error_code: changed.code } : {}),
    ...(control
      ? {
          control_verify_outcome: control.outcome ?? (control.verified ? "verified" : undefined),
          ...(control.code !== undefined ? { control_verify_error_code: control.code } : {}),
        }
      : {}),
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
    return (
      `| \`${c.case_id}\` | ${REHEARSAL_CASE_EXPECTATIONS[c.case_id]} | ${statusLabel[c.status]} | ` +
      `${cell(c.decision)} | ${cell(c.deny_code)} | ${verify} | ${cell(c.request_id)} |`
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
    "| Case | Expected | Status | Decision | Deny code | Verify | Request ID |",
    "|---|---|---|---|---|---|---|",
    ...rows,
    "",
    ...(report.error ? [`Stopped early: ${report.error.replace(/[\r\n]/g, " ").slice(0, 500)}`, ""] : []),
    "> **This verdict is informational.** The AtlaSent console decides whether the rehearsal passed " +
      "from the runtime's own records of these calls (found by `context.rehearsal_request_id`). " +
      "That server-side check is what counts. A rehearsal never authorizes a protected step.",
    "",
    `[View workflow run](${meta.runUrl})`,
    "",
  ].join("\n");
}
