// AtlaSent Change Brief mode — gathers GitHub change-plan facts already
// available in this CI run (base/head SHA, changed files, CI check
// conclusions, deployment workflow identity) and POSTs them to
// `v1-change-brief` as `github_change_plan`, per the seam
// atlasent-api's `_shared/change-brief/github-change-brief.ts` adapter
// accepts.
//
// This module does NOT classify or interpret the change itself — that
// logic lives exactly once, in atlasent-api's github-classification.ts, so
// the two repos can't drift into disagreeing about what counts as a
// migration or a workflow change. This module's job is narrower: gather
// real facts this CI run already has access to, compute the same
// `canonical_plan_digest` atlasent-api would (so a brief becomes
// detectably stale if the head SHA moves), and render whatever the
// endpoint hands back.
//
// Never authorizes anything. This mode calls `v1-change-brief`, which
// mints no permit and is not an input to evaluate — see that endpoint's
// own header comment. A workflow using this mode should still gate on a
// separate evaluate/verify step (the default `action:` mode) before
// deploying; this mode exists to give a human reviewer real facts, not to
// replace the authorization gate.

import * as fs from "fs";
import { functionRegionHeaders } from "@atlasent/enforce";

const GITHUB_API_DEFAULT = "https://api.github.com";

// ── GitHub change-plan facts (mirrors atlasent-api's GitHubChangePlanFacts) ──

export interface GithubChangedFile {
  path: string;
  additions: number;
  deletions: number;
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";
  previous_path?: string | null;
}

export interface GithubCheckRun {
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion:
    | "success"
    | "failure"
    | "neutral"
    | "cancelled"
    | "skipped"
    | "timed_out"
    | "action_required"
    | "stale"
    | null;
  required?: boolean;
  html_url?: string | null;
}

export interface GithubChangePlanFacts {
  repository: string;
  pull_request_number?: number | null;
  base_sha: string;
  head_sha: string;
  ref?: string | null;
  environment: string;
  actor: string;
  pr_author?: string | null;
  merge_actor?: string | null;
  changed_files: GithubChangedFile[];
  /**
   * True when the changed-file list may be incomplete — GitHub's compare API
   * caps `files` at ~300 entries (see COMPARE_FILES_SOFT_CAP below). Mirrors
   * atlasent-api's `GitHubChangePlanFacts.changed_files_truncated`, which the
   * classification/evidence modules there use to disclose a partial diff
   * rather than presenting it as the complete one.
   */
  changed_files_truncated?: boolean;
  additions_total: number;
  deletions_total: number;
  checks: GithubCheckRun[];
  workflow?: { name: string; run_id: string | number; run_url?: string | null } | null;
  rollback?: {
    previous_deployed_sha?: string | null;
    rollback_workflow?: string | null;
    rollback_reference?: string | null;
  } | null;
  pr_url?: string | null;
  compare_url?: string | null;
  retrieved_at: string;
}

// ── canonical_plan_digest — byte-identical to atlasent-api's algorithm ──────
//
// See atlasent-api supabase/functions/_shared/change-brief/github-change-plan.ts
// `computeGithubPlanDigest`. Uses the SAME Web Crypto SHA-256 primitive (Node
// 20+ exposes `crypto.subtle` globally, same interface Deno provides), so a
// digest computed here and one computed there for the same
// {repository, base_sha, head_sha, ref} agree byte for byte. Do not change
// this without changing that module identically — the whole point of the
// digest is that both sides compute it the same way.

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

export async function computeGithubPlanDigest(input: {
  repository: string;
  base_sha: string;
  head_sha: string;
  ref?: string | null;
}): Promise<string> {
  const projection = {
    plan_format: "git-sha",
    repository: input.repository,
    base_sha: input.base_sha,
    head_sha: input.head_sha,
    ref: input.ref ?? null,
  };
  const encoded = new TextEncoder().encode(canonicalize(projection));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}

// ── Base/head SHA resolution ─────────────────────────────────────────────

interface ResolvedBaseHead {
  base_sha: string | null;
  head_sha: string;
  ref: string | null;
  pull_request_number: number | null;
  pr_author: string | null;
  merge_actor: string | null;
  pr_url: string | null;
}

