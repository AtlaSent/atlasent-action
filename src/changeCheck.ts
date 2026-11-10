// AtlaSent Change Check — the private-repository version of the website's
// free Change Check (www.atlasent.io/change-check).
//
// The website reads GitHub's public API from the visitor's browser, so it can
// only see public repositories. This mode runs the same check inside the
// customer's own workflow, against the repository the workflow runs in, with
// that workflow's own GITHUB_TOKEN (or an optional `change-check-token`). The
// token is only ever sent to GITHUB_API_URL. Nothing is sent to AtlaSent: this
// module never calls the AtlaSent API and needs no ATLASENT_API_KEY.
//
// What it reads, for the last N pull requests merged into the default branch:
//   1. Approvals, judged exactly as the website judges them (reviewSummary,
//      selectRecentMerges and the repo-scan classification are ported from
//      atlasent-console public-landing/pr-change-check.js so the two cannot
//      disagree): each person's latest decisive review counts, a COMMENTED
//      review does not replace an earlier APPROVED or CHANGES_REQUESTED, bots
//      and the author are ignored, reviews submitted after the merge are not
//      counted, and an approval covers the merged code only when its
//      commit_id equals the pull request's head sha.
//   2. Who merged it (GET /pulls/{n}; the list endpoint does not return
//      merged_by), so a merge by its own author is visible.
//   3. GitHub deployments of the exact merge commit, each one's latest status,
//      and, for every environment that received a deployment, the protection
//      rules GitHub returns for it today.
//
// Honesty rules (same as postureScan.ts):
//   - Anything that cannot be read is reported as unknown with the HTTP
//     status and the permission that is likely missing. A 403 or 404 on
//     deployments is NEVER read as "no deployments"; an unreadable review list
//     is NEVER read as "no approval".
//   - "No deployment recorded" is stated only after GitHub answered 200 with
//     an empty list for that exact commit, and always with the caveat that
//     teams deploying with another tool will not show deployments here.
//   - Environment protection rules are today's settings, not the settings at
//     the time of each deploy. The report says so wherever it uses them.
//   - Findings never fail the step. Only a malformed input does.
//
// Permissions (checked against GitHub's "Permissions required for
// fine-grained personal access tokens" page, 2026-11-10; the workflow
// GITHUB_TOKEN keys below map to those repository permissions):
//   GET /repos/{o}/{r}/pulls, /pulls/{n}/reviews        Pull requests: read   -> `pull-requests: read`
//   GET /repos/{o}/{r}/pulls/{n}                         Pull requests OR Contents: read
//   GET /repos/{o}/{r}/deployments, .../statuses         Deployments: read     -> `deployments: read`
//   GET /repos/{o}/{r}/environments                      Actions: read         -> `actions: read`
// Not yet exercised against a live private repository from a workflow run.

export const CHANGE_CHECK_REPORT_VERSION = "atlasent.action.change-check.v1";
export const CHANGE_CHECK_DEFAULT_COUNT = 10;
export const CHANGE_CHECK_MAX_COUNT = 30;
export const PRODUCTION_CHANGE_AUDIT_URL = "https://www.atlasent.io/production-change-audit";

// Same list window as the website's repo scan (SCAN_LIST_SIZE x SCAN_LIST_PAGES).
export const SCAN_LIST_SIZE = 100;
export const SCAN_LIST_PAGES = 3;
// Reviews are paginated (the website reads one page and calls a full page
// "incomplete"; with a token there is room to read more). A list that still
// fills the last page read is reported incomplete, never judged.
export const REVIEW_PAGE_SIZE = 100;
export const REVIEW_MAX_PAGES = 10;
const DEPLOYMENT_PAGE_SIZE = 100;
const STATUS_PAGE_SIZE = 100;
const ENVIRONMENT_PAGE_SIZE = 100;

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

// ─── input validation ───────────────────────────────────────────────────────

export class ChangeCheckInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChangeCheckInputError";
  }
}

/** `change-check-count`: empty means the default; otherwise a whole number 1..30. */
export function parseChangeCheckCount(raw: string | undefined): number {
  const value = (raw ?? "").trim();
  if (value === "") return CHANGE_CHECK_DEFAULT_COUNT;
  if (!/^\d+$/.test(value)) {
    throw new ChangeCheckInputError(
      `change-check-count must be a whole number from 1 to ${CHANGE_CHECK_MAX_COUNT}; got "${value.slice(0, 40)}".`,
    );
  }
  const n = Number(value);
  if (n < 1 || n > CHANGE_CHECK_MAX_COUNT) {
    throw new ChangeCheckInputError(
      `change-check-count must be from 1 to ${CHANGE_CHECK_MAX_COUNT}; got ${value.slice(0, 40)}.`,
    );
  }
  return n;
}

// ─── ported from the website (public-landing/pr-change-check.js) ───────────

interface GhUser {
  login?: unknown;
  type?: unknown;
}

export interface GhReview {
  user?: GhUser | null;
  state?: unknown;
  commit_id?: unknown;
  submitted_at?: unknown;
}

function login(user: GhUser | null | undefined): string {
  return user && typeof user.login === "string" ? user.login : "unknown";
}
function isBot(user: GhUser | null | undefined): boolean {
  return !!user && (user.type === "Bot" || /\[bot\]$/.test(login(user)));
}
function short(sha: unknown): string {
  return typeof sha === "string" ? sha.slice(0, 7) : "unknown";
}
export function when(iso: unknown): string {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso)) return "an unknown time";
  return iso.slice(0, 10) + " " + iso.slice(11, 16) + " UTC";
}
function plural(n: number, word: string): string {
  return n + " " + word + (n === 1 ? "" : "s");
}

export interface ReviewSummary {
  reviews: GhReview[];
  approvals: GhReview[];
  onHead: GhReview[];
  earlier: GhReview[];
  changes: GhReview[];
}

/**
 * Reviews as GitHub counts them: each person's latest decisive review,
 * ignoring bots and the author. Port of the website's `reviewSummary`.
 * `items` must be in GitHub's order (oldest first).
 */
export function reviewSummary(items: GhReview[], author: string, headSha: unknown): ReviewSummary {
  const reviews = items.filter((r) => r && r.user && typeof r.state === "string");
  const latest = new Map<string, GhReview>();
  for (const r of reviews) {
    if (r.state === "PENDING") continue;
    const key = login(r.user);
    const prev = latest.get(key);
    // A comment does not replace an earlier approval or change request.
    if (r.state === "COMMENTED" && prev && prev.state !== "COMMENTED") continue;
    latest.set(key, r);
  }
  const humans = [...latest.values()].filter((r) => !isBot(r.user) && login(r.user) !== author);
  const approvals = humans.filter((r) => r.state === "APPROVED");
  return {
    reviews,
    approvals,
    onHead: approvals.filter((r) => r.commit_id === headSha),
    earlier: approvals.filter((r) => r.commit_id !== headSha),
    changes: humans.filter((r) => r.state === "CHANGES_REQUESTED"),
  };
}

export interface GhPullListItem {
  number: number;
  title?: unknown;
  user?: GhUser | null;
  merged_at: string;
  updated_at?: unknown;
  merge_commit_sha?: unknown;
  head: { sha?: unknown };
  base: { ref?: unknown; repo?: { default_branch?: unknown } | null };
}

/**
 * Which pull requests to scan. Port of the website's `selectRecentMerges`,
 * with the website's SCAN_MAX_PRS replaced by `max`. The list is ordered by
 * last update, and a pull request is updated when it merges, so while more
 * pages exist (`more`), every merge newer than the oldest update read is in
 * it. Older merges may be missing, so they are left out rather than reported
 * as the latest, and `limited` says fewer than `max` could be confirmed.
 */
