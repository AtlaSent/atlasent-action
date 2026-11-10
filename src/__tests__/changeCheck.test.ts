import { describe, expect, it } from "vitest";
import {
  CHANGE_CHECK_REPORT_VERSION,
  ChangeCheckInputError,
  classifyMergeApproval,
  escapeMarkdownText,
  parseChangeCheckCount,
  renderChangeCheckStepSummary,
  reviewSummary,
  runChangeCheck,
  selectRecentMerges,
  type ChangeCheckReport,
  type GhReview,
} from "../changeCheck";

// ─── fixtures ───────────────────────────────────────────────────────────────

const API = "https://api.github.test";
const REPO = "acme/widgets";
const BASE = `${API}/repos/acme/widgets`;
const TOKEN = "ghs_testtoken";

const sha = (c: string) => c.repeat(40);

interface PrSpec {
  number: number;
  author?: string;
  mergedAt?: string;
  head?: string;
  mergeSha?: string | null;
  base?: string;
  title?: string;
}

function pr(spec: PrSpec): Record<string, unknown> {
  const mergedAt = spec.mergedAt ?? `2026-11-0${spec.number % 9 || 1}T12:00:00Z`;
  return {
    number: spec.number,
    title: spec.title ?? `Change ${spec.number}`,
    user: { login: spec.author ?? "alice", type: "User" },
    merged_at: mergedAt,
    updated_at: mergedAt,
    merge_commit_sha: spec.mergeSha === undefined ? sha(String(spec.number % 10)) : spec.mergeSha,
    head: { sha: spec.head ?? sha("a") },
    base: { ref: spec.base ?? "main", repo: { default_branch: "main" } },
  };
}

function review(user: string, state: string, commitId: string, submittedAt: string, type = "User"): GhReview {
  return { user: { login: user, type }, state, commit_id: commitId, submitted_at: submittedAt };
}

interface Route {
  match: RegExp;
  status: number;
  body?: unknown;
}

interface Recorder {
  fetchImpl: typeof fetch;
  calls: Array<{ url: string; auth: string | undefined }>;
}