interface PushEventPayload {
  before?: string;
  after?: string;
}

interface PullRequestEventPayload {
  number?: number;
  pull_request?: {
    base?: { sha?: string };
    head?: { sha?: string; ref?: string };
    user?: { login?: string } | null;
    merged_by?: { login?: string } | null;
    html_url?: string;
  };
}

/**
 * Resolve base/head SHAs from the GitHub Actions event payload. Explicit
 * `overrideBase`/`overrideHead` (from the `change-brief-base-sha` /
 * `change-brief-head-sha` inputs) always win — useful for `workflow_dispatch`
 * or any event this function doesn't specifically handle.
 *
 * Falls back to `head_sha = GITHUB_SHA`, `base_sha = null` when nothing else
 * resolves — matching atlasent-api's `githubBaseline()`, a null base_sha
 * means the eventual brief honestly reports "no comparison possible" rather
 * than fabricating one.
 */
export function resolveBaseHead(args: {
  eventName: string;
  eventPath: string | undefined;
  fallbackSha: string;
  fallbackRef: string;
  overrideBase?: string;
  overrideHead?: string;
  readFile?: (path: string) => string;
}): ResolvedBaseHead {
  const readFile = args.readFile ?? ((p: string) => fs.readFileSync(p, "utf-8"));
  // `overrideBase` must apply on its own, not only when `overrideHead` is ALSO
  // given — `change-brief-head-sha` is documented to fall back to GITHUB_SHA
  // (already `args.fallbackSha` here), so a workflow_dispatch run supplying
  // only change-brief-base-sha must still get a real comparison instead of
  // silently losing the override to this fallback's hardcoded `base_sha: null`.
  const empty: ResolvedBaseHead = {
    base_sha: args.overrideBase || null,
    head_sha: args.overrideHead || args.fallbackSha,
    ref: args.fallbackRef || null,
    pull_request_number: null,
    pr_author: null,
    merge_actor: null,
    pr_url: null,
  };

  if (args.overrideBase && args.overrideHead) {
    return { ...empty, base_sha: args.overrideBase, head_sha: args.overrideHead };
  }

  if (!args.eventPath) return empty;

  let payload: unknown;
  try {
    payload = JSON.parse(readFile(args.eventPath));
  } catch {
    return empty;
  }

  if (
    (args.eventName === "pull_request" || args.eventName === "pull_request_target") &&
    payload && typeof payload === "object"
  ) {
    const pr = (payload as PullRequestEventPayload).pull_request;
    if (pr?.base?.sha && pr?.head?.sha) {
      return {
        base_sha: args.overrideBase || pr.base.sha,
        head_sha: args.overrideHead || pr.head.sha,
        ref: pr.head.ref ?? args.fallbackRef ?? null,
        pull_request_number: (payload as PullRequestEventPayload).number ?? null,
        pr_author: pr.user?.login ?? null,
        merge_actor: pr.merged_by?.login ?? null,
        pr_url: pr.html_url ?? null,
      };
    }
  }

  if (args.eventName === "push" && payload && typeof payload === "object") {
    const push = payload as PushEventPayload;
    // A force-push or the first push to a new branch reports `before` as all
    // zeros — not a real base revision. Treat that the same as "no base
    // available" rather than shipping a synthetic all-zero SHA downstream.
    const ALL_ZERO = /^0+$/;
    if (push.before && push.after && !ALL_ZERO.test(push.before)) {
      return {
        base_sha: args.overrideBase || push.before,
        head_sha: args.overrideHead || push.after,
        ref: args.fallbackRef || null,
        pull_request_number: null,
        pr_author: null,
        merge_actor: null,
        pr_url: null,
      };
    }
  }

  return empty;
}

// ── GitHub REST reads (compare + check-runs) — GITHUB_TOKEN, read-only ─────

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

interface GithubCompareApiFile {
  filename: string;
  additions: number;
  deletions: number;
  status: string;
  previous_filename?: string;
}
interface GithubCompareApiResponse {
  files?: GithubCompareApiFile[];
  html_url?: string;
}