export function selectRecentMerges(
  items: unknown,
  more: boolean,
  max: number,
): { branch: string | null; prs: GhPullListItem[]; limited: boolean } {
  const list = Array.isArray(items) ? (items as Array<Record<string, unknown> | null>) : [];
  const prs = list.filter(
    (p): p is Record<string, unknown> =>
      !!p && typeof p.number === "number" && typeof p.merged_at === "string" && !!p.head && !!p.base,
  ) as unknown as GhPullListItem[];
  const full = !!more && list.length > 0;
  const updated = full
    ? list
        .map((p) => p && p.updated_at)
        .filter((u): u is string => typeof u === "string")
        .sort()[0] ?? null
    : null;
  // Merges into the repository's default branch only: that is where releases come from.
  const defaults = prs.filter(
    (p) => !p.base.repo || typeof p.base.repo.default_branch !== "string" || p.base.ref === p.base.repo.default_branch,
  );
  const first = defaults[0];
  const branch =
    first && first.base.repo && typeof first.base.repo.default_branch === "string" ? first.base.repo.default_branch : null;
  const confirmed = defaults
    .filter((p) => !updated || p.merged_at >= updated)
    .sort((a, b) => (a.merged_at < b.merged_at ? 1 : a.merged_at > b.merged_at ? -1 : 0))
    .slice(0, max);
  return { branch, prs: confirmed, limited: full && confirmed.length < max };
}

export type ApprovalStatus = "approved_final" | "approved_earlier" | "no_approval" | "unavailable" | "incomplete";

export const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
  approved_final: "Final revision approved",
  approved_earlier: "Earlier revision only",
  no_approval: "No visible approval",
  unavailable: "Reviews not read",
  incomplete: "Reviews not read in full",
};

export interface MergeApproval {
  status: ApprovalStatus;
  text: string;
  /** Logins who approved the final (head) revision before the merge. */
  approvers_final: string[];
  /** Logins whose only pre-merge approval was on an earlier revision. */
  approvers_earlier: string[];
  /** Latest submitted_at among pre-merge approvals of the final revision. */
  last_final_approval_at: string | null;
  /** Approvals submitted after the merge; never counted. */
  late_approvals: number;
}

/**
 * The website repo scan's per-merge judgement (`analyzeRepoScan`), for a
 * review list that was read in full. Judges the merge by the reviews that
 * existed when it happened: a later approval could not have informed it.
 */
export function classifyMergeApproval(
  reviews: GhReview[],
  pr: { user?: GhUser | null; merged_at: string; head: { sha?: unknown } },
): MergeApproval {
  const author = login(pr.user);
  const after = (x: GhReview) => !!x && typeof x.submitted_at === "string" && x.submitted_at > pr.merged_at;
  const late = reviewSummary(reviews.filter(after), author, pr.head.sha).approvals.length;
  const lateNote = late
    ? " " + plural(late, "approval") + " given after the merge " + (late === 1 ? "is" : "are") + " not counted."
    : "";
  const { onHead, earlier } = reviewSummary(reviews.filter((x) => !after(x)), author, pr.head.sha);
  const finalTimes = onHead
    .map((x) => x.submitted_at)
    .filter((t): t is string => typeof t === "string")
    .sort();
  const base = {
    approvers_final: onHead.map((x) => login(x.user)),
    approvers_earlier: earlier.map((x) => login(x.user)),
    last_final_approval_at: finalTimes.length ? finalTimes[finalTimes.length - 1] : null,
    late_approvals: late,
  };
  if (onHead.length) {
    return {
      ...base,
      status: "approved_final",
      text:
        "Final revision " + short(pr.head.sha) + " approved by " + onHead.map((x) => "@" + login(x.user)).join(", ") +
        " before the merge." + lateNote,
    };
  }
  if (earlier.length) {
    return {
      ...base,
      status: "approved_earlier",
      text:
        "Approved only on an earlier revision. The final revision " + short(pr.head.sha) +
        " had no visible approval when it merged." + lateNote,
    };
  }
  return {
    ...base,
    status: "no_approval",
    text: "No approving review from anyone other than the author was visible when it merged." + lateNote,
  };
}

// ─── report types ───────────────────────────────────────────────────────────

export type UnknownScope =
  | "token"
  | "repository"
  | "pull_requests"
  | "reviews"
  | "merged_by"
  | "deployments"
  | "deployment_statuses"
  | "environments";

export type FailureReason =
  | "no_token"
  | "invalid_repository"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "network"
  | "malformed"
  | "http_error"
  | "no_merge_commit";

export interface ChangeCheckUnknown {
  scope: UnknownScope;
  pr_number?: number;
  deployment_id?: number;
  environment?: string;
  /** HTTP status GitHub answered with; null when no response (or no request) was involved. */
  http_status: number | null;
  reason: FailureReason;
  /** Workflow `permissions:` entry most likely missing, when a permission explains the failure. */
  likely_missing_permission: string | null;
  detail: string;
}

export type DeployReached = "reached" | "not_reached" | "unknown";

export interface DeploymentRow {
  id: number;
  environment: string;
  /** GitHub's own `production_environment` flag on the deployment; null when absent. */
  production_environment: boolean | null;
  created_at: string | null;
  creator: string | null;
  /** Latest deployment status state as GitHub returns it; null when none is recorded or it could not be read. */
  latest_state: string | null;
  latest_state_at: string | null;
  /** "ok" when the status list was read (it may be empty); "unknown" when it could not be. */
  statuses_read: "ok" | "unknown";
  statuses_http_status: number | null;
  /** reached = latest state success or inactive (GitHub marks a successful deployment inactive when a later one replaces it). */
  reached: DeployReached;
  /** Seconds from the last approval on the final revision to this deployment's created_at; null when there was no such approval. */
  approval_to_deploy_seconds: number | null;
  approval_to_deploy_text: string;
  /** Today's protection of this deployment's environment. */
  environment_requires_approval: boolean | null;
}

export interface MergeDeployments {
  status: "recorded" | "none_recorded" | "unknown";
  http_status: number | null;
  detail: string;
  truncated: boolean;
  items: DeploymentRow[];
}

export type ProductionApproval = "required" | "not_required" | "unknown" | null;

export interface MergeRow {
  number: number;
  url: string;
  /** Untrusted text from GitHub, truncated to 200 characters. Escape before rendering. */
  title: string;
  author: string;
  merged_at: string;
  merged_by: string | null;
  /** true / false when GitHub said who merged it; null when that could not be read. */
  merged_by_author: boolean | null;
  head_sha: string | null;
  merge_commit_sha: string | null;
  approval: MergeApproval;
  deployments: MergeDeployments;
  /** Environments a deployment of this merge reached (latest state success/inactive). */
  reached_environments: string[];
  reached_production: boolean;
  /**
   * For a merge that reached production: "required" when every production
   * environment it reached requires reviewers today, "not_required" when at
   * least one does not, "unknown" when that could not be read. null when it
   * did not reach production.
   */
  production_deploy_approval: ProductionApproval;
}

export interface EnvironmentProtection {
  name: string;
  /** configured: found in GitHub's environment list; not_configured: list read in full and it is not there; unknown: not readable. */
  status: "configured" | "not_configured" | "unknown";
  http_status: number | null;
  required_reviewers: { reviewers: string[]; prevent_self_review: boolean | null } | null;
  wait_timer_minutes: number | null;
  /** null = GitHub returned no policy (any branch may deploy). */
  deployment_branch_policy: { protected_branches: boolean | null; custom_branch_policies: boolean | null } | null;
  other_rules: string[];
  requires_approval: boolean | null;
  detail: string;
}