function routes(list: Route[]): Recorder {
  const calls: Recorder["calls"] = [];
  const fetchImpl = (async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, auth: init?.headers?.Authorization });
    const route = list.find((r) => r.match.test(url));
    if (!route) throw new Error(`no fetch route matched: ${url}`);
    return {
      ok: route.status >= 200 && route.status < 300,
      status: route.status,
      headers: { get: () => null },
      json: async () => route.body,
      text: async () => JSON.stringify(route.body ?? { message: "Resource not accessible by integration" }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const listRoute = (prs: unknown[]): Route => ({ match: /\/pulls\?state=closed/, status: 200, body: prs });
const reviewsRoute = (n: number, body: unknown, status = 200, page = 1): Route => ({
  match: new RegExp(`/pulls/${n}/reviews\\?per_page=100&page=${page}$`),
  status,
  body,
});
const detailRoute = (n: number, mergedBy: string | null, status = 200): Route => ({
  match: new RegExp(`/pulls/${n}$`),
  status,
  body: mergedBy ? { number: n, merged_by: { login: mergedBy, type: "User" } } : { number: n, merged_by: null },
});
const deploymentsRoute = (mergeSha: string, body: unknown, status = 200): Route => ({
  match: new RegExp(`/deployments\\?sha=${esc(mergeSha)}&`),
  status,
  body,
});
const statusesRoute = (id: number, body: unknown, status = 200): Route => ({
  match: new RegExp(`/deployments/${id}/statuses\\?`),
  status,
  body,
});
const environmentsRoute = (body: unknown, status = 200): Route => ({ match: /\/environments\?per_page=100$/, status, body });

function deployment(id: number, environment: string, createdAt: string, production = environment === "production") {
  return {
    id,
    sha: "x",
    environment,
    production_environment: production,
    created_at: createdAt,
    creator: { login: "github-actions[bot]", type: "Bot" },
    statuses_url: `${BASE}/deployments/${id}/statuses`,
  };
}

const PROTECTED_PRODUCTION = {
  name: "production",
  protection_rules: [
    { id: 1, type: "wait_timer", wait_timer: 15 },
    {
      id: 2,
      type: "required_reviewers",
      prevent_self_review: true,
      reviewers: [
        { type: "User", reviewer: { login: "release-lead" } },
        { type: "Team", reviewer: { slug: "sre" } },
      ],
    },
    { id: 3, type: "branch_policy" },
  ],
  deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
};
const UNPROTECTED_PRODUCTION = { name: "production", protection_rules: [], deployment_branch_policy: null };

async function check(list: Route[], count = 10): Promise<{ report: ChangeCheckReport; rec: Recorder }> {
  const rec = routes(list);
  const report = await runChangeCheck({
    repository: REPO,
    token: TOKEN,
    apiBase: API,
    serverUrl: "https://github.test",
    count,
    fetchImpl: rec.fetchImpl,
    now: () => new Date("2026-11-10T00:00:00Z"),
  });
  return { report, rec };
}

/** One merged PR #7 by alice, head A, merge commit 7777…, with the given reviews and deploy routes. */
function singleMerge(reviews: GhReview[], extra: Route[], opts: { mergedBy?: string } = {}): Route[] {
  return [
    listRoute([pr({ number: 7, head: sha("a"), mergeSha: sha("7"), mergedAt: "2026-11-05T12:00:00Z" })]),
    reviewsRoute(7, reviews),
    detailRoute(7, opts.mergedBy ?? "bob"),
    ...extra,
  ];
}

const NO_DEPLOYS = [deploymentsRoute(sha("7"), [])];

// ─── input validation ───────────────────────────────────────────────────────

describe("parseChangeCheckCount", () => {
  it("defaults to 10 when empty", () => {
    expect(parseChangeCheckCount("")).toBe(10);
    expect(parseChangeCheckCount(undefined)).toBe(10);
  });

  it("accepts whole numbers from 1 to 30", () => {
    expect(parseChangeCheckCount("1")).toBe(1);
    expect(parseChangeCheckCount(" 30 ")).toBe(30);
  });

  it.each(["0", "31", "100", "abc", "1.5", "-1", "1e1"])("rejects %s with a clear error", (raw) => {
    expect(() => parseChangeCheckCount(raw)).toThrow(ChangeCheckInputError);
    expect(() => parseChangeCheckCount(raw)).toThrow(/change-check-count/);
  });
});

// ─── ported website semantics ───────────────────────────────────────────────

describe("reviewSummary (ported from the website)", () => {
  const head = sha("a");

  it("a COMMENTED review after an APPROVED one does not replace the approval", () => {
    const s = reviewSummary(
      [review("bob", "APPROVED", head, "2026-11-01T10:00:00Z"), review("bob", "COMMENTED", head, "2026-11-01T11:00:00Z")],
      "alice",
      head,
    );
    expect(s.approvals.map((r) => r.user?.login)).toEqual(["bob"]);
    expect(s.onHead).toHaveLength(1);
  });

  it("a later CHANGES_REQUESTED replaces an earlier approval", () => {
    const s = reviewSummary(
      [review("bob", "APPROVED", head, "2026-11-01T10:00:00Z"), review("bob", "CHANGES_REQUESTED", head, "2026-11-01T11:00:00Z")],
      "alice",
      head,
    );
    expect(s.approvals).toHaveLength(0);
    expect(s.changes).toHaveLength(1);
  });

  it("ignores bots and the author", () => {
    const s = reviewSummary(
      [
        review("alice", "APPROVED", head, "2026-11-01T10:00:00Z"),
        review("ci-helper[bot]", "APPROVED", head, "2026-11-01T10:00:00Z"),
        review("renovate", "APPROVED", head, "2026-11-01T10:00:00Z", "Bot"),
      ],
      "alice",
      head,
    );
    expect(s.approvals).toHaveLength(0);
  });
});

describe("selectRecentMerges (ported from the website)", () => {
  it("keeps merges into the default branch, newest first, up to max", () => {
    const items = [
      pr({ number: 1, mergedAt: "2026-11-01T00:00:00Z" }),
      pr({ number: 2, mergedAt: "2026-11-03T00:00:00Z" }),
      pr({ number: 3, mergedAt: "2026-11-02T00:00:00Z", base: "release" }),
      { number: 4, merged_at: null, head: {}, base: {} },
    ];
    const s = selectRecentMerges(items, false, 1);
    expect(s.branch).toBe("main");
    expect(s.prs.map((p) => p.number)).toEqual([2]);
    expect(s.limited).toBe(false);
  });

  it("reports limited when more pages exist and fewer than max can be confirmed", () => {
    const items = [pr({ number: 1, mergedAt: "2026-11-01T00:00:00Z" })];
    expect(selectRecentMerges(items, true, 10).limited).toBe(true);
  });
});

describe("classifyMergeApproval", () => {
  const p = { user: { login: "alice" }, merged_at: "2026-11-05T12:00:00Z", head: { sha: sha("a") } };

  it("does not count an approval given after the merge", () => {
    const a = classifyMergeApproval([review("bob", "APPROVED", sha("a"), "2026-11-05T13:00:00Z")], p);
    expect(a.status).toBe("no_approval");
    expect(a.late_approvals).toBe(1);
    expect(a.text).toMatch(/given after the merge is not counted/);
  });
});

// ─── runChangeCheck: approvals ──────────────────────────────────────────────

describe("runChangeCheck — approval on the code that merged", () => {
  it("approved on the final revision", async () => {
    const { report } = await check(singleMerge([review("bob", "APPROVED", sha("a"), "2026-11-05T10:00:00Z")], NO_DEPLOYS));
    const m = report.merges[0];
    expect(m.approval.status).toBe("approved_final");
    expect(m.approval.approvers_final).toEqual(["bob"]);
    expect(m.approval.last_final_approval_at).toBe("2026-11-05T10:00:00Z");
    expect(report.counts.approved_final).toBe(1);
    expect(report.summary).toMatch(/^All 1 recent merge into main had an approval on the code that merged/);
  });

  it("approved only on an earlier revision", async () => {
    const { report } = await check(singleMerge([review("bob", "APPROVED", sha("b"), "2026-11-05T10:00:00Z")], NO_DEPLOYS));
    const m = report.merges[0];
    expect(m.approval.status).toBe("approved_earlier");
    expect(m.approval.last_final_approval_at).toBeNull();
    expect(report.summary).toMatch(/^1 of the last 1 merge into main had no approval on the code that merged/);
    expect(report.attention.join("\n")).toMatch(/approved only on an earlier revision/);
    expect(report.remedies.merge?.rules.join("\n")).toMatch(/Dismiss stale pull request approvals/);
  });

  it("a COMMENTED review after an APPROVED one still counts as approval", async () => {
    const { report } = await check(
      singleMerge(
        [review("bob", "APPROVED", sha("a"), "2026-11-05T10:00:00Z"), review("bob", "COMMENTED", sha("a"), "2026-11-05T11:00:00Z")],
        NO_DEPLOYS,
      ),
    );
    expect(report.merges[0].approval.status).toBe("approved_final");
  });

  it("ignores approvals from bots and from the author", async () => {
    const { report } = await check(
      singleMerge(
        [
          review("alice", "APPROVED", sha("a"), "2026-11-05T10:00:00Z"),
          review("dependabot[bot]", "APPROVED", sha("a"), "2026-11-05T10:00:00Z", "Bot"),
        ],
        NO_DEPLOYS,
      ),
    );
    expect(report.merges[0].approval.status).toBe("no_approval");
    expect(report.counts.no_approval).toBe(1);
    expect(report.remedies.merge?.rules[0]).toMatch(/Required approvals set to at least 1/);
  });

  it("reports a merge by its own author, and flags it when nobody approved the merged code", async () => {
    const { report } = await check(singleMerge([], NO_DEPLOYS, { mergedBy: "alice" }));
    const m = report.merges[0];
    expect(m.merged_by).toBe("alice");
    expect(m.merged_by_author).toBe(true);
    expect(report.counts.merged_by_author).toBe(1);
    expect(report.counts.merged_by_author_without_final_approval).toBe(1);
    expect(report.attention.join("\n")).toMatch(/merged by its own author with no approval on the code that merged/);
  });

  it("a merge by someone else is not flagged as merged by its author", async () => {
    const { report } = await check(singleMerge([], NO_DEPLOYS, { mergedBy: "bob" }));
    expect(report.merges[0].merged_by_author).toBe(false);
    expect(report.counts.merged_by_author).toBe(0);
  });

  it("who merged it is unknown, not 'someone else', when the pull request cannot be read", async () => {
    const { report } = await check([
      listRoute([pr({ number: 7, mergeSha: sha("7") })]),
      reviewsRoute(7, []),
      detailRoute(7, null, 403),
      ...NO_DEPLOYS,
    ]);
    expect(report.merges[0].merged_by_author).toBeNull();
    const u = report.unknowns.find((x) => x.scope === "merged_by");
    expect(u?.http_status).toBe(403);
    expect(u?.likely_missing_permission).toBe("pull-requests: read");
  });

  it("reviews that cannot be read are unknown, never 'no approval'", async () => {
    const { report } = await check([
      listRoute([pr({ number: 7, mergeSha: sha("7") })]),
      reviewsRoute(7, { message: "Resource not accessible by integration" }, 403),
      detailRoute(7, "bob"),
      ...NO_DEPLOYS,
    ]);
    const m = report.merges[0];
    expect(m.approval.status).toBe("unavailable");
    expect(report.counts.no_approval).toBe(0);
    expect(report.counts.reviews_unread).toBe(1);
    expect(report.summary).toMatch(/the reviews on the last 1 merge into main could not be read/i);
    const u = report.unknowns.find((x) => x.scope === "reviews");
    expect(u?.http_status).toBe(403);
    expect(u?.likely_missing_permission).toBe("pull-requests: read");
  });

  it("paginates reviews: an approval of the final revision on page 2 counts", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) =>
      review(`r${i}`, "COMMENTED", sha("a"), `2026-11-04T10:${String(i % 60).padStart(2, "0")}:00Z`),
    );
    const { report, rec } = await check([
      listRoute([pr({ number: 7, mergeSha: sha("7"), mergedAt: "2026-11-05T12:00:00Z" })]),
      reviewsRoute(7, page1, 200, 1),
      reviewsRoute(7, [review("bob", "APPROVED", sha("a"), "2026-11-05T10:00:00Z")], 200, 2),
      detailRoute(7, "bob"),
      ...NO_DEPLOYS,
    ]);
    expect(report.merges[0].approval.status).toBe("approved_final");
    expect(rec.calls.filter((c) => c.url.includes("/reviews?")).length).toBe(2);
  });

  it("draws no conclusion when every review page read was full", async () => {
    const full = Array.from({ length: 100 }, (_, i) => review(`r${i}`, "COMMENTED", sha("a"), "2026-11-04T10:00:00Z"));
    const { report } = await check([
      listRoute([pr({ number: 7, mergeSha: sha("7") })]),
      { match: /\/pulls\/7\/reviews\?/, status: 200, body: full },
      detailRoute(7, "bob"),
      ...NO_DEPLOYS,
    ]);
    expect(report.merges[0].approval.status).toBe("incomplete");
    expect(report.counts.no_approval).toBe(0);
  });
});