// GitHub's compare API returns a successful response but caps `files` at
// this many entries for a large comparison — silently, with no error and no
// indication in the response shape itself. Mirrors atlasent-api's
// `COMPARE_FILES_SOFT_CAP` (github-fetch.ts): treating a capped list as the
// complete diff would let a migration or workflow change outside the
// returned subset disappear from the brief without any warning.
const COMPARE_FILES_SOFT_CAP = 300;

const STATUS_MAP: Record<string, GithubChangedFile["status"]> = {
  added: "added",
  removed: "removed",
  modified: "modified",
  renamed: "renamed",
  copied: "copied",
  changed: "changed",
  unchanged: "unchanged",
};

/**
 * Read the changed-file diff via `GET /repos/:owner/:repo/compare/:base...:head`.
 * Never throws — a failed read degrades to an empty file list (the eventual
 * brief will honestly report the smaller set of facts it has, same fail-soft
 * discipline as `resolveApprovals`), and the caller is told via the returned
 * `ok: false` so it can log/warn without this module owning that concern.
 */
export async function fetchChangedFiles(args: {
  repository: string;
  base_sha: string;
  head_sha: string;
  token: string;
  apiBase?: string;
  fetchImpl?: typeof fetch;
}): Promise<{
  ok: boolean;
  files: GithubChangedFile[];
  truncated: boolean;
  additions_total: number;
  deletions_total: number;
  compare_url: string | null;
  error?: string;
}> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const apiBase = (args.apiBase ?? GITHUB_API_DEFAULT).replace(/\/+$/, "");
  const url = `${apiBase}/repos/${args.repository}/compare/${args.base_sha}...${args.head_sha}`;
  try {
    const res = await fetchImpl(url, { headers: ghHeaders(args.token) });
    if (!res.ok) {
      const text = await res.text().catch(() => "<unreadable>");
      return {
        ok: false,
        files: [],
        truncated: false,
        additions_total: 0,
        deletions_total: 0,
        compare_url: null,
        error: `compare failed (${res.status}): ${text.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as GithubCompareApiResponse;
    const rawFiles = data.files ?? [];
    const files: GithubChangedFile[] = rawFiles.map((f) => ({
      path: f.filename,
      additions: f.additions,
      deletions: f.deletions,
      status: STATUS_MAP[f.status] ?? "modified",
      previous_path: f.previous_filename ?? null,
    }));
    return {
      ok: true,
      files,
      truncated: rawFiles.length >= COMPARE_FILES_SOFT_CAP,
      additions_total: files.reduce((sum, f) => sum + f.additions, 0),
      deletions_total: files.reduce((sum, f) => sum + f.deletions, 0),
      compare_url: data.html_url ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      files: [],
      truncated: false,
      additions_total: 0,
      deletions_total: 0,
      compare_url: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

interface GithubCheckRunsApiResponse {
  check_runs?: Array<{
    name: string;
    status: string;
    conclusion: string | null;
    html_url?: string | null;
  }>;
}

// Following `approvals.ts`'s `fetchAllReviews` pagination convention: page by
// number, stop at a short batch, cap the page count as a sane upper bound. A
// commit with more than 100 check runs otherwise silently loses whichever
// runs land on page 2+ — including a still-queued or failing required check.
const MAX_CHECK_RUN_PAGES = 10;
const CHECK_RUNS_PER_PAGE = 100;

/** Read check runs via `GET /repos/:owner/:repo/commits/:ref/check-runs`, following pagination. Never throws. */
export async function fetchCheckRuns(args: {
  repository: string;
  ref: string;
  token: string;
  apiBase?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: boolean; checks: GithubCheckRun[]; truncated: boolean; error?: string }> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const apiBase = (args.apiBase ?? GITHUB_API_DEFAULT).replace(/\/+$/, "");
  const checks: GithubCheckRun[] = [];
  for (let page = 1; page <= MAX_CHECK_RUN_PAGES; page++) {
    const url =
      `${apiBase}/repos/${args.repository}/commits/${args.ref}/check-runs` +
      `?per_page=${CHECK_RUNS_PER_PAGE}&page=${page}`;
    let batch: GithubCheckRunsApiResponse["check_runs"];
    try {
      const res = await fetchImpl(url, { headers: ghHeaders(args.token) });
      if (!res.ok) {
        const text = await res.text().catch(() => "<unreadable>");
        return {
          ok: false,
          checks: [],
          truncated: false,
          error: `check-runs failed (${res.status}): ${text.slice(0, 200)}`,
        };
      }
      const data = (await res.json()) as GithubCheckRunsApiResponse;
      batch = data.check_runs ?? [];
    } catch (err) {
      return {
        ok: false,
        checks: [],
        truncated: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    if (batch.length === 0) break;
    for (const c of batch) {
      checks.push({
        name: c.name,
        status: (c.status as GithubCheckRun["status"]) ?? "queued",
        conclusion: (c.conclusion as GithubCheckRun["conclusion"]) ?? null,
        html_url: c.html_url ?? null,
      });
    }
    if (batch.length < CHECK_RUNS_PER_PAGE) break;
  }
  // A full final page means GitHub may have more check runs than the bounded
  // reader observed. Disclose that incompleteness instead of presenting the
  // first 1,000 rows as the complete check set.
  return {
    ok: true,
    checks,
    truncated: checks.length >= MAX_CHECK_RUN_PAGES * CHECK_RUNS_PER_PAGE,
  };
}

// ── v1-change-brief request/response ────────────────────────────────────

export interface ChangeBriefFinding {
  determination: "observed" | "derived" | "unavailable" | "not_applicable";
  value?: unknown;
  unavailable_reason?: string | null;
}

export interface ChangeBriefMaterialDifference {
  kind: string;
  description: string;
  significance: "informational" | "notable" | "decision_relevant";
}

export interface ChangeBriefMissingEvidence {
  requirement_id: string;
  kind: string;
  blocking: boolean;
  precise_question: string;
}

/** The subset of `change_brief.v1` this mode reads to build outputs/summaries. */
export interface ChangeBriefResponse {
  brief_id: string;
  recommendation: { value: string; rationale: string };
  classification: { value: string; rationale: string };
  material_differences: ChangeBriefMaterialDifference[];
  missing_evidence: ChangeBriefMissingEvidence[];
  baseline: { comparison_possible: boolean; compared_to: string | null };
  impact: Record<string, ChangeBriefFinding | string | null | undefined> & {
    blast_radius_note?: string | null;
  };
}

export interface RunChangeBriefOptions {
  apiKey: string;
  apiUrl: string;
  actionType: string;
  targetSystem: string;
  targetId: string;
  environment: string;
  actorId: string;
  changeRequest?: string;
  githubToken?: string;
  githubApiBase?: string;
  repository: string;
  eventName: string;
  eventPath?: string;
  fallbackSha: string;
  fallbackRef: string;
  overrideBaseSha?: string;
  overrideHeadSha?: string;
  workflow?: { name: string; run_id: string | number; run_url?: string | null } | null;
  rollback?: GithubChangePlanFacts["rollback"];
  now?: () => Date;
  fetchImpl?: typeof fetch;
  readFile?: (path: string) => string;
  log?: (message: string) => void;
  warn?: (message: string) => void;
}

export interface RunChangeBriefResult {
  facts: GithubChangePlanFacts;
  canonicalPlanDigest: string;
  brief: ChangeBriefResponse;
  collection: ChangeBriefCollection;
}

export type CollectionState = "complete" | "partial" | "unavailable";

export interface CollectedSource {
  source: "github_compare" | "github_check_runs";
  state: CollectionState;
  reason: string | null;
}

/**
 * Local collection integrity metadata. This is deliberately not added to the
 * atlasent-api wire request: atlasent-api owns that schema. The action keeps
 * the metadata beside the returned brief so its management rendering cannot
 * confuse an empty source read with an observed empty result.
 */
export interface ChangeBriefCollection {
  status: "complete" | "partial";
  sources: {
    comparison: CollectedSource;
    checks: CollectedSource;
  };
}

export type ManagementDecisionReadiness = "ready_for_review" | "evidence_incomplete";

/**
 * A deterministic, advisory projection for management surfaces. It translates
 * the existing sourced change-brief response into a queue-ready record; it
 * does not add facts, make an authorization decision, or mint a permit.
 */
export interface ManagementDecisionBrief {
  schema: "management_decision_brief.v1";
  brief_id: string;
  readiness: ManagementDecisionReadiness;
  recommendation: ChangeBriefResponse["recommendation"];
  classification: ChangeBriefResponse["classification"];
  decision_requested: string;
  management_summary: {
    business_rationale: string;
    impact: string;
    automated_analysis: {
      /** Null means the comparison source could not be read; zero means it was read and contained no files. */
      changed_files_observed: number | null;
      /** Null means the check-run source could not be read; zero means it was read and contained no runs. */
      check_runs_observed: number | null;
      material_differences: number;
      blocking_evidence_gaps: number;
      review_items: number;
      source_collection: ChangeBriefCollection["status"];
    };
  };
  next_actions: string[];
  evidence_binding: {
    repository: string;
    base_sha: string;
    head_sha: string;
    retrieved_at: string;
    canonical_plan_digest: string;
    source_collection: ChangeBriefCollection["sources"];
  };
  authority_boundary: {
    advisory_only: true;
    separate_evaluate_and_permit_required: true;
  };
}

export class ChangeBriefError extends Error {}

/**
 * Gather real GitHub/CI facts for this run, compute the canonical plan
 * digest, POST to `v1-change-brief`, and return the response alongside what
 * was sent. Throws `ChangeBriefError` on anything that prevents producing a
 * brief at all (missing GITHUB_TOKEN, unresolvable base/head, a non-2xx from
 * the endpoint) — the caller fails the step closed, matching every other
 * mode in this action.
 */
export async function runChangeBrief(opts: RunChangeBriefOptions): Promise<RunChangeBriefResult> {
  const log = opts.log ?? (() => {});
  const warn = opts.warn ?? (() => {});
  const now = (opts.now?.() ?? new Date()).toISOString();

  const token = (opts.githubToken ?? "").trim();
  if (!token) {
    throw new ChangeBriefError(
      "change-brief mode requires GITHUB_TOKEN to read the diff and check runs " +
        "(pass `env: GITHUB_TOKEN: ${{ github.token }}`).",
    );
  }

  const resolved = resolveBaseHead({
    eventName: opts.eventName,
    eventPath: opts.eventPath,
    fallbackSha: opts.fallbackSha,
    fallbackRef: opts.fallbackRef,
    overrideBase: opts.overrideBaseSha,
    overrideHead: opts.overrideHeadSha,
    readFile: opts.readFile,
  });

  if (!resolved.base_sha) {
    warn(
      "AtlaSent change-brief: no base revision could be resolved for this event " +
        `("${opts.eventName}") — the brief's baseline comparison will report ` +
        "\"not possible\" rather than a fabricated diff. Pass change-brief-base-sha / " +
        "change-brief-head-sha explicitly for events other than pull_request/push.",
    );
  }

  let changed_files: GithubChangedFile[] = [];
  let changed_files_truncated = false;
  let additions_total = 0;
  let deletions_total = 0;
  let compare_url: string | null = null;
  let comparisonCollection: CollectedSource = {
    source: "github_compare",
    state: "unavailable",
    reason: "No base revision was available, so no source comparison could be collected.",
  };
  if (resolved.base_sha) {
    const compare = await fetchChangedFiles({
      repository: opts.repository,
      base_sha: resolved.base_sha,
      head_sha: resolved.head_sha,
      token,
      apiBase: opts.githubApiBase,
      fetchImpl: opts.fetchImpl,
    });
    if (compare.ok) {
      changed_files = compare.files;
      changed_files_truncated = compare.truncated;
      additions_total = compare.additions_total;
      deletions_total = compare.deletions_total;
      compare_url = compare.compare_url;
      comparisonCollection = {
        source: "github_compare",
        state: compare.truncated ? "partial" : "complete",
        reason: compare.truncated
          ? `GitHub returned ${COMPARE_FILES_SOFT_CAP}+ changed files; the comparison may omit additional files.`
          : null,
      };
      log(`AtlaSent change-brief: ${changed_files.length} file(s) changed (+${additions_total}/-${deletions_total}).`);
      if (compare.truncated) {
        warn(
          "AtlaSent change-brief: the changed-file list hit GitHub's compare API cap " +
            `(${COMPARE_FILES_SOFT_CAP}+ files) — this diff may be incomplete.`,
        );
      }
    } else {
      comparisonCollection = {
        source: "github_compare",
        state: "unavailable",
        reason: compare.error ?? "GitHub comparison could not be collected.",
      };
      warn(`AtlaSent change-brief: could not read the diff (${compare.error}) — proceeding without it.`);
    }
  }

  const checksResult = await fetchCheckRuns({
    repository: opts.repository,
    ref: resolved.head_sha,
    token,
    apiBase: opts.githubApiBase,
    fetchImpl: opts.fetchImpl,
  });
  if (!checksResult.ok) {
    warn(`AtlaSent change-brief: could not read check runs (${checksResult.error}) — proceeding without them.`);
  } else if (checksResult.truncated) {
    warn(
      "AtlaSent change-brief: the check-run list reached the bounded read limit " +
        `(${MAX_CHECK_RUN_PAGES * CHECK_RUNS_PER_PAGE}); additional checks may exist.`,
    );
  }

  const checksCollection: CollectedSource = checksResult.ok
    ? {
        source: "github_check_runs",
        state: checksResult.truncated ? "partial" : "complete",
        reason: checksResult.truncated
          ? `The first ${MAX_CHECK_RUN_PAGES * CHECK_RUNS_PER_PAGE} check runs were collected; additional checks may exist.`
          : null,
      }
    : {
        source: "github_check_runs",
        state: "unavailable",
        reason: checksResult.error ?? "GitHub check runs could not be collected.",
      };

  const collection: ChangeBriefCollection = {
    status:
      comparisonCollection.state === "complete" && checksCollection.state === "complete"
        ? "complete"
        : "partial",
    sources: {
      comparison: comparisonCollection,
      checks: checksCollection,
    },
  };

  const facts: GithubChangePlanFacts = {
    repository: opts.repository,
    pull_request_number: resolved.pull_request_number,
    base_sha: resolved.base_sha ?? resolved.head_sha,
    head_sha: resolved.head_sha,
    ref: resolved.ref,
    environment: opts.environment,
    actor: opts.actorId,
    pr_author: resolved.pr_author,
    merge_actor: resolved.merge_actor,
    changed_files,
    changed_files_truncated,
    additions_total,
    deletions_total,
    checks: checksResult.checks,
    workflow: opts.workflow ?? null,
    rollback: opts.rollback ?? null,
    pr_url: resolved.pr_url,
    compare_url,
    retrieved_at: now,
  };

  // The digest is computed over base_sha/head_sha as GitHub actually reports
  // them (never the `?? resolved.head_sha` fallback used above for the wire
  // field) — an unresolvable base must not silently collapse the digest to
  // "compared against itself", which would make every such brief share one
  // digest regardless of what actually changed.
  const canonicalPlanDigest = await computeGithubPlanDigest({
    repository: opts.repository,
    base_sha: resolved.base_sha ?? resolved.head_sha,
    head_sha: resolved.head_sha,
    ref: resolved.ref,
  });

  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${opts.apiUrl.replace(/\/$/, "")}/v1-change-brief`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
        ...functionRegionHeaders(url),
      },
      body: JSON.stringify({
        action_type: opts.actionType,
        target_system: opts.targetSystem,
        target_id: opts.targetId,
        environment: opts.environment,
        canonical_plan_digest: canonicalPlanDigest,
        actor_id: opts.actorId,
        change_request: opts.changeRequest,
        plan_format: "git-sha",
        github_change_plan: facts,
      }),
    });
  } catch (err) {
    throw new ChangeBriefError(
      `Network error reaching ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      detail = body.error ?? body.message ?? "";
    } catch {
      // ignore parse failure on error body
    }
    throw new ChangeBriefError(`v1-change-brief responded ${res.status}${detail ? `: ${detail}` : ""}`);
  }

  let brief: ChangeBriefResponse;
  try {
    brief = (await res.json()) as ChangeBriefResponse;
  } catch {
    throw new ChangeBriefError("Could not parse JSON response from v1-change-brief");
  }

  return { facts, canonicalPlanDigest, brief, collection };
}