export interface ChangeCheckCounts {
  merges: number;
  approved_final: number;
  approved_earlier: number;
  no_approval: number;
  reviews_unread: number;
  merged_by_author: number;
  merged_by_unknown: number;
  merged_by_author_without_final_approval: number;
  deployments_recorded: number;
  no_deployment_recorded: number;
  deployments_unknown: number;
  /** Merges with a recorded deployment whose status list could not be read. */
  deployment_status_unknown: number;
  reached_any_environment: number;
  reached_production: number;
  production_approval_required: number;
  production_approval_not_required: number;
  production_approval_unknown: number;
  production_without_final_approval: number;
}

export interface RemedyBlock {
  where: string;
  rules: string[];
  caveats: string[];
  rescan?: string;
}

export interface ChangeCheckRemedies {
  merge: RemedyBlock | null;
  deploy: RemedyBlock | null;
}

export interface ChangeCheckReport {
  version: typeof CHANGE_CHECK_REPORT_VERSION;
  repository: string;
  repository_url: string | null;
  default_branch: string | null;
  requested_count: number;
  generated_at: string;
  /** True when fewer merges than requested could be confirmed as the most recent. */
  limited: boolean;
  /** One plain sentence; also the `change-check-summary` output. */
  summary: string;
  merges: MergeRow[];
  counts: ChangeCheckCounts;
  environments: EnvironmentProtection[];
  attention: string[];
  unknowns: ChangeCheckUnknown[];
  remedies: ChangeCheckRemedies;
  cannot_see: string[];
}

// ─── GitHub HTTP ────────────────────────────────────────────────────────────

type GhFailure = { ok: false; status: number | null; reason: FailureReason; message: string };
type GhResult = { ok: true; status: number; body: unknown } | GhFailure;

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function header(res: Response, name: string): string | null {
  try {
    const h = (res as { headers?: { get?: (n: string) => string | null } }).headers;
    return h && typeof h.get === "function" ? h.get(name) : null;
  } catch {
    return null;
  }
}

async function ghGet(url: string, token: string, fetchImpl: typeof fetch): Promise<GhResult> {
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: ghHeaders(token) });
  } catch (err) {
    return { ok: false, status: null, reason: "network", message: err instanceof Error ? err.message : String(err) };
  }
  if (res.ok) {
    try {
      return { ok: true, status: res.status, body: await res.json() };
    } catch (err) {
      return { ok: false, status: res.status, reason: "malformed", message: `response was not JSON: ${String(err)}` };
    }
  }
  const text = await res.text().catch(() => "");
  const message = text.slice(0, 200);
  const remaining = header(res, "x-ratelimit-remaining");
  if (res.status === 429 || (res.status === 403 && (remaining === "0" || header(res, "retry-after") !== null))) {
    return { ok: false, status: res.status, reason: "rate_limited", message };
  }
  if (res.status === 401) return { ok: false, status: 401, reason: "unauthorized", message };
  if (res.status === 403) return { ok: false, status: 403, reason: "forbidden", message };
  if (res.status === 404) return { ok: false, status: 404, reason: "not_found", message };
  return { ok: false, status: res.status, reason: "http_error", message };
}

const PERMISSION_FOR: Record<UnknownScope, string | null> = {
  token: null,
  repository: null,
  pull_requests: "pull-requests: read",
  reviews: "pull-requests: read",
  merged_by: "pull-requests: read",
  deployments: "deployments: read",
  deployment_statuses: "deployments: read",
  environments: "actions: read",
};

function failureHint(reason: FailureReason, permission: string | null, message: string): string {
  switch (reason) {
    case "forbidden":
      return permission
        ? `GitHub refused the token. The workflow's \`permissions:\` block likely lacks \`${permission}\` ` +
            "(or the change-check-token credential lacks the matching repository permission)."
        : "GitHub refused the token.";
    case "not_found":
      return permission
        ? "GitHub answers 404 when the token cannot see this resource. Check that the token can read this " +
            `repository and has \`${permission}\`.`
        : "GitHub answers 404 when the token cannot see this resource.";
    case "unauthorized":
      return "GitHub rejected the token as invalid or expired.";
    case "rate_limited":
      return "GitHub's API rate limit was reached. Run the check again later.";
    case "network":
      return `The request did not complete${message ? `: ${message}` : ""}.`;
    case "malformed":
      return "GitHub's response was not in the expected shape.";
    default:
      return "GitHub returned an unexpected response.";
  }
}

function unknownFrom(
  scope: UnknownScope,
  what: string,
  failure: GhFailure,
  extra: Partial<Pick<ChangeCheckUnknown, "pr_number" | "deployment_id" | "environment">> = {},
): ChangeCheckUnknown {
  const permission =
    failure.reason === "forbidden" || failure.reason === "not_found" ? PERMISSION_FOR[scope] : null;
  const status = failure.status !== null ? `HTTP ${failure.status}` : "no HTTP response";
  return {
    scope,
    ...extra,
    http_status: failure.status,
    reason: failure.reason,
    likely_missing_permission: permission,
    detail: `${what} could not be read (${status}). ${failureHint(failure.reason, PERMISSION_FOR[scope], failure.message)}`,
  };
}

// ─── formatting helpers ─────────────────────────────────────────────────────

export function formatDuration(seconds: number): string {
  const s = Math.abs(Math.round(seconds));
  if (s < 60) return "under a minute";
  const minutes = Math.floor(s / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 48) return remMin ? `${hours} h ${remMin} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH ? `${days} d ${remH} h` : `${days} d`;
}

function isoMillis(iso: unknown): number | null {
  if (typeof iso !== "string") return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function approvalToDeploy(lastApproval: string | null, deployedAt: string | null): { seconds: number | null; text: string } {
  if (!lastApproval) return { seconds: null, text: "No approval on the final revision to measure from." };
  const a = isoMillis(lastApproval);
  const d = isoMillis(deployedAt);
  if (a === null || d === null) return { seconds: null, text: "Deployment time not recorded." };
  const seconds = Math.round((d - a) / 1000);
  return seconds >= 0
    ? { seconds, text: `${formatDuration(seconds)} after the last approval on the final revision` }
    : { seconds, text: `${formatDuration(seconds)} before the last approval on the final revision` };
}

const REACHED_STATES = new Set(["success", "inactive"]);

// ─── environments ───────────────────────────────────────────────────────────

interface EnvListResult {
  ok: boolean;
  /** lowercase name -> raw environment */
  byName: Map<string, Record<string, unknown>>;
  complete: boolean;
  failure?: GhFailure;
}

async function fetchEnvironments(base: string, token: string, fetchImpl: typeof fetch): Promise<EnvListResult> {
  const res = await ghGet(`${base}/environments?per_page=${ENVIRONMENT_PAGE_SIZE}`, token, fetchImpl);
  if (!res.ok) return { ok: false, byName: new Map(), complete: false, failure: res };
  const body = res.body as { total_count?: unknown; environments?: unknown } | null;
  if (!body || !Array.isArray(body.environments)) {
    return {
      ok: false,
      byName: new Map(),
      complete: false,
      failure: { ok: false, status: res.status, reason: "malformed", message: "no environments array" },
    };
  }
  const byName = new Map<string, Record<string, unknown>>();
  for (const e of body.environments as Array<Record<string, unknown> | null>) {
    // GitHub environment names are not case sensitive.
    if (e && typeof e.name === "string") byName.set(e.name.toLowerCase(), e);
  }
  const total = typeof body.total_count === "number" ? body.total_count : body.environments.length;
  return { ok: true, byName, complete: total <= body.environments.length };
}

function reviewerName(entry: unknown): string {
  const e = entry as { type?: unknown; reviewer?: { login?: unknown; slug?: unknown; name?: unknown } } | null;
  const r = e?.reviewer;
  if (!r) return "unknown";
  if (e?.type === "Team") return "team " + String(typeof r.slug === "string" ? r.slug : typeof r.name === "string" ? r.name : "unknown");
  return typeof r.login === "string" ? r.login : "unknown";
}

function describeEnvironment(name: string, envs: EnvListResult): EnvironmentProtection {
  const empty = {
    required_reviewers: null,
    wait_timer_minutes: null,
    deployment_branch_policy: null,
    other_rules: [] as string[],
  };
  if (!envs.ok) {
    const f = envs.failure as GhFailure;
    return {
      name,
      status: "unknown",
      http_status: f.status,
      ...empty,
      requires_approval: null,
      detail: unknownFrom("environments", "Environment settings", f).detail,
    };
  }
  const raw = envs.byName.get(name.toLowerCase());
  if (!raw) {
    if (!envs.complete) {
      return {
        name,
        status: "unknown",
        http_status: null,
        ...empty,
        requires_approval: null,
        detail: `GitHub lists more than ${ENVIRONMENT_PAGE_SIZE} environments and "${name}" was not among those read.`,
      };
    }
    return {
      name,
      status: "not_configured",
      http_status: null,
      ...empty,
      requires_approval: false,
      detail: `GitHub's environment list has no environment named "${name}", so GitHub records no protection rules for it.`,
    };
  }
  const rules = Array.isArray(raw.protection_rules) ? (raw.protection_rules as Array<Record<string, unknown> | null>) : [];
  let required: EnvironmentProtection["required_reviewers"] = null;
  let wait: number | null = null;
  const other: string[] = [];
  for (const r of rules) {
    if (!r || typeof r.type !== "string") continue;
    if (r.type === "required_reviewers") {
      required = {
        reviewers: Array.isArray(r.reviewers) ? (r.reviewers as unknown[]).map(reviewerName) : [],
        prevent_self_review: typeof r.prevent_self_review === "boolean" ? r.prevent_self_review : null,
      };
    } else if (r.type === "wait_timer") {
      wait = typeof r.wait_timer === "number" ? r.wait_timer : null;
    } else if (r.type !== "branch_policy") {
      // branch_policy is reported through deployment_branch_policy below.
      other.push(r.type);
    }
  }
  const dbp = raw.deployment_branch_policy as { protected_branches?: unknown; custom_branch_policies?: unknown } | null | undefined;
  const policy =
    dbp && typeof dbp === "object"
      ? {
          protected_branches: typeof dbp.protected_branches === "boolean" ? dbp.protected_branches : null,
          custom_branch_policies: typeof dbp.custom_branch_policies === "boolean" ? dbp.custom_branch_policies : null,
        }
      : null;
  return {
    name,
    status: "configured",
    http_status: null,
    required_reviewers: required,
    wait_timer_minutes: wait,
    deployment_branch_policy: policy,
    other_rules: other,
    requires_approval: required !== null,
    detail: required
      ? `Requires approval from ${required.reviewers.join(", ") || "configured reviewers"} before a job that names it can deploy (as configured now).`
      : "No required reviewers are configured (as configured now).",
  };
}

