// PR-reviews-as-approval reader.
//
// Derives verified approval evidence for a deploy from GitHub pull-request
// reviews, so the canonical `allow-2-approvals-change-window` policy template
// (which reads `context.approvals >= 2`) can be satisfied without the customer
// wiring a second integration. The approving reviewers are real GitHub
// identities, not a self-asserted count.
//
// Design contract:
//   - Best-effort and FAIL-OPEN-TO-ZERO. A metadata fetch failure must never
//     *grant* authorization. Returning zero approvals causes the count gate to
//     deny — i.e. failure collapses to the fail-closed direction, consistent
//     with the rest of the action.
//   - "Approvals" = the number of DISTINCT reviewers whose LATEST review state
//     is APPROVED (mirrors GitHub's own latest-review-per-user semantics:
//     COMMENTED / PENDING reviews do not change a user's approval state; a later
//     CHANGES_REQUESTED or DISMISSED supersedes an earlier APPROVED).
//   - Pure and injectable: `fetchImpl` + loggers are passed in so the module is
//     unit-testable with no GitHub Actions environment.

export interface ApprovalEvidence {
  /** Count of distinct reviewers whose latest review is APPROVED. */
  approvals: number;
  /** Logins of those reviewers, captured for audit evidence. */
  approving_reviewers: string[];
  /** The PR the reviews were read from, if one was resolved. */
  pr_number: number | null;
  /** "pr-reviews" when the GitHub API was actually consulted; "none" otherwise. */
  source: "pr-reviews" | "none";
}