// ── Rendering ────────────────────────────────────────────────────────────

export function buildManagementDecisionBrief(
  result: RunChangeBriefResult,
): ManagementDecisionBrief {
  const { brief, facts, canonicalPlanDigest, collection } = result;
  const blocking = brief.missing_evidence.filter((item) => item.blocking);
  const reviewItems = brief.missing_evidence.filter((item) => !item.blocking);
  const evidenceIncomplete =
    collection.status === "partial" ||
    blocking.length > 0 ||
    brief.classification.value === "incomplete" ||
    brief.recommendation.value === "request_evidence";

  const nextActions: string[] = [];
  for (const source of Object.values(collection.sources)) {
    if (source.state !== "complete") {
      nextActions.push(
        `Restore or confirm ${source.source}: ${source.reason ?? "source collection is incomplete"}`,
      );
    }
  }
  for (const item of blocking) nextActions.push(item.precise_question);
  for (const item of reviewItems) nextActions.push(item.precise_question);
  if (nextActions.length === 0) {
    nextActions.push(
      "Review this advisory brief, then use the separate AtlaSent evaluate/permit gate before execution.",
    );
  }

  let decisionRequested: string;
  if (evidenceIncomplete) {
    decisionRequested =
      "Resolve the identified evidence gaps before relying on this brief for a management decision.";
  } else if (
    brief.recommendation.value === "deny" ||
    brief.classification.value === "prohibited"
  ) {
    decisionRequested =
      "Review the reported prohibition; this brief cannot authorize execution or create an exception.";
  } else if (
    brief.recommendation.value === "escalate" ||
    brief.classification.value === "exceptional"
  ) {
    decisionRequested =
      "Decide whether to route a separately authorized exception for this exact change plan.";
  } else {
    decisionRequested =
      "Review the recommendation and, if appropriate, continue to the separate authority gate.";
  }

  return {
    schema: "management_decision_brief.v1",
    brief_id: brief.brief_id,
    readiness: evidenceIncomplete ? "evidence_incomplete" : "ready_for_review",
    recommendation: brief.recommendation,
    classification: brief.classification,
    decision_requested: decisionRequested,
    management_summary: {
      business_rationale: brief.recommendation.rationale,
      impact:
        brief.impact.blast_radius_note ??
        "No business-impact narrative was reported; impact remains unknown.",
      automated_analysis: {
        changed_files_observed:
          collection.sources.comparison.state === "unavailable" ? null : facts.changed_files.length,
        check_runs_observed:
          collection.sources.checks.state === "unavailable" ? null : facts.checks.length,
        material_differences: brief.material_differences.length,
        blocking_evidence_gaps: blocking.length,
        review_items: reviewItems.length,
        source_collection: collection.status,
      },
    },
    next_actions: nextActions,
    evidence_binding: {
      repository: facts.repository,
      base_sha: facts.base_sha,
      head_sha: facts.head_sha,
      retrieved_at: facts.retrieved_at,
      canonical_plan_digest: canonicalPlanDigest,
      source_collection: collection.sources,
    },
    authority_boundary: {
      advisory_only: true,
      separate_evaluate_and_permit_required: true,
    },
  };
}