// ─── per-merge reads ────────────────────────────────────────────────────────

interface ReadContext {
  base: string;
  token: string;
  fetchImpl: typeof fetch;
  unknowns: ChangeCheckUnknown[];
}

/** A 200 whose body is not the expected shape is a failure too, never an empty result. */
function asFailure(res: GhResult): GhFailure {
  return res.ok ? { ok: false, status: res.status, reason: "malformed", message: "unexpected response shape" } : res;
}

/** 2a. Reviews, paginated, then judged the website's way. */
async function readApproval(ctx: ReadContext, p: GhPullListItem): Promise<MergeApproval> {
  const reviews: GhReview[] = [];
  let full = false;
  const none = { approvers_final: [], approvers_earlier: [], last_final_approval_at: null, late_approvals: 0 };
  for (let page = 1; page <= REVIEW_MAX_PAGES; page++) {
    const res = await ghGet(
      `${ctx.base}/pulls/${p.number}/reviews?per_page=${REVIEW_PAGE_SIZE}&page=${page}`,
      ctx.token,
      ctx.fetchImpl,
    );
    if (!res.ok || !Array.isArray(res.body)) {
      const u = unknownFrom("reviews", `Reviews on #${p.number}`, asFailure(res), { pr_number: p.number });
      ctx.unknowns.push(u);
      return { ...none, status: "unavailable", text: u.detail };
    }
    reviews.push(...(res.body as GhReview[]));
    full = res.body.length >= REVIEW_PAGE_SIZE;
    if (!full) break;
  }
  if (full) {
    // The last page read was full, so later reviews may exist (GitHub lists
    // oldest first): a later approval, dismissal or change request could
    // change the result, so nothing is concluded.
    return {
      ...none,
      status: "incomplete",
      text: `More than ${REVIEW_PAGE_SIZE * REVIEW_MAX_PAGES} reviews; later ones were not read, so no conclusion is drawn.`,
    };
  }
  return classifyMergeApproval(reviews, p);
}

/** 2b. Who merged it. The list endpoint does not return merged_by. null = unknown. */
async function readMergedBy(ctx: ReadContext, number: number): Promise<string | null> {
  const res = await ghGet(`${ctx.base}/pulls/${number}`, ctx.token, ctx.fetchImpl);
  const mb = res.ok && res.body && typeof res.body === "object" ? (res.body as { merged_by?: GhUser | null }).merged_by : undefined;
  if (mb && typeof mb.login === "string") return mb.login;
  const failure = res.ok ? { ...asFailure(res), message: "no merged_by" } : res;
  ctx.unknowns.push(unknownFrom("merged_by", `Who merged #${number}`, failure, { pr_number: number }));
  return null;
}

/** The latest status of one deployment. statuses_url is this same endpoint, rebuilt from the numeric id so the token never leaves apiBase. */
async function readLatestStatus(
  ctx: ReadContext,
  number: number,
  deploymentId: number,
): Promise<{ read: true; state: string | null; at: string | null; http: number } | { read: false; http: number | null }> {
  const res = await ghGet(
    `${ctx.base}/deployments/${deploymentId}/statuses?per_page=${STATUS_PAGE_SIZE}`,
    ctx.token,
    ctx.fetchImpl,
  );
  if (!res.ok || !Array.isArray(res.body)) {
    const failure = asFailure(res);
    ctx.unknowns.push(
      unknownFrom("deployment_statuses", `The status of deployment ${deploymentId} (#${number})`, failure, {
        pr_number: number,
        deployment_id: deploymentId,
      }),
    );
    return { read: false, http: failure.status };
  }
  // Newest by created_at, then id: does not rely on the list's order.
  const statuses = (res.body as Array<Record<string, unknown> | null>)
    .filter((s): s is Record<string, unknown> => !!s && typeof s.state === "string")
    .sort((a, b) => {
      const ta = String(a.created_at ?? "");
      const tb = String(b.created_at ?? "");
      if (ta !== tb) return ta < tb ? 1 : -1;
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });
  const latest = statuses[0];
  return {
    read: true,
    state: latest ? String(latest.state) : null,
    at: latest && typeof latest.created_at === "string" ? latest.created_at : null,
    http: res.status,
  };
}