// ─── runChangeCheck: deployments and environments ───────────────────────────

describe("runChangeCheck — deployments", () => {
  const approvedFinal = [review("bob", "APPROVED", sha("a"), "2026-11-05T10:00:00Z")];

  it("deployment to a protected production environment: reached, needed approval, timed from the last final approval", async () => {
    const { report } = await check(
      singleMerge(approvedFinal, [
        deploymentsRoute(sha("7"), [deployment(501, "production", "2026-11-05T13:30:00Z")]),
        statusesRoute(501, [
          { id: 2, state: "in_progress", created_at: "2026-11-05T13:31:00Z" },
          { id: 3, state: "success", created_at: "2026-11-05T13:40:00Z" },
          { id: 1, state: "queued", created_at: "2026-11-05T13:30:00Z" },
        ]),
        environmentsRoute({ total_count: 1, environments: [PROTECTED_PRODUCTION] }),
      ]),
    );
    const m = report.merges[0];
    expect(m.deployments.status).toBe("recorded");
    const d = m.deployments.items[0];
    expect(d.environment).toBe("production");
    expect(d.created_at).toBe("2026-11-05T13:30:00Z");
    expect(d.latest_state).toBe("success");
    expect(d.reached).toBe("reached");
    expect(d.approval_to_deploy_seconds).toBe(3.5 * 3600);
    expect(d.approval_to_deploy_text).toBe("3 h 30 min after the last approval on the final revision");
    expect(d.environment_requires_approval).toBe(true);
    expect(m.production_deploy_approval).toBe("required");

    const env = report.environments[0];
    expect(env.status).toBe("configured");
    expect(env.required_reviewers).toEqual({ reviewers: ["release-lead", "team sre"], prevent_self_review: true });
    expect(env.wait_timer_minutes).toBe(15);
    expect(env.deployment_branch_policy).toEqual({ protected_branches: true, custom_branch_policies: false });

    expect(report.summary).toBe(
      "All 1 recent merge into main had an approval on the code that merged; 1 was deployed to production, " +
        "all through an environment that requires an approval to deploy.",
    );
    expect(report.remedies.deploy).toBeNull();
  });

  it("deployment to production with no protection: flagged, with the environment settings that would close it", async () => {
    const { report } = await check(
      singleMerge(
        [],
        [
          deploymentsRoute(sha("7"), [deployment(502, "production", "2026-11-05T12:10:00Z")]),
          statusesRoute(502, [{ id: 9, state: "success", created_at: "2026-11-05T12:12:00Z" }]),
          environmentsRoute({ total_count: 1, environments: [UNPROTECTED_PRODUCTION] }),
        ],
      ),
    );
    const m = report.merges[0];
    expect(m.deployments.items[0].environment_requires_approval).toBe(false);
    expect(m.deployments.items[0].approval_to_deploy_seconds).toBeNull();
    expect(m.production_deploy_approval).toBe("not_required");
    expect(report.counts.production_without_final_approval).toBe(1);
    expect(report.summary).toBe(
      "1 of the last 1 merge into main had no approval on the code that merged; 1 was deployed to production, " +
        "none through an environment that requires an approval to deploy.",
    );
    expect(report.attention.join("\n")).toMatch(/1 merge with no approval on the code that merged was deployed to production/);
    expect(report.attention.join("\n")).toMatch(/Production environment "production" does not require an approval to deploy \(as configured now\)/);
    expect(report.remedies.deploy?.where).toMatch(/Settings → Environments → production/);
    expect(report.remedies.deploy?.rules.join("\n")).toMatch(/Required reviewers/);
    expect(report.remedies.deploy?.rules.join("\n")).toMatch(/Deployment branches and tags/);
  });

  it("an environment missing from a fully read list has no protection rules", async () => {
    const { report } = await check(
      singleMerge(approvedFinal, [
        deploymentsRoute(sha("7"), [deployment(503, "production", "2026-11-05T12:10:00Z")]),
        statusesRoute(503, [{ id: 9, state: "success", created_at: "2026-11-05T12:12:00Z" }]),
        environmentsRoute({ total_count: 0, environments: [] }),
      ]),
    );
    expect(report.environments[0].status).toBe("not_configured");
    expect(report.merges[0].production_deploy_approval).toBe("not_required");
  });

  it("no deployments recorded: says exactly that, with the other-tools caveat", async () => {
    const { report, rec } = await check(singleMerge(approvedFinal, NO_DEPLOYS));
    const m = report.merges[0];
    expect(m.deployments.status).toBe("none_recorded");
    expect(m.deployments.detail).toMatch(/GitHub records no deployment of merge commit 7777777/);
    expect(m.deployments.detail).toMatch(/deploy with another tool will not show deployments here/);
    expect(report.counts.no_deployment_recorded).toBe(1);
    expect(report.summary).toMatch(/GitHub records no deployment of any of them\.$/);
    expect(report.cannot_see.join("\n")).toMatch(/tools that do not create GitHub deployments/);
    // No deployment, so no environment needed reading.
    expect(rec.calls.some((c) => c.url.includes("/environments"))).toBe(false);
  });

  it("403 on deployments is unknown with the HTTP status and permission, never 'no deployments'", async () => {
    const { report } = await check(singleMerge(approvedFinal, [deploymentsRoute(sha("7"), undefined, 403)]));
    const m = report.merges[0];
    expect(m.deployments.status).toBe("unknown");
    expect(m.deployments.http_status).toBe(403);
    expect(report.counts.no_deployment_recorded).toBe(0);
    expect(report.counts.deployments_unknown).toBe(1);
    const u = report.unknowns.find((x) => x.scope === "deployments");
    expect(u?.http_status).toBe(403);
    expect(u?.likely_missing_permission).toBe("deployments: read");
    expect(report.summary).toMatch(/whether they were deployed could not be read \(HTTP 403\)/);
    expect(report.summary).not.toMatch(/no deployment/i);
    expect(report.attention.join("\n")).toMatch(/deployments: read/);
  });

  it("404 on deployments is unknown too", async () => {
    const { report } = await check(singleMerge(approvedFinal, [deploymentsRoute(sha("7"), undefined, 404)]));
    expect(report.merges[0].deployments.status).toBe("unknown");
    expect(report.unknowns.find((x) => x.scope === "deployments")?.http_status).toBe(404);
  });

  it("403 on environments leaves deploy approval unknown, never 'not required'", async () => {
    const { report } = await check(
      singleMerge(approvedFinal, [
        deploymentsRoute(sha("7"), [deployment(504, "production", "2026-11-05T12:10:00Z")]),
        statusesRoute(504, [{ id: 9, state: "success", created_at: "2026-11-05T12:12:00Z" }]),
        environmentsRoute(undefined, 403),
      ]),
    );
    const env = report.environments[0];
    expect(env.status).toBe("unknown");
    expect(env.http_status).toBe(403);
    expect(env.requires_approval).toBeNull();
    expect(report.merges[0].production_deploy_approval).toBe("unknown");
    expect(report.counts.production_approval_not_required).toBe(0);
    const u = report.unknowns.find((x) => x.scope === "environments");
    expect(u?.http_status).toBe(403);
    expect(u?.likely_missing_permission).toBe("actions: read");
    expect(report.summary).toMatch(/whether that needed an approval could not be read/);
    expect(report.remedies.deploy).toBeNull();
  });

  it("403 on a deployment's statuses leaves whether it reached the environment unknown", async () => {
    const { report } = await check(
      singleMerge(approvedFinal, [
        deploymentsRoute(sha("7"), [deployment(505, "production", "2026-11-05T12:10:00Z")]),
        statusesRoute(505, undefined, 403),
        environmentsRoute({ total_count: 1, environments: [PROTECTED_PRODUCTION] }),
      ]),
    );
    const d = report.merges[0].deployments.items[0];
    expect(d.reached).toBe("unknown");
    expect(d.statuses_http_status).toBe(403);
    expect(report.counts.reached_production).toBe(0);
    expect(report.summary).toMatch(/whether they succeeded could not be read \(HTTP 403\)/);
  });

  it("a failed deployment is recorded but does not count as deployed", async () => {
    const { report } = await check(
      singleMerge(approvedFinal, [
        deploymentsRoute(sha("7"), [deployment(506, "production", "2026-11-05T12:10:00Z")]),
        statusesRoute(506, [{ id: 9, state: "failure", created_at: "2026-11-05T12:12:00Z" }]),
        environmentsRoute({ total_count: 1, environments: [PROTECTED_PRODUCTION] }),
      ]),
    );
    expect(report.merges[0].deployments.items[0].reached).toBe("not_reached");
    expect(report.counts.reached_production).toBe(0);
    expect(report.summary).toMatch(/GitHub records deployments of 1 of them, none with a successful status/);
  });

  it("the token is sent only to the API base, and statuses are read from it, not from statuses_url", async () => {
    const { rec } = await check(
      singleMerge(approvedFinal, [
        deploymentsRoute(sha("7"), [{ ...deployment(507, "production", "2026-11-05T12:10:00Z"), statuses_url: "https://evil.test/x" }]),
        statusesRoute(507, [{ id: 9, state: "success", created_at: "2026-11-05T12:12:00Z" }]),
        environmentsRoute({ total_count: 1, environments: [PROTECTED_PRODUCTION] }),
      ]),
    );
    expect(rec.calls.length).toBeGreaterThan(0);
    for (const c of rec.calls) {
      expect(c.url.startsWith(`${API}/repos/acme/widgets/`)).toBe(true);
      expect(c.auth).toBe(`Bearer ${TOKEN}`);
    }
    expect(rec.calls.some((c) => c.url.includes("evil.test"))).toBe(false);
  });
});