function findingLine(label: string, finding: ChangeBriefFinding | undefined): string {
  if (!finding) return `| ${label} | _not reported_ |`;
  if (finding.determination === "unavailable") {
    return `| ${label} | ⚪ Unknown — ${finding.unavailable_reason ?? "no reason given"} |`;
  }
  return `| ${label} | \`${JSON.stringify(finding.value)}\` (${finding.determination}) |`;
}

const SIGNIFICANCE_EMOJI: Record<string, string> = {
  decision_relevant: "🟠",
  notable: "🟡",
  informational: "⚪",
};

function renderObservedCount(value: number | null): string {
  return value === null ? "Unknown — source unavailable" : String(value);
}

export function renderChangeBriefStepSummary(result: RunChangeBriefResult): string {
  const { brief, facts, canonicalPlanDigest, collection } = result;
  const management = buildManagementDecisionBrief(result);
  const changedFilesObserved = management.management_summary.automated_analysis.changed_files_observed;
  const changedFilesSummary =
    changedFilesObserved === null
      ? "Unknown — GitHub comparison unavailable"
      : `${changedFilesObserved} (+${facts.additions_total}/-${facts.deletions_total})`;
  const lines: string[] = [
    "",
    "## 📋 AtlaSent Management Decision Brief",
    "",
    `**Decision readiness:** \`${management.readiness}\``,
    "",
    `**Decision requested:** ${management.decision_requested}`,
    "",
    `**Recommendation:** \`${brief.recommendation.value}\` — ${brief.recommendation.rationale}`,
    "",
    "### Business translation",
    "",
    `- **Why this matters:** ${management.management_summary.business_rationale}`,
    `- **Potential impact:** ${management.management_summary.impact}`,
    "",
    "### Work AtlaSent performed automatically",
    "",
    "| Analysis | Observed result |",
    "|---|---|",
    `| Source collection | \`${management.management_summary.automated_analysis.source_collection}\` |`,
    `| Changed files compared | ${renderObservedCount(management.management_summary.automated_analysis.changed_files_observed)} |`,
    `| GitHub check runs inspected | ${renderObservedCount(management.management_summary.automated_analysis.check_runs_observed)} |`,
    `| Material differences identified | ${management.management_summary.automated_analysis.material_differences} |`,
    `| Blocking evidence gaps routed | ${management.management_summary.automated_analysis.blocking_evidence_gaps} |`,
    `| Additional review items | ${management.management_summary.automated_analysis.review_items} |`,
    "",
    "### Evidence binding",
    "",
    `| Field | Value |`,
    `|---|---|`,
    `| Brief ID | \`${brief.brief_id}\` |`,
    `| Classification | \`${brief.classification.value}\` |`,
    `| Repository | \`${facts.repository}\` |`,
    `| Base → Head | \`${facts.base_sha.slice(0, 8)}\` → \`${facts.head_sha.slice(0, 8)}\` |`,
    `| Files changed | ${changedFilesSummary} |`,
    `| Canonical plan digest | \`${canonicalPlanDigest}\` |`,
    `| Baseline comparison | ${brief.baseline.comparison_possible ? "✅ possible" : "⚪ not possible"} |`,
  ];

  lines.push(
    "",
    "### Source collection integrity",
    "",
    "| Source | Status | Disclosure |",
    "|---|---|---|",
    `| GitHub comparison | \`${collection.sources.comparison.state}\` | ${collection.sources.comparison.reason ?? "Collected without a known gap."} |`,
    `| GitHub check runs | \`${collection.sources.checks.state}\` | ${collection.sources.checks.reason ?? "Collected without a known gap."} |`,
  );

  if (brief.material_differences.length > 0) {
    lines.push("", "### Material differences from baseline", "");
    for (const d of brief.material_differences) {
      lines.push(`- ${SIGNIFICANCE_EMOJI[d.significance] ?? "⚪"} **${d.kind}** (${d.significance}): ${d.description}`);
    }
  }

  const blockingMissing = brief.missing_evidence.filter((m) => m.blocking);
  const nonBlockingMissing = brief.missing_evidence.filter((m) => !m.blocking);
  if (blockingMissing.length > 0) {
    lines.push("", "### ⛔ Blocking evidence missing", "");
    for (const m of blockingMissing) lines.push(`- **${m.kind}**: ${m.precise_question}`);
  }
  if (nonBlockingMissing.length > 0) {
    lines.push("", "### What needs review", "");
    for (const m of nonBlockingMissing) lines.push(`- **${m.kind}**: ${m.precise_question}`);
  }

  lines.push("", "### Recommended next actions", "");
  for (const action of management.next_actions) lines.push(`- ${action}`);

  lines.push(
    "",
    "### Impact",
    "",
    "| Field | Value |",
    "|---|---|",
    findingLine("Affected principals", brief.impact.affected_principals as ChangeBriefFinding | undefined),
    findingLine("Affected records", brief.impact.affected_records as ChangeBriefFinding | undefined),
    findingLine("Permissions added", brief.impact.permissions_added as ChangeBriefFinding | undefined),
    findingLine("Data access introduced", brief.impact.data_access_introduced as ChangeBriefFinding | undefined),
  );
  if (brief.impact.blast_radius_note) {
    lines.push("", `> ${brief.impact.blast_radius_note}`);
  }

  lines.push(
    "",
    "> This is a preparation artifact for human review. It authorizes nothing — a separate " +
      "evaluate/permit step gates execution.",
    "",
  );
  return lines.join("\n");
}