/** 3. GitHub deployments of the exact merge commit. A failed read is unknown, never "no deployments". */
async function readDeployments(
  ctx: ReadContext,
  number: number,
  mergeSha: string | null,
  approval: MergeApproval,
): Promise<MergeDeployments> {
  if (!mergeSha) {
    const u: ChangeCheckUnknown = {
      scope: "deployments",
      pr_number: number,
      http_status: null,
      reason: "no_merge_commit",
      likely_missing_permission: null,
      detail: `GitHub gave no merge commit for #${number}, so its deployments could not be looked up.`,
    };
    ctx.unknowns.push(u);
    return { status: "unknown", http_status: null, detail: u.detail, truncated: false, items: [] };
  }
  const res = await ghGet(`${ctx.base}/deployments?sha=${mergeSha}&per_page=${DEPLOYMENT_PAGE_SIZE}`, ctx.token, ctx.fetchImpl);
  if (!res.ok || !Array.isArray(res.body)) {
    const failure = asFailure(res);
    const u = unknownFrom("deployments", `Deployments of #${number} (${short(mergeSha)})`, failure, { pr_number: number });
    ctx.unknowns.push(u);
    return { status: "unknown", http_status: failure.status, detail: u.detail, truncated: false, items: [] };
  }
  if (res.body.length === 0) {
    return {
      status: "none_recorded",
      http_status: res.status,
      detail:
        `GitHub records no deployment of merge commit ${short(mergeSha)}. Teams that deploy with another tool ` +
        "will not show deployments here.",
      truncated: false,
      items: [],
    };
  }
  const rows: DeploymentRow[] = [];
  for (const d of res.body as Array<Record<string, unknown> | null>) {
    if (!d || typeof d.id !== "number") continue;
    const createdAt = typeof d.created_at === "string" ? d.created_at : null;
    const status = await readLatestStatus(ctx, number, d.id);
    const timing = approvalToDeploy(approval.last_final_approval_at, createdAt);
    const creator = d.creator as GhUser | null | undefined;
    rows.push({
      id: d.id,
      environment: typeof d.environment === "string" && d.environment ? d.environment : "unnamed",
      production_environment: typeof d.production_environment === "boolean" ? d.production_environment : null,
      created_at: createdAt,
      creator: creator && typeof creator.login === "string" ? creator.login : null,
      latest_state: status.read ? status.state : null,
      latest_state_at: status.read ? status.at : null,
      statuses_read: status.read ? "ok" : "unknown",
      statuses_http_status: status.http,
      reached: !status.read ? "unknown" : status.state && REACHED_STATES.has(status.state) ? "reached" : "not_reached",
      approval_to_deploy_seconds: timing.seconds,
      approval_to_deploy_text: timing.text,
      environment_requires_approval: null,
    });
  }
  return {
    status: "recorded",
    http_status: res.status,
    detail: `${plural(rows.length, "deployment")} of merge commit ${short(mergeSha)} recorded on GitHub.`,
    truncated: res.body.length >= DEPLOYMENT_PAGE_SIZE,
    items: rows,
  };
}

// ─── main ───────────────────────────────────────────────────────────────────

export interface ChangeCheckOptions {
  /** "owner/repo" — normally GITHUB_REPOSITORY. */
  repository?: string;
  /** GITHUB_TOKEN or the optional `change-check-token`. Sent only to apiBase. */
  token?: string;
  /** GITHUB_API_URL. Defaults to https://api.github.com. */
  apiBase?: string;
  /** GITHUB_SERVER_URL, used only to build links. Defaults to https://github.com. */
  serverUrl?: string;
  /** How many recent merges to read (already validated by parseChangeCheckCount). */
  count?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  log?: (message: string) => void;
}

const CANNOT_SEE: string[] = [
  "Who can bypass the branch rules or merge without them. Bypass lists and admin rights are not readable with this token.",
  "Approvals given outside GitHub, such as a change ticket, a meeting or a chat message.",
  "Deploys made by tools that do not create GitHub deployments (a script, a CD system or a cloud console). They do not appear here.",
  "A deployment of a later commit can include a merge. This check matches deployments of the exact merge commit only.",
  "Environment settings at the time of each deploy. Only today's settings can be read.",
  "Environment rules hold only GitHub Actions jobs that name the environment. A deployment created through the API by another tool is not held by them.",
  "What actually changed in production after a deploy.",
];