export interface ResolveApprovalsOptions {
  /** "owner/repo". */
  repository: string;
  /** Head commit SHA (used to resolve the PR on push/merge events). */
  sha: string;
  /** PR number from the event ref, if this is a pull_request event. */
  prNumber?: string | number | null;
  /** GitHub token (GITHUB_TOKEN). Without it the API cannot be read. */
  token?: string;
  /** GitHub API base (GITHUB_API_URL). Defaults to public github.com. */
  apiBase?: string;
  /** Injectable fetch for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
  warn?: (message: string) => void;
}

interface GitHubReview {
  state?: string;
  user?: { login?: string } | null;
}

interface AssociatedPull {
  number?: number;
  state?: string;
}

const EMPTY: ApprovalEvidence = {
  approvals: 0,
  approving_reviewers: [],
  pr_number: null,
  source: "none",
};

const MAX_REVIEW_PAGES = 10;
const PER_PAGE = 100;

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/**
 * Resolve the PR number to read reviews from. Prefers the explicit
 * pull_request-event number; otherwise asks GitHub which PRs are
 * associated with the head commit (covers deploy-on-merge `push` events).
 */
async function resolvePrNumber(
  opts: Required<Pick<ResolveApprovalsOptions, "repository" | "sha" | "token" | "apiBase">> & {
    prNumber?: string | number | null;
    fetchImpl: typeof fetch;
    warn: (m: string) => void;
  },
): Promise<number | null> {
  const explicit =
    typeof opts.prNumber === "number"
      ? opts.prNumber
      : typeof opts.prNumber === "string" && /^\d+$/.test(opts.prNumber.trim())
        ? parseInt(opts.prNumber.trim(), 10)
        : null;
  if (explicit && explicit > 0) return explicit;

  if (!opts.sha) return null;
  const url = `${opts.apiBase}/repos/${opts.repository}/commits/${opts.sha}/pulls`;
  try {
    const res = await opts.fetchImpl(url, { headers: ghHeaders(opts.token) });
    if (!res.ok) {
      opts.warn(
        `AtlaSent: could not resolve PR for commit ${opts.sha.slice(0, 8)} (${res.status}); ` +
          `treating as 0 approvals`,
      );
      return null;
    }
    const pulls = (await res.json()) as AssociatedPull[];
    if (!Array.isArray(pulls) || pulls.length === 0) return null;
    // Prefer a merged/closed PR (the one this deploy came from), else the first.
    const merged = pulls.find((p) => p.state === "closed") ?? pulls[0];
    return typeof merged.number === "number" ? merged.number : null;
  } catch (err) {
    opts.warn(
      `AtlaSent: PR resolution error (advisory, non-blocking): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

/** Fetch every review for a PR, following pagination up to a sane cap. */
async function fetchAllReviews(
  opts: Required<Pick<ResolveApprovalsOptions, "repository" | "token" | "apiBase">> & {
    prNumber: number;
    fetchImpl: typeof fetch;
    warn: (m: string) => void;
  },
): Promise<GitHubReview[] | null> {
  const reviews: GitHubReview[] = [];
  for (let page = 1; page <= MAX_REVIEW_PAGES; page++) {
    const url =
      `${opts.apiBase}/repos/${opts.repository}/pulls/${opts.prNumber}/reviews` +
      `?per_page=${PER_PAGE}&page=${page}`;
    let batch: GitHubReview[];
    try {
      const res = await opts.fetchImpl(url, { headers: ghHeaders(opts.token) });
      if (!res.ok) {
        opts.warn(
          `AtlaSent: could not read reviews for PR #${opts.prNumber} (${res.status}); ` +
            `treating as 0 approvals`,
        );
        return null;
      }
      batch = (await res.json()) as GitHubReview[];
    } catch (err) {
      opts.warn(
        `AtlaSent: review fetch error (advisory, non-blocking): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
    if (!Array.isArray(batch) || batch.length === 0) break;
    reviews.push(...batch);
    if (batch.length < PER_PAGE) break;
  }
  return reviews;
}

/**
 * Reduce a chronological review list to the count of distinct reviewers whose
 * latest *state-bearing* review is APPROVED. COMMENTED / PENDING reviews are
 * ignored for state (they don't change approval), matching GitHub semantics.
 */
export function countApprovals(reviews: GitHubReview[]): {
  approvals: number;
  approving_reviewers: string[];
} {
  const STATEFUL = new Set(["APPROVED", "CHANGES_REQUESTED", "DISMISSED"]);
  const latestByUser = new Map<string, string>();
  for (const r of reviews) {
    const login = r.user?.login;
    const state = (r.state ?? "").toUpperCase();
    if (!login || !STATEFUL.has(state)) continue;
    latestByUser.set(login, state); // chronological order → last wins
  }
  const approving = [...latestByUser.entries()]
    .filter(([, state]) => state === "APPROVED")
    .map(([login]) => login)
    .sort();
  return { approvals: approving.length, approving_reviewers: approving };
}

/**
 * Resolve verified approval evidence for the current deploy. Never throws;
 * any failure returns zero approvals (the fail-closed direction for a
 * count-based gate).
 */
export async function resolveApprovals(
  options: ResolveApprovalsOptions,
): Promise<ApprovalEvidence> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const warn = options.warn ?? (() => {});
  const log = options.log ?? (() => {});
  const apiBase = (options.apiBase ?? "https://api.github.com").replace(/\/+$/, "");
  const token = options.token?.trim();

  if (!token) {
    warn(
      "AtlaSent: GITHUB_TOKEN not available — cannot read PR reviews for approval " +
        "evidence. Pass `env: GITHUB_TOKEN: ${{ github.token }}`. Treating as 0 approvals; " +
        "an `approvals` value in the `context` input is not used in place of review evidence.",
    );
    return { ...EMPTY };
  }
  if (!options.repository) {
    warn("AtlaSent: GITHUB_REPOSITORY not set — cannot read PR reviews. Treating as 0 approvals.");
    return { ...EMPTY };
  }

  const prNumber = await resolvePrNumber({
    repository: options.repository,
    sha: options.sha,
    token,
    apiBase,
    prNumber: options.prNumber,
    fetchImpl,
    warn,
  });
  if (!prNumber) {
    log("AtlaSent: no associated pull request found — 0 approvals from PR reviews.");
    return { ...EMPTY };
  }

  const reviews = await fetchAllReviews({
    repository: options.repository,
    token,
    apiBase,
    prNumber,
    fetchImpl,
    warn,
  });
  if (reviews === null) {
    return { approvals: 0, approving_reviewers: [], pr_number: prNumber, source: "none" };
  }

  const { approvals, approving_reviewers } = countApprovals(reviews);
  log(
    `AtlaSent: PR #${prNumber} has ${approvals} approving ` +
      `review${approvals === 1 ? "" : "s"}` +
      (approving_reviewers.length ? ` (${approving_reviewers.join(", ")})` : ""),
  );
  return { approvals, approving_reviewers, pr_number: prNumber, source: "pr-reviews" };
}