// ─── runChangeCheck: whole-scan unknowns ────────────────────────────────────

describe("runChangeCheck — nothing readable", () => {
  it("no token: unknown, no requests, no 'clean' result", async () => {
    const rec = routes([]);
    const report = await runChangeCheck({ repository: REPO, token: "", apiBase: API, fetchImpl: rec.fetchImpl });
    expect(rec.calls).toHaveLength(0);
    expect(report.version).toBe(CHANGE_CHECK_REPORT_VERSION);
    expect(report.merges).toHaveLength(0);
    expect(report.unknowns[0].reason).toBe("no_token");
    expect(report.summary).toMatch(/could not read this repository's merged pull requests \(no GitHub token was supplied\)/);
  });

  it("403 on the pull request list: unknown with the permission, nothing judged", async () => {
    const { report } = await check([{ match: /\/pulls\?state=closed/, status: 403 }]);
    expect(report.merges).toHaveLength(0);
    const u = report.unknowns[0];
    expect(u.scope).toBe("pull_requests");
    expect(u.http_status).toBe(403);
    expect(u.likely_missing_permission).toBe("pull-requests: read");
    expect(report.summary).toMatch(/\(HTTP 403\), so nothing was judged/);
  });

  it("rejects a GITHUB_REPOSITORY that is not owner/repo without any request", async () => {
    const rec = routes([]);
    const report = await runChangeCheck({ repository: "../etc", token: TOKEN, apiBase: API, fetchImpl: rec.fetchImpl });
    expect(rec.calls).toHaveLength(0);
    expect(report.unknowns[0].reason).toBe("invalid_repository");
  });
});

describe("runChangeCheck — a ten-merge scan", () => {
  it("produces the one-sentence summary the README promises", async () => {
    const prs = Array.from({ length: 10 }, (_, i) =>
      pr({ number: i + 1, head: sha("a"), mergeSha: sha(String(i)), mergedAt: `2026-11-0${(i % 9) + 1}T12:00:00Z` }),
    );
    const list: Route[] = [listRoute(prs)];
    for (let i = 0; i < 10; i++) {
      const n = i + 1;
      // #1-#3 have no approval; the rest are approved on the final revision.
      list.push(reviewsRoute(n, n <= 3 ? [] : [review("bob", "APPROVED", sha("a"), "2026-11-01T00:00:00Z")]));
      list.push(detailRoute(n, "bob"));
      // #1-#4 deployed to production.
      list.push(
        deploymentsRoute(sha(String(i)), n <= 4 ? [deployment(600 + n, "production", `2026-11-0${(i % 9) + 1}T13:00:00Z`)] : []),
      );
      list.push(statusesRoute(600 + n, [{ id: 1, state: "success", created_at: "2026-11-09T00:00:00Z" }]));
    }
    list.push(environmentsRoute({ total_count: 1, environments: [UNPROTECTED_PRODUCTION] }));
    const { report } = await check(list);
    expect(report.summary).toBe(
      "3 of the last 10 merges into main had no approval on the code that merged; 4 were deployed to production, " +
        "none through an environment that requires an approval to deploy.",
    );
    expect(report.counts.production_without_final_approval).toBe(3);
  });
});

// ─── step summary ───────────────────────────────────────────────────────────

describe("renderChangeCheckStepSummary", () => {
  it("puts the verdict first, then attention, the table, the settings, and what it can't see", async () => {
    const { report } = await check(
      singleMerge(
        [],
        [
          deploymentsRoute(sha("7"), [deployment(502, "production", "2026-11-05T12:10:00Z")]),
          statusesRoute(502, [{ id: 9, state: "success", created_at: "2026-11-05T12:12:00Z" }]),
          environmentsRoute({ total_count: 1, environments: [UNPROTECTED_PRODUCTION] }),
        ],
      ),
    );
    const md = renderChangeCheckStepSummary(report);
    const order = [
      "## AtlaSent Change Check",
      `**${report.summary.slice(0, 20)}`,
      "### Needs attention",
      "| PR | Title |",
      "### GitHub settings that would close these gaps",
      "### What this can't see",
      "AtlaSent checks the exact change at deploy time: https://www.atlasent.io/production-change-audit",
    ];
    let last = -1;
    for (const marker of order) {
      const at = md.indexOf(marker);
      expect(at, marker).toBeGreaterThan(last);
      last = at;
    }
    expect(md).toMatch(/\| No visible approval \| production: success/);
    expect(md).toMatch(/\| No \(production\) \|/);
  });

  it("escapes untrusted titles and environment names", async () => {
    const evilTitle = "Fix | <script>alert(1)</script>\n[click](javascript:alert(1)) `x` **b**";
    const { report } = await check([
      listRoute([pr({ number: 7, mergeSha: sha("7"), title: evilTitle })]),
      reviewsRoute(7, []),
      detailRoute(7, "bob"),
      deploymentsRoute(sha("7"), [deployment(508, "prod|<img src=x>", "2026-11-05T12:10:00Z", true)]),
      statusesRoute(508, [{ id: 9, state: "success", created_at: "2026-11-05T12:12:00Z" }]),
      environmentsRoute({ total_count: 0, environments: [] }),
    ]);
    const md = renderChangeCheckStepSummary(report);
    expect(md).not.toContain("<script>");
    expect(md).not.toContain("<img");
    expect(md).not.toContain("[click](");
    expect(md).toContain("&lt;script&gt;");
    // Every table row keeps exactly six cell separators: no injected `|`.
    for (const line of md.split("\n").filter((l) => l.startsWith("| [#"))) {
      expect(line.replace(/\\\|/g, "").split("|").length - 1).toBe(6);
    }
  });

  it("says nothing needs attention without claiming the changes were safe", () => {
    const md = renderChangeCheckStepSummary({
      version: CHANGE_CHECK_REPORT_VERSION,
      repository: REPO,
      repository_url: null,
      default_branch: "main",
      requested_count: 10,
      generated_at: "2026-11-10T00:00:00Z",
      limited: false,
      summary: "x",
      merges: [],
      counts: {} as ChangeCheckReport["counts"],
      environments: [],
      attention: [],
      unknowns: [],
      remedies: { merge: null, deploy: null },
      cannot_see: [],
    });
    expect(md).toMatch(/That is not proof the changes were authorized or safe/);
  });
});

describe("escapeMarkdownText", () => {
  it("collapses newlines and escapes cell separators and HTML", () => {
    expect(escapeMarkdownText("a|b\nc<d>")).toBe("a\\|b c&lt;d&gt;");
  });
});