export async function runChangeCheck(opts: ChangeCheckOptions): Promise<ChangeCheckReport> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const log = opts.log ?? (() => {});
  const now = opts.now ?? (() => new Date());
  const apiBase = (opts.apiBase || "https://api.github.com").replace(/\/+$/, "");
  const serverUrl = (opts.serverUrl || "https://github.com").replace(/\/+$/, "");
  const count = opts.count ?? CHANGE_CHECK_DEFAULT_COUNT;
  const repository = (opts.repository ?? "").trim();
  const token = (opts.token ?? "").trim();
  const unknowns: ChangeCheckUnknown[] = [];

  const [owner, repo, ...rest] = repository.split("/");
  const validRepo = !!owner && !!repo && rest.length === 0 && OWNER.test(owner) && REPO.test(repo) && repo !== "." && repo !== "..";

  const finish = (args: {
    branch: string | null;
    limited: boolean;
    merges: MergeRow[];
    environments: EnvironmentProtection[];
  }): ChangeCheckReport =>
    buildReport({
      repository,
      repositoryUrl: validRepo ? `${serverUrl}/${owner}/${repo}` : null,
      requestedCount: count,
      generatedAt: now().toISOString(),
      unknowns,
      ...args,
    });

  if (!validRepo) {
    unknowns.push({
      scope: "repository",
      http_status: null,
      reason: "invalid_repository",
      likely_missing_permission: null,
      detail: `GITHUB_REPOSITORY is ${repository ? `"${repository.slice(0, 120)}", not an owner/repo name` : "not set"}, so there was no repository to read.`,
    });
    return finish({ branch: null, limited: false, merges: [], environments: [] });
  }
  if (!token) {
    unknowns.push({
      scope: "token",
      http_status: null,
      reason: "no_token",
      likely_missing_permission: null,
      detail:
        "No GitHub token was supplied to this step, so nothing could be read. Pass " +
        "`env: GITHUB_TOKEN: ${{ github.token }}` (or the `change-check-token` input).",
    });
    return finish({ branch: null, limited: false, merges: [], environments: [] });
  }

  const base = `${apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  // 1. The last N merges into the default branch, selected as the website selects them.
  const items: unknown[] = [];
  let selected: ReturnType<typeof selectRecentMerges> | null = null;
  for (let page = 1; page <= SCAN_LIST_PAGES; page++) {
    const res = await ghGet(
      `${base}/pulls?state=closed&sort=updated&direction=desc&per_page=${SCAN_LIST_SIZE}&page=${page}`,
      token,
      fetchImpl,
    );
    if (!res.ok || !Array.isArray(res.body)) {
      unknowns.push(unknownFrom("pull_requests", "The list of merged pull requests", asFailure(res)));
      // A partial list cannot say which merges are the latest, so nothing is judged.
      return finish({ branch: null, limited: false, merges: [], environments: [] });
    }
    items.push(...res.body);
    selected = selectRecentMerges(items, res.body.length >= SCAN_LIST_SIZE, count);
    if (!selected.limited) break;
  }
  const { branch, prs, limited } = selected ?? { branch: null, prs: [], limited: false };
  log(`AtlaSent Change Check: ${prs.length} recent merge(s)${branch ? ` into ${branch}` : ""} selected.`);

  const ctx: ReadContext = { base, token, fetchImpl, unknowns };
  const merges: MergeRow[] = [];
  for (const p of prs) {
    const author = login(p.user);
    const mergeSha =
      typeof p.merge_commit_sha === "string" && /^[0-9a-f]{40}$/i.test(p.merge_commit_sha) ? p.merge_commit_sha : null;
    const approval = await readApproval(ctx, p);
    const mergedBy = await readMergedBy(ctx, p.number);
    const deployments = await readDeployments(ctx, p.number, mergeSha, approval);
    merges.push({
      number: p.number,
      url: `${serverUrl}/${owner}/${repo}/pull/${p.number}`,
      title: typeof p.title === "string" ? p.title.slice(0, 200) : "",
      author,
      merged_at: p.merged_at,
      merged_by: mergedBy,
      merged_by_author: mergedBy === null ? null : mergedBy === author,
      head_sha: typeof p.head.sha === "string" ? p.head.sha : null,
      merge_commit_sha: mergeSha,
      approval,
      deployments,
      reached_environments: [],
      reached_production: false,
      production_deploy_approval: null,
    });
  }

  // 4. Protection rules of every environment that received a deployment.
  const envNames = new Map<string, string>();
  for (const m of merges) {
    for (const d of m.deployments.items) {
      const key = d.environment.toLowerCase();
      if (!envNames.has(key)) envNames.set(key, d.environment);
    }
  }
  const environments: EnvironmentProtection[] = [];
  if (envNames.size > 0) {
    const envs = await fetchEnvironments(base, token, fetchImpl);
    if (!envs.ok && envs.failure) unknowns.push(unknownFrom("environments", "Environment settings", envs.failure));
    for (const name of envNames.values()) environments.push(describeEnvironment(name, envs));
  }
  const envByName = new Map(environments.map((e) => [e.name.toLowerCase(), e]));
  for (const m of merges) {
    for (const d of m.deployments.items) {
      d.environment_requires_approval = envByName.get(d.environment.toLowerCase())?.requires_approval ?? null;
    }
    const reached = m.deployments.items.filter((d) => d.reached === "reached");
    m.reached_environments = [...new Set(reached.map((d) => d.environment))];
    const prod = reached.filter((d) => d.production_environment === true);
    m.reached_production = prod.length > 0;
    if (m.reached_production) {
      m.production_deploy_approval = prod.some((d) => d.environment_requires_approval === false)
        ? "not_required"
        : prod.some((d) => d.environment_requires_approval === null)
          ? "unknown"
          : "required";
    }
  }

  return finish({ branch, limited, merges, environments });
}

// ─── report assembly ────────────────────────────────────────────────────────

function countMerges(merges: MergeRow[]): ChangeCheckCounts {
  const c = (pred: (m: MergeRow) => boolean) => merges.filter(pred).length;
  const noFinal = (m: MergeRow) => m.approval.status === "no_approval" || m.approval.status === "approved_earlier";
  return {
    merges: merges.length,
    approved_final: c((m) => m.approval.status === "approved_final"),
    approved_earlier: c((m) => m.approval.status === "approved_earlier"),
    no_approval: c((m) => m.approval.status === "no_approval"),
    reviews_unread: c((m) => m.approval.status === "unavailable" || m.approval.status === "incomplete"),
    merged_by_author: c((m) => m.merged_by_author === true),
    merged_by_unknown: c((m) => m.merged_by_author === null),
    merged_by_author_without_final_approval: c((m) => m.merged_by_author === true && noFinal(m)),
    deployments_recorded: c((m) => m.deployments.status === "recorded"),
    no_deployment_recorded: c((m) => m.deployments.status === "none_recorded"),
    deployments_unknown: c((m) => m.deployments.status === "unknown"),
    deployment_status_unknown: c((m) => m.deployments.items.some((d) => d.reached === "unknown")),
    reached_any_environment: c((m) => m.reached_environments.length > 0),
    reached_production: c((m) => m.reached_production),
    production_approval_required: c((m) => m.production_deploy_approval === "required"),
    production_approval_not_required: c((m) => m.production_deploy_approval === "not_required"),
    production_approval_unknown: c((m) => m.production_deploy_approval === "unknown"),
    production_without_final_approval: c((m) => m.reached_production && noFinal(m)),
  };
}

const REASON_PHRASE: Record<FailureReason, string> = {
  no_token: "no GitHub token was supplied",
  invalid_repository: "GITHUB_REPOSITORY is not an owner/repo name",
  unauthorized: "token rejected",
  forbidden: "refused",
  not_found: "not found",
  rate_limited: "rate limited",
  network: "network error",
  malformed: "unexpected response",
  http_error: "unexpected response",
  no_merge_commit: "no merge commit",
};

function statusPhrase(u: ChangeCheckUnknown): string {
  return u.http_status !== null ? `HTTP ${u.http_status}` : REASON_PHRASE[u.reason];
}

function distinctStatuses(us: ChangeCheckUnknown[]): string {
  return [...new Set(us.map(statusPhrase))].join(", ");
}

function summarySentence(r: {
  counts: ChangeCheckCounts;
  branch: string | null;
  unknowns: ChangeCheckUnknown[];
  merges: MergeRow[];
}): string {
  const { counts: c, branch } = r;
  const n = c.merges;
  const into = branch ? ` into ${branch}` : "";
  if (n === 0) {
    const listUnknown = r.unknowns.find((u) => u.scope === "pull_requests" || u.scope === "token" || u.scope === "repository");
    if (listUnknown) return `Change Check could not read this repository's merged pull requests (${distinctStatuses([listUnknown])}), so nothing was judged.`;
    return `GitHub shows no pull requests merged${into} in the recently closed pull requests read.`;
  }

  // Approval part (website repoVerdict semantics).
  const gaps = c.no_approval + c.approved_earlier;
  let approval: string;
  if (gaps)
    approval =
      `${gaps} of the last ${plural(n, "merge")}${into} had no approval on the code that merged` +
      (c.reviews_unread ? ` (${c.reviews_unread} could not be read)` : "");
  else if (c.reviews_unread === n) approval = `the reviews on the last ${plural(n, "merge")}${into} could not be read`;
  else if (c.reviews_unread)
    approval = `none of the last ${plural(n, "merge")}${into} that could be read went in without an approval on the code that merged (${c.reviews_unread} could not be read)`;
  else approval = `all ${plural(n, "recent merge")}${into} had an approval on the code that merged`;
  approval = approval.charAt(0).toUpperCase() + approval.slice(1);

  // Deploy part.
  let deploy: string;
  const depUnknown = r.unknowns.filter((u) => u.scope === "deployments");
  if (c.deployments_unknown === n) {
    deploy = `whether they were deployed could not be read (${distinctStatuses(depUnknown)})`;
  } else if (c.reached_production > 0) {
    const p = c.reached_production;
    deploy = `${p} ${p === 1 ? "was" : "were"} deployed to production`;
    if (c.production_approval_not_required === p) deploy += ", none through an environment that requires an approval to deploy";
    else if (c.production_approval_required === p) deploy += ", all through an environment that requires an approval to deploy";
    else if (c.production_approval_unknown === p) deploy += ", and whether that needed an approval could not be read";
    else {
      deploy += `, ${c.production_approval_required} through an environment that requires an approval to deploy`;
      if (c.production_approval_unknown) deploy += ` (${c.production_approval_unknown} could not be checked)`;
    }
  } else if (c.reached_any_environment > 0) {
    const envs = [...new Set(r.merges.flatMap((m) => m.reached_environments))];
    deploy =
      `none was deployed to an environment GitHub marks as production (${c.reached_any_environment} reached ` +
      `${envs.slice(0, 5).join(", ")}${envs.length > 5 ? ", …" : ""})`;
  } else if (c.deployment_status_unknown > 0) {
    deploy =
      `GitHub records deployments of ${c.deployment_status_unknown} of them, but whether they succeeded could not be read ` +
      `(${distinctStatuses(r.unknowns.filter((u) => u.scope === "deployment_statuses"))})`;
  } else if (c.deployments_recorded > 0) {
    deploy = `GitHub records deployments of ${c.deployments_recorded} of them, none with a successful status`;
  } else {
    deploy = "GitHub records no deployment of any of them";
  }
  if (c.deployments_unknown > 0 && c.deployments_unknown < n) deploy += `; deployments of ${c.deployments_unknown} could not be read`;
  if (c.deployment_status_unknown > 0 && c.reached_any_environment > 0)
    deploy += `; whether deployments of ${c.deployment_status_unknown} succeeded could not be read`;
  return `${approval}; ${deploy}.`;
}

