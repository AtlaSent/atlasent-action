import { describe, expect, it } from "vitest";
import {
  ExecutionAdmissionError,
  admissionOperationKey,
  admitExecution,
  establishDeployEffect,
  findDeploymentForJob,
} from "../executionAdmission";

const API = "https://rt.example.supabase.co/functions/v1";
const HASH = "a".repeat(64);
const HEAD = "b".repeat(40);
const BASE = "c".repeat(40);

type Call = { url: string; method: string; body: Record<string, unknown> | null };

function fakeFetch(handler: (c: Call) => { status: number; body?: unknown }, calls: Call[]): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => {
    const c: Call = {
      url: String(url),
      method: init?.method ?? "GET",
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
    };
    calls.push(c);
    const r = handler(c);
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status });
  }) as typeof fetch;
}

const admitArgs = {
  apiUrl: API,
  apiKey: "ask_test_x",
  permitToken: "pt.v3.secret",
  actionType: "production.deploy",
  actorId: "github-actions:repo:1:workflow:acme/app/.github/workflows/deploy.yml@refs/heads/main",
  targetId: "service:payments",
  environment: "production",
  payloadHash: HASH,
  runId: "123456",
  executorActorIdentity: { version: "actor_identity.v1" },
};

describe("admitExecution", () => {
  it("consumes + admits with the run commitment and a permit-derived key, never sending a hash of anything else", async () => {
    const calls: Call[] = [];
    const r = await admitExecution(admitArgs, {
      fetchImpl: fakeFetch(() => ({ status: 200, body: { operation_id: "op-1", attempt_id: "att-1", decision_id: "d-1" } }), calls),
    });
    expect(r).toMatchObject({ operationId: "op-1", attemptId: "att-1", decisionId: "d-1" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${API}/v1-consequential-operations/consume-and-admit`);
    expect(calls[0].body).toMatchObject({
      permit_token: "pt.v3.secret",
      action_type: "production.deploy",
      target_id: "service:payments",
      environment: "production",
      payload_hash: HASH,
      provider: "github_actions",
      provider_idempotency_key: "github_actions_run:123456",
      operation_key: admissionOperationKey("pt.v3.secret"),
      executor_actor_identity: { version: "actor_identity.v1" },
    });
    expect(String(calls[0].body?.operation_key)).not.toContain("secret");
  });

  it("is deterministic per permit and distinct across permits", () => {
    expect(admissionOperationKey("p1")).toBe(admissionOperationKey("p1"));
    expect(admissionOperationKey("p1")).not.toBe(admissionOperationKey("p2"));
  });

  it("refuses before any call when the payload binding is absent or malformed", async () => {
    const calls: Call[] = [];
    for (const payloadHash of ["", `sha256:${HASH}`, "ABC"]) {
      await expect(
        admitExecution({ ...admitArgs, payloadHash }, { fetchImpl: fakeFetch(() => ({ status: 200 }), calls) }),
      ).rejects.toBeInstanceOf(ExecutionAdmissionError);
    }
    expect(calls).toHaveLength(0);
  });

  it("a refusal (e.g. replay) fails closed with the runtime's code, outcome known", async () => {
    const err = await admitExecution(admitArgs, {
      fetchImpl: fakeFetch(() => ({ status: 403, body: { error_code: "permit_verification_failed", message: "PERMIT_ALREADY_USED" } }), []),
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ExecutionAdmissionError);
    expect(err.outcomeUnknown).toBe(false);
    expect(err.message).toContain("PERMIT_ALREADY_USED");
  });

  it("admission_outcome_unknown and transport loss are reported as UNKNOWN, never as refused-and-safe-to-retry", async () => {
    const e1 = await admitExecution(admitArgs, {
      fetchImpl: fakeFetch(() => ({ status: 503, body: { error_code: "admission_outcome_unknown" } }), []),
    }).catch((e) => e);
    expect(e1.outcomeUnknown).toBe(true);
    const e2 = await admitExecution(admitArgs, {
      fetchImpl: (async () => {
        throw new Error("socket hang up");
      }) as unknown as typeof fetch,
    }).catch((e) => e);
    expect(e2.outcomeUnknown).toBe(true);
  });

  it("a 200 without both identifiers is not an admission", async () => {
    const err = await admitExecution(admitArgs, {
      fetchImpl: fakeFetch(() => ({ status: 200, body: { operation_id: "op-1" } }), []),
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ExecutionAdmissionError);
  });
});

// ── GitHub world for effect establishment ────────────────────────────────

function world(opts: {
  jobs?: Array<{ id: number; name: string }>;
  deployments?: Array<{ id: number; statuses: string[] }>;
  establish?: Array<{ status: number; body: unknown }>;
  recordAttempt?: { status: number; body: unknown };
}, calls: Call[]) {
  let establishIdx = 0;
  return fakeFetch((c) => {
    if (c.url.includes("/actions/runs/123456/jobs")) return { status: 200, body: { jobs: opts.jobs ?? [] } };
    if (/\/deployments\?/.test(c.url)) return { status: 200, body: (opts.deployments ?? []).map((d) => ({ id: d.id })) };
    const m = /\/deployments\/(\d+)\/statuses/.exec(c.url);
    if (m) {
      const d = (opts.deployments ?? []).find((x) => x.id === Number(m[1]));
      return { status: 200, body: (d?.statuses ?? []).map((u) => ({ log_url: u })) };
    }
    if (c.url.endsWith("/establish-effect")) {
      const list = opts.establish ?? [];
      const r = list[Math.min(establishIdx++, list.length - 1)];
      return r;
    }
    if (c.url.endsWith("/record-attempt")) return opts.recordAttempt ?? { status: 200, body: { state: "failed" } };
    return { status: 599 };
  }, calls);
}

const establishArgs = {
  apiUrl: API,
  apiKey: "ask_test_x",
  githubToken: "ghs_x",
  repository: "acme/app",
  runId: "123456",
  operationId: "op-1",
  attemptId: "att-1",
  deployJobResult: "success",
  deployJobName: "deploy",
  githubEnvironment: "production",
  baseSha: BASE,
  headSha: HEAD,
  retryDelaysMs: [1, 1, 1],
  sleep: async () => {},
};

const JOBS = [
  { id: 900, name: "gate" },
  { id: 901, name: "deploy" },
];
const job = (id: number) => `https://github.com/acme/app/actions/runs/123456/job/${id}`;

describe("findDeploymentForJob", () => {
  it("picks only the deployment whose status names THIS run's deploy job, not the gate's", async () => {
    const id = await findDeploymentForJob(establishArgs, {
      fetchImpl: world({ jobs: JOBS, deployments: [{ id: 1, statuses: [job(900)] }, { id: 2, statuses: [job(901)] }] }, []),
    });
    expect(id).toBe("2");
  });

  it("refuses when no deployment, or more than one, names the job", async () => {
    await expect(
      findDeploymentForJob(establishArgs, { fetchImpl: world({ jobs: JOBS, deployments: [{ id: 1, statuses: [job(900)] }] }, []) }),
    ).rejects.toBeInstanceOf(ExecutionAdmissionError);
    await expect(
      findDeploymentForJob(establishArgs, {
        fetchImpl: world({ jobs: JOBS, deployments: [{ id: 1, statuses: [job(901)] }, { id: 2, statuses: [job(901)] }] }, []),
      }),
    ).rejects.toBeInstanceOf(ExecutionAdmissionError);
  });

  it("refuses an ambiguous job name", async () => {
    await expect(
      findDeploymentForJob(establishArgs, {
        fetchImpl: world({ jobs: [...JOBS, { id: 902, name: "deploy" }], deployments: [] }, []),
      }),
    ).rejects.toBeInstanceOf(ExecutionAdmissionError);
  });
});

describe("establishDeployEffect", () => {
  it("established only when the runtime answers 200 + succeeded; sends lookup hints and the plan", async () => {
    const calls: Call[] = [];
    const r = await establishDeployEffect(establishArgs, {
      fetchImpl: world({
        jobs: JOBS,
        deployments: [{ id: 2, statuses: [job(901)] }],
        establish: [{ status: 200, body: { state: "succeeded", effect_establishment: { verdict: "established" } } }],
      }, calls),
    });
    expect(r).toMatchObject({ established: true, state: "succeeded", deploymentId: "2" });
    const post = calls.find((c) => c.url.endsWith("/establish-effect"))!;
    expect(post.body).toEqual({
      operation_id: "op-1",
      attempt_id: "att-1",
      deployment_id: "2",
      run_id: "123456",
      verified_plan: { repository: "acme/app", base_sha: BASE, head_sha: HEAD, ref: null },
    });
  });

  it("retries while GitHub has not posted a terminal status, then reports established", async () => {
    const calls: Call[] = [];
    const r = await establishDeployEffect(establishArgs, {
      fetchImpl: world({
        jobs: JOBS,
        deployments: [{ id: 2, statuses: [job(901)] }],
        establish: [
          { status: 409, body: { effect_establishment: { reason: "deployment_in_progress:queued" } } },
          { status: 200, body: { state: "succeeded" } },
        ],
      }, calls),
    });
    expect(r.established).toBe(true);
    expect(calls.filter((c) => c.url.endsWith("/establish-effect"))).toHaveLength(2);
  });

  it("a mismatch is final, not retried, and never established", async () => {
    const calls: Call[] = [];
    const r = await establishDeployEffect(establishArgs, {
      fetchImpl: world({
        jobs: JOBS,
        deployments: [{ id: 2, statuses: [job(901)] }],
        establish: [{ status: 409, body: { state: "submitting", effect_establishment: { reason: "head_sha_mismatch" } } }],
      }, calls),
    });
    expect(r.established).toBe(false);
    expect(r.reason).toBe("head_sha_mismatch");
    expect(calls.filter((c) => c.url.endsWith("/establish-effect"))).toHaveLength(1);
  });

  it("a 200 whose state is not succeeded is not established", async () => {
    const r = await establishDeployEffect(establishArgs, {
      fetchImpl: world({ jobs: JOBS, deployments: [{ id: 2, statuses: [job(901)] }], establish: [{ status: 200, body: { state: "failed" } }] }, []),
    });
    expect(r.established).toBe(false);
  });

  it("a failed deploy job is recorded as failure without any GitHub lookup or establish call", async () => {
    const calls: Call[] = [];
    const r = await establishDeployEffect({ ...establishArgs, deployJobResult: "failure" }, {
      fetchImpl: world({ recordAttempt: { status: 200, body: { state: "failed" } } }, calls),
    });
    expect(r.established).toBe(false);
    expect(calls.map((c) => c.url.split("/").pop())).toEqual(["record-attempt"]);
    expect(calls[0].body).toMatchObject({ outcome: "failure" });
  });

  it("a cancelled deploy job is recorded as unknown, never failure or success", async () => {
    const calls: Call[] = [];
    await establishDeployEffect({ ...establishArgs, deployJobResult: "cancelled" }, {
      fetchImpl: world({ recordAttempt: { status: 200, body: { state: "unknown" } } }, calls),
    });
    expect(calls[0].body).toMatchObject({ outcome: "unknown" });
  });
});

describe("establishDeployEffect plan ref", () => {
  it("presents the brief's ref so the runtime recomputes the same plan digest", async () => {
    const calls: Call[] = [];
    await establishDeployEffect({ ...establishArgs, ref: "refs/heads/main" }, {
      fetchImpl: world({ jobs: JOBS, deployments: [{ id: 2, statuses: [job(901)] }], establish: [{ status: 200, body: { state: "succeeded" } }] }, calls),
    });
    const post = calls.find((c) => c.url.endsWith("/establish-effect"))!;
    expect((post.body!.verified_plan as Record<string, unknown>).ref).toBe("refs/heads/main");
  });
});
