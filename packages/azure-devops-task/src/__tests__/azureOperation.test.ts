import { describe, expect, it } from "vitest";
import {
  AzureOperationError,
  admissionOperationKey,
  admitAzureOperation,
  deploymentResourceId,
  establishAzureEffect,
  normalizeDeploymentOutcome,
  recordAzureEffect,
  recordNonSuccess,
} from "../azureOperation";

const API = "https://example.supabase.co/functions/v1";
const SUB = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const HASH = "a".repeat(64);
const OP = "11111111-1111-4111-8111-111111111111";
const AT = "22222222-2222-4222-8222-222222222222";
const OBS = "33333333-3333-4333-8333-333333333333";
const CORR = "44444444-4444-4444-8444-444444444444";
const LOCUS = { subscription_id: SUB, resource_group: "rg-prod", deployment_name: "web-42" };

interface Call {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

/** A fetch stub that answers each call from a queue and records what was sent. */
function fakeFetch(responses: Array<{ status: number; body: unknown } | Error>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
      headers: init.headers as Record<string, string>,
    });
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra fetch");
    if (next instanceof Error) throw next;
    const text = typeof next.body === "string" ? next.body : JSON.stringify(next.body);
    return new Response(text, { status: next.status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const admitArgs = {
  apiUrl: API,
  apiKey: "ask_test_x",
  permitToken: "pt.v4.secret-permit",
  actionType: "production.deploy",
  actorId: "alice@contoso.com",
  targetId: "web",
  environment: "live",
  payloadHash: HASH,
  azure: LOCUS,
};

describe("admitAzureOperation", () => {
  it("calls consume-and-admit with provider azure, the Azure locus and a permit-derived key", async () => {
    const f = fakeFetch([{ status: 200, body: { operation_id: OP, attempt_id: AT, decision_id: "req-1" } }]);
    const r = await admitAzureOperation(admitArgs, { fetchImpl: f.impl });
    expect(r).toEqual({ operationId: OP, attemptId: AT, operationKey: admissionOperationKey(admitArgs.permitToken), decisionId: "req-1" });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toBe(`${API}/v1-consequential-operations/consume-and-admit`);
    expect(f.calls[0].headers.Authorization).toBe("Bearer ask_test_x");
    expect(f.calls[0].body).toEqual({
      permit_token: admitArgs.permitToken,
      action_type: "production.deploy",
      actor_id: "alice@contoso.com",
      target_id: "web",
      environment: "live",
      payload_hash: HASH,
      operation_key: admissionOperationKey(admitArgs.permitToken),
      provider: "azure",
      provider_idempotency_key: `azure_deployment:${deploymentResourceId(LOCUS)}`,
      // Only the two locus strings: the deployment name is not a verify input.
      context: { azure: { subscription_id: SUB, resource_group: "rg-prod" } },
    });
  });

  it("derives the operation key from a digest, never the permit itself", () => {
    const key = admissionOperationKey("pt.v4.secret-permit");
    expect(key).toMatch(/^ado-permit:[0-9a-f]{40}$/);
    expect(key).not.toContain("secret");
    expect(admissionOperationKey("pt.v4.secret-permit")).toBe(key);
  });

  it("refuses before any request without a 64-hex payload binding or a deployment name", async () => {
    const f = fakeFetch([]);
    await expect(admitAzureOperation({ ...admitArgs, payloadHash: "" }, { fetchImpl: f.impl })).rejects.toMatchObject({ code: "MISSING_BINDING" });
    await expect(admitAzureOperation({ ...admitArgs, payloadHash: "A".repeat(64) }, { fetchImpl: f.impl })).rejects.toThrow(/64-char/);
    await expect(
      admitAzureOperation({ ...admitArgs, azure: { subscription_id: SUB, resource_group: "rg-prod" } }, { fetchImpl: f.impl }),
    ).rejects.toThrow(/azureDeploymentName/);
    expect(f.calls).toHaveLength(0);
  });

  it("surfaces the runtime's verify_error_code on a refusal, as definite (not unknown)", async () => {
    const f = fakeFetch([
      { status: 403, body: { error: "permit_verification_failed", message: "did not verify", verify_error_code: "AZURE_LOCUS_MISMATCH" } },
    ]);
    const err = (await admitAzureOperation(admitArgs, { fetchImpl: f.impl }).catch((e) => e)) as AzureOperationError;
    expect(err).toBeInstanceOf(AzureOperationError);
    expect(err.code).toBe("AZURE_LOCUS_MISMATCH");
    expect(err.outcomeUnknown).toBe(false);
    expect(err.httpStatus).toBe(403);
    expect(err.message).toContain("did not verify");
  });

  it("reports a lost response, a 503 admission_outcome_unknown, a non-JSON or id-less 200 as outcome unknown", async () => {
    const cases: Array<{ status: number; body: unknown } | Error> = [
      new Error("socket hang up"),
      { status: 503, body: { error: "admission_outcome_unknown", message: "maybe committed" } },
      { status: 200, body: "<html>" },
      { status: 200, body: { operation_id: OP } },
    ];
    for (const c of cases) {
      const f = fakeFetch([c]);
      const err = (await admitAzureOperation(admitArgs, { fetchImpl: f.impl }).catch((e) => e)) as AzureOperationError;
      expect(err).toBeInstanceOf(AzureOperationError);
      expect(err.outcomeUnknown).toBe(true);
      expect(err.code).toBe("ADMISSION_OUTCOME_UNKNOWN");
    }
  });

  it("never echoes the permit token in an error message", async () => {
    const f = fakeFetch([{ status: 400, body: "bad" }]);
    const err = (await admitAzureOperation(admitArgs, { fetchImpl: f.impl }).catch((e) => e)) as Error;
    expect(err.message).not.toContain("secret-permit");
  });
});

describe("recordAzureEffect", () => {
  const args = { apiUrl: API, apiKey: "k", requestId: "req-1", correlationId: CORR.toUpperCase(), waitMs: 60_000, pollMs: 10_000 };
  const obs = (outcome: string, extra: Record<string, unknown> = {}) => ({
    status: 201,
    body: { observation: { id: OBS, outcome, operation_bound: true, reasons: [], ...extra } },
  });

  it("posts the deployment write and the correlation id, and returns a verified, bound observation", async () => {
    const f = fakeFetch([obs("verified")]);
    const r = await recordAzureEffect(args, { fetchImpl: f.impl });
    expect(r.id).toBe(OBS);
    expect(f.calls[0].url).toBe(`${API}/v1-azure-effect-verify`);
    expect(f.calls[0].body).toEqual({
      request_id: "req-1",
      operation_name: "Microsoft.Resources/deployments/write",
      correlation_id: CORR,
    });
  });

  it("keeps asking while unknown, then succeeds", async () => {
    let t = 0;
    const slept: number[] = [];
    const f = fakeFetch([obs("unknown"), obs("unknown"), obs("verified")]);
    const r = await recordAzureEffect(args, {
      fetchImpl: f.impl,
      now: () => t,
      sleep: async (ms) => {
        slept.push(ms);
        t += ms;
      },
    });
    expect(r.id).toBe(OBS);
    expect(f.calls).toHaveLength(3);
    expect(slept).toEqual([10_000, 10_000]);
  });

  it("fails closed on unknown past the wait budget", async () => {
    let t = 0;
    const f = fakeFetch(Array.from({ length: 10 }, () => obs("unknown")));
    const err = (await recordAzureEffect(
      { ...args, waitMs: 25_000 },
      { fetchImpl: f.impl, now: () => t, sleep: async (ms) => void (t += ms) },
    ).catch((e) => e)) as AzureOperationError;
    expect(err.code).toBe("AZURE_EFFECT_UNKNOWN");
    expect(f.calls.length).toBe(4); // t=0, 10s, 20s, 25s
  });

  it("returns a mismatch at once (for the runtime to judge), without polling", async () => {
    const f = fakeFetch([obs("mismatch", { reasons: ["resource_outside_scope"] })]);
    const r = await recordAzureEffect(args, { fetchImpl: f.impl, sleep: async () => {} });
    expect(r).toMatchObject({ id: OBS, outcome: "mismatch" });
    expect(f.calls).toHaveLength(1);
  });

  it("fails on verified-but-unbound, on an unexpected outcome and on a malformed body — without polling", async () => {
    const expectations: Array<[{ status: number; body: unknown }, string]> = [
      [obs("verified", { operation_bound: false }), "AZURE_EFFECT_UNBOUND"],
      [obs("verified", { operation_bound: "true" }), "AZURE_EFFECT_UNBOUND"],
      [obs("success"), "EFFECT_VERIFY_MALFORMED"],
      [{ status: 201, body: { observation: { id: "not-a-uuid", outcome: "verified", operation_bound: true } } }, "EFFECT_VERIFY_MALFORMED"],
      [{ status: 201, body: {} }, "EFFECT_VERIFY_MALFORMED"],
    ];
    for (const [response, code] of expectations) {
      const f = fakeFetch([response]);
      const err = (await recordAzureEffect(args, { fetchImpl: f.impl, sleep: async () => {} }).catch((e) => e)) as AzureOperationError;
      expect(err.code).toBe(code);
      expect(f.calls).toHaveLength(1);
    }
  });

  it("fails on an HTTP error with the runtime's error code, and on a transport error", async () => {
    const f = fakeFetch([{ status: 409, body: { error: "resource_group_not_protected", message: "not selected" } }]);
    await expect(recordAzureEffect(args, { fetchImpl: f.impl })).rejects.toMatchObject({ code: "resource_group_not_protected", httpStatus: 409 });
    const g = fakeFetch([new Error("ECONNRESET")]);
    await expect(recordAzureEffect(args, { fetchImpl: g.impl })).rejects.toMatchObject({ code: "EFFECT_VERIFY_UNREACHABLE" });
  });

  it("refuses a correlation id that is not a GUID before any request", async () => {
    const f = fakeFetch([]);
    await expect(recordAzureEffect({ ...args, correlationId: "nope" }, { fetchImpl: f.impl })).rejects.toMatchObject({ code: "BAD_CORRELATION_ID" });
    expect(f.calls).toHaveLength(0);
  });
});

describe("establishAzureEffect", () => {
  const args = { apiUrl: API, apiKey: "k", operationId: OP, attemptId: AT, observationId: OBS };

  it("sends operation, attempt and observation id, and is established only on succeeded + established", async () => {
    const f = fakeFetch([{ status: 200, body: { operation_id: OP, state: "succeeded", effect_establishment: { verdict: "established", reason: null } } }]);
    const r = await establishAzureEffect(args, { fetchImpl: f.impl });
    expect(r.established).toBe(true);
    expect(f.calls[0].url).toBe(`${API}/v1-consequential-operations/establish-effect`);
    expect(f.calls[0].body).toEqual({ operation_id: OP, attempt_id: AT, azure_observation_id: OBS });
  });

  it("is never established on anything else", async () => {
    const answers: Array<{ status: number; body: unknown } | Error> = [
      { status: 200, body: { state: "submitting", effect_establishment: { verdict: "established" } } },
      { status: 200, body: { state: "succeeded", effect_establishment: { verdict: "unknown" } } },
      { status: 200, body: { state: "succeeded" } },
      { status: 201, body: { state: "succeeded", effect_establishment: { verdict: "established" } } },
      { status: 409, body: { error: "effect_observation_not_admitted", effect_establishment: { verdict: "mismatch", reason: "azure_correlation_has_mismatch_observation" } } },
      { status: 503, body: { error: "unavailable" } },
      { status: 200, body: "not json" },
      new Error("timeout"),
    ];
    for (const a of answers) {
      const r = await establishAzureEffect(args, { fetchImpl: fakeFetch([a]).impl });
      expect(r.established).toBe(false);
    }
    const mm = await establishAzureEffect(args, { fetchImpl: fakeFetch([answers[4]]).impl });
    expect(mm.reason).toBe("azure_correlation_has_mismatch_observation");
  });
});

describe("recordNonSuccess / normalizeDeploymentOutcome", () => {
  it("maps Agent.JobStatus values, and anything unrecognized to unknown", () => {
    expect(normalizeDeploymentOutcome("Succeeded")).toBe("succeeded");
    expect(normalizeDeploymentOutcome("SucceededWithIssues")).toBe("succeeded");
    expect(normalizeDeploymentOutcome("Failed")).toBe("failed");
    expect(normalizeDeploymentOutcome("Canceled")).toBe("unknown");
    expect(normalizeDeploymentOutcome("Skipped")).toBe("unknown");
    expect(normalizeDeploymentOutcome("")).toBe("unknown");
    expect(normalizeDeploymentOutcome(undefined)).toBe("unknown");
  });

  it("records a pipeline-reported failure as unknown, never failure or success", async () => {
    const f = fakeFetch([{ status: 200, body: { state: "submitting" } }]);
    const r = await recordNonSuccess({ apiUrl: API, apiKey: "k", operationId: OP, attemptId: AT, detail: "failed" }, { fetchImpl: f.impl });
    expect(r).toEqual({ status: 200, state: "submitting", recorded: true });
    expect(f.calls[0].url).toBe(`${API}/v1-consequential-operations/record-attempt`);
    expect(f.calls[0].body).toMatchObject({ operation_id: OP, attempt_id: AT, outcome: "unknown" });
    expect(f.calls[0].body.observation).toMatchObject({ pipeline_reported_outcome: "failed" });
  });

  it("counts the outcome as recorded only on HTTP 200", async () => {
    for (const a of [{ status: 201, body: {} }, { status: 409, body: {} }, { status: 500, body: {} }, new Error("x")] as const) {
      const r = await recordNonSuccess(
        { apiUrl: API, apiKey: "k", operationId: OP, attemptId: AT, detail: "failed" },
        { fetchImpl: fakeFetch([a as never]).impl },
      );
      expect(r.recorded).toBe(false);
    }
  });
});