function groupUnknownAttention(unknowns: ChangeCheckUnknown[]): string[] {
  const groups = new Map<string, ChangeCheckUnknown[]>();
  for (const u of unknowns) {
    const key = `${u.scope}|${u.http_status}|${u.reason}`;
    groups.set(key, [...(groups.get(key) ?? []), u]);
  }
  const what: Record<UnknownScope, string> = {
    token: "Nothing",
    repository: "Nothing",
    pull_requests: "The list of merged pull requests",
    reviews: "Reviews",
    merged_by: "Who merged",
    deployments: "Deployments",
    deployment_statuses: "Deployment statuses",
    environments: "Environment settings",
  };
  const out: string[] = [];
  for (const us of groups.values()) {
    const u = us[0];
    if (us.length === 1 || u.scope === "token" || u.scope === "repository" || u.scope === "pull_requests" || u.scope === "environments") {
      out.push(u.detail);
      continue;
    }
    const prs = [...new Set(us.map((x) => x.pr_number).filter((x): x is number => typeof x === "number"))];
    const status = statusPhrase(u);
    const scope = u.scope === "deployment_statuses" ? `${plural(us.length, "deployment")}` : plural(prs.length, "merge");
    const hint = failureHint(u.reason, PERMISSION_FOR[u.scope], "");
    out.push(`${what[u.scope]} could not be read for ${scope} (${status}). ${u.reason === "no_merge_commit" ? "GitHub gave no merge commit to look up." : hint}`);
  }
  return out;
}

/**
 * Environments that a merge's deployment reached, that GitHub marks as
 * production on that deployment, and that require no reviewers today.
 */
function unprotectedProductionEnvironments(merges: MergeRow[], environments: EnvironmentProtection[]): EnvironmentProtection[] {
  return environments.filter(
    (e) =>
      e.requires_approval === false &&
      merges.some((m) =>
        m.deployments.items.some(
          (d) => d.reached === "reached" && d.production_environment === true && d.environment.toLowerCase() === e.name.toLowerCase(),
        ),
      ),
  );
}

function buildAttention(r: {
  counts: ChangeCheckCounts;
  branch: string | null;
  limited: boolean;
  merges: MergeRow[];
  environments: EnvironmentProtection[];
  unknowns: ChangeCheckUnknown[];
}): string[] {
  const { counts: c } = r;
  const n = c.merges;
  const into = r.branch ? ` into ${r.branch}` : "";
  const a: string[] = [];
  // Website repo-scan wording first, so the two read the same.
  if (c.no_approval) a.push(`${c.no_approval} of the last ${plural(n, "merge")}${into} had no approving review visible on GitHub.`);
  if (c.approved_earlier)
    a.push(
      `${c.approved_earlier} ${c.approved_earlier === 1 ? "was" : "were"} approved only on an earlier revision, so the code that merged had no visible approval.`,
    );
  if (c.merged_by_author_without_final_approval)
    a.push(
      `${c.merged_by_author_without_final_approval} ${c.merged_by_author_without_final_approval === 1 ? "was" : "were"} merged by ${c.merged_by_author_without_final_approval === 1 ? "its" : "their"} own author with no approval on the code that merged.`,
    );
  if (c.production_without_final_approval)
    a.push(
      `${plural(c.production_without_final_approval, "merge")} with no approval on the code that merged ${c.production_without_final_approval === 1 ? "was" : "were"} deployed to production.`,
    );
  const unprotected = unprotectedProductionEnvironments(r.merges, r.environments);
  if (unprotected.length)
    a.push(
      `Production ${unprotected.length === 1 ? "environment" : "environments"} ${unprotected.map((e) => `"${e.name}"`).join(", ")} ` +
        `${unprotected.length === 1 ? "does" : "do"} not require an approval to deploy (as configured now); ` +
        `${plural(c.production_approval_not_required, "merge")} reached ${unprotected.length === 1 ? "it" : "them"}.`,
    );
  if (r.limited)
    a.push(
      `Only ${plural(n, "merge")} could be confirmed as the most recent from the ${SCAN_LIST_SIZE * SCAN_LIST_PAGES} most recently updated closed pull requests. Older merges were not read.`,
    );
  if (c.reviews_unread)
    a.push(
      `For ${plural(c.reviews_unread, "pull request")} the reviews could not be read in full, so no conclusion is drawn about ${c.reviews_unread === 1 ? "it" : "them"}.`,
    );
  a.push(...groupUnknownAttention(r.unknowns));
  return a;
}

function buildRemedies(r: {
  repository: string;
  counts: ChangeCheckCounts;
  branch: string | null;
  merges: MergeRow[];
  environments: EnvironmentProtection[];
}): ChangeCheckRemedies {
  const branch = r.branch || "the default branch";
  // Port of the website's repoRemedies.
  let merge: RemedyBlock | null = null;
  const { no_approval: none, approved_earlier: earlier } = r.counts;
  if (none || earlier) {
    const rules: string[] = [];
    if (none) rules.push("Require a pull request before merging, with Required approvals set to at least 1. GitHub never counts the author's own approval.");
    rules.push("Dismiss stale pull request approvals when new commits are pushed, so an approval covers only the revision it was given on.");
    rules.push("Require approval of the most recent reviewable push, so the last person to push cannot be the only approver of their own change.");
    rules.push("Keep the bypass list empty (in a ruleset), or turn on Do not allow bypassing the above settings (in classic branch protection). Otherwise admins can still merge without an approval.");
    merge = {
      where:
        `In ${r.repository}: Settings → Rules → Rulesets → New branch ruleset targeting ${branch}, with Enforcement status set to Active ` +
        "(a new ruleset starts as Disabled and enforces nothing). Or use Settings → Branches → Add branch protection rule.",
      rules,
      caveats: [
        "If only one person can approve changes, a required approval will block every merge. Decide who the second reviewer is before turning it on.",
        "These settings make GitHub ask for an approval before merging. They do not record who authorized a deploy, and they do not cover changes that reach production without a pull request.",
      ],
      rescan: 'After changing them, run this check again: merges made after the change should show "Final revision approved".',
    };
  }

  // Production environments that a merge reached and that require no reviewers today.
  let deploy: RemedyBlock | null = null;
  const unprotected = unprotectedProductionEnvironments(r.merges, r.environments);
  if (unprotected.length) {
    const rules = [
      "Add Required reviewers, and turn on Prevent self-review so the person who started the deploy cannot approve it.",
    ];
    if (unprotected.some((e) => e.deployment_branch_policy === null))
      rules.push(`Under Deployment branches and tags, choose Protected branches only or Selected branches and tags, so only code from ${branch} can deploy.`);
    rules.push("Name the environment in the deploy job (for example `environment: production`), so the job waits for those reviewers.");
    deploy = {
      where: `In ${r.repository}: Settings → Environments → ${unprotected.map((e) => e.name).join(", ")}.`,
      rules,
      caveats: [
        "On GitHub Free, Pro and Team plans, required reviewers on environments are available only for public repositories, so a private repository needs GitHub Enterprise for them.",
        "Environment rules hold GitHub Actions jobs that name the environment. A deployment created through the API by another tool is not held by them.",
        "Required reviewers record who approved a deploy job on GitHub. They do not check that what was approved is what reached production.",
      ],
    };
  }
  return { merge, deploy };
}

function buildReport(args: {
  repository: string;
  repositoryUrl: string | null;
  requestedCount: number;
  generatedAt: string;
  unknowns: ChangeCheckUnknown[];
  branch: string | null;
  limited: boolean;
  merges: MergeRow[];
  environments: EnvironmentProtection[];
}): ChangeCheckReport {
  const counts = countMerges(args.merges);
  const ctx = { ...args, counts };
  return {
    version: CHANGE_CHECK_REPORT_VERSION,
    repository: args.repository,
    repository_url: args.repositoryUrl,
    default_branch: args.branch,
    requested_count: args.requestedCount,
    generated_at: args.generatedAt,
    limited: args.limited,
    summary: summarySentence(ctx),
    merges: args.merges,
    counts,
    environments: args.environments,
    attention: buildAttention(ctx),
    unknowns: args.unknowns,
    remedies: buildRemedies(ctx),
    cannot_see: CANNOT_SEE,
  };
}

// ─── step summary ───────────────────────────────────────────────────────────

/**
 * Escape untrusted GitHub text (titles, logins, environment names) for a
 * Markdown table cell: one line, HTML neutralised, Markdown punctuation
 * backslash-escaped (including the `|` that would split a cell).
 */
export function escapeMarkdownText(text: unknown, max = 200): string {
  let s = String(text ?? "")
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > max) s = s.slice(0, max - 1) + "…";
  s = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return s.replace(/[\\`*_{}[\]()#+\-!|~@:.]/g, (ch) => "\\" + ch);
}

function deployedToCell(m: MergeRow): string {
  if (m.deployments.status === "unknown") {
    return m.deployments.http_status !== null ? `Unknown (HTTP ${m.deployments.http_status})` : "Unknown";
  }
  if (m.deployments.status === "none_recorded") return "No GitHub deployment of this commit";
  const parts = m.deployments.items.map((d) => {
    // Mark GitHub's production flag unless the name already says it.
    const marker = d.production_environment && d.environment.toLowerCase() !== "production" ? " (production)" : "";
    const env = escapeMarkdownText(d.environment, 60) + marker;
    if (d.statuses_read === "unknown") return `${env}: status unknown${d.statuses_http_status !== null ? ` (HTTP ${d.statuses_http_status})` : ""}`;
    if (!d.latest_state) return `${env}: no status recorded`;
    const state = escapeMarkdownText(d.latest_state, 20);
    if (d.reached !== "reached") return `${env}: ${state}`;
    const timing = d.approval_to_deploy_seconds !== null ? `, ${escapeMarkdownText(d.approval_to_deploy_text, 120)}` : "";
    return `${env}: ${state}, ${escapeMarkdownText(when(d.created_at), 30)}${timing}`;
  });
  return parts.join("<br>") + (m.deployments.truncated ? "<br>(more deployments may exist)" : "");
}

function deployApprovalCell(m: MergeRow): string {
  const reached = m.deployments.items.filter((d) => d.reached === "reached");
  if (m.deployments.status === "unknown") return "Unknown";
  if (!reached.length) return "—";
  const byEnv = new Map<string, boolean | null>();
  for (const d of reached) byEnv.set(d.environment, d.environment_requires_approval);
  return [...byEnv.entries()]
    .map(([env, req]) => `${req === true ? "Yes" : req === false ? "No" : "Unknown"} (${escapeMarkdownText(env, 60)})`)
    .join("<br>");
}

function approvalCell(m: MergeRow): string {
  let s = APPROVAL_LABELS[m.approval.status];
  if (m.merged_by_author === true) s += `; merged by its own author (@${escapeMarkdownText(m.author, 60)})`;
  else if (m.merged_by_author === null) s += "; who merged it is unknown";
  return s;
}

function environmentRow(e: EnvironmentProtection): string {
  const name = escapeMarkdownText(e.name, 60);
  if (e.status === "unknown") return `| ${name} | Unknown${e.http_status !== null ? ` (HTTP ${e.http_status})` : ""} | Unknown | Unknown |`;
  if (e.status === "not_configured") return `| ${name} | None (not in GitHub's environment list) | None | Any branch |`;
  const reviewers = e.required_reviewers
    ? escapeMarkdownText(e.required_reviewers.reviewers.join(", ") || "configured", 200) +
      (e.required_reviewers.prevent_self_review === true ? " (self-review blocked)" : e.required_reviewers.prevent_self_review === false ? " (self-review allowed)" : "")
    : "None";
  const wait = e.wait_timer_minutes ? `${e.wait_timer_minutes} min` : "None";
  const policy = e.deployment_branch_policy
    ? e.deployment_branch_policy.protected_branches
      ? "Protected branches only"
      : e.deployment_branch_policy.custom_branch_policies
        ? "Selected branches and tags"
        : "Restricted (details not returned)"
    : "Any branch";
  const other = e.other_rules.length ? ` Other rules: ${escapeMarkdownText(e.other_rules.join(", "), 120)}.` : "";
  return `| ${name} | ${reviewers} | ${wait} | ${policy}${other} |`;
}

function remedyLines(title: string, r: RemedyBlock | null): string[] {
  if (!r) return [];
  return [
    `**${title}**`,
    "",
    escapeMarkdownProse(r.where),
    "",
    ...r.rules.map((x) => `- ${x}`),
    ...r.caveats.map((x) => `- Note: ${x}`),
    ...(r.rescan ? ["", r.rescan] : []),
    "",
  ];
}

// Prose lines (summary, attention, remedies) mix our own wording with names
// from GitHub (branch, environment, repository). Everything is escaped: HTML
// is neutralised and link, emphasis, code and table characters are
// backslash-escaped, so a crafted name can only ever render as text.
export function escapeMarkdownProse(text: string): string {
  return text
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\\*_`|[\]!]/g, (ch) => "\\" + ch);
}

export function renderChangeCheckStepSummary(report: ChangeCheckReport): string {
  const lines: string[] = [];
  const into = report.default_branch ? ` into ${escapeMarkdownText(report.default_branch, 100)}` : "";
  lines.push(`## AtlaSent Change Check: recent merges${into} in ${escapeMarkdownText(report.repository, 140)}`);
  lines.push("");
  lines.push(`**${escapeMarkdownProse(report.summary)}**`);
  lines.push("");
  lines.push(
    "> Advisory only. Read from GitHub with this workflow's own token; nothing was sent to AtlaSent. " +
      "Anything GitHub would not show is listed as unknown, never as a clean result. This step never fails on findings.",
  );
  lines.push("");
  lines.push("### Needs attention");
  lines.push("");
  if (report.attention.length) for (const a of report.attention) lines.push(`- ${escapeMarkdownProse(a)}`);
  else lines.push("- Nothing in what GitHub records. That is not proof the changes were authorized or safe.");
  lines.push("");

  if (report.merges.length) {
    lines.push("### Merges (newest first)");
    lines.push("");
    lines.push("| PR | Title | Approval on the code that merged | Deployed to | Deploy needed approval? |");
    lines.push("|---|---|---|---|---|");
    for (const m of report.merges) {
      lines.push(
        `| [#${m.number}](${m.url}) | ${escapeMarkdownText(m.title) || "(no title)"} | ${approvalCell(m)} | ${deployedToCell(m)} | ${deployApprovalCell(m)} |`,
      );
    }
    lines.push("");
    lines.push(
      '"Deploy needed approval?" reads each environment\'s required reviewers as configured now, not when the deploy ran. ' +
        "A deployment counts as reached when its latest status is success, or inactive (GitHub marks a successful deployment inactive when a later one replaces it).",
    );
    lines.push("");
  }

  if (report.environments.length) {
    lines.push("### Environments that received a deployment (as configured now)");
    lines.push("");
    lines.push("| Environment | Required reviewers | Wait timer | Deployment branches |");
    lines.push("|---|---|---|---|");
    for (const e of report.environments) lines.push(environmentRow(e));
    lines.push("");
  }

  if (report.remedies.merge || report.remedies.deploy) {
    lines.push("### GitHub settings that would close these gaps");
    lines.push("");
    lines.push(...remedyLines("Merges", report.remedies.merge));
    lines.push(...remedyLines("Deploys", report.remedies.deploy));
  }

  lines.push("### What this can't see");
  lines.push("");
  for (const c of report.cannot_see) lines.push(`- ${c}`);
  lines.push("");
  lines.push(`AtlaSent checks the exact change at deploy time: ${PRODUCTION_CHANGE_AUDIT_URL}`);
  return lines.join("\n") + "\n";
}
