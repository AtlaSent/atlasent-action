import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitForApprovalResolution, verifyPermit, EnforceError } from "../index";

vi.mock("../transport", () => ({ get: vi.fn(), post: vi.fn() }));

import { get, post } from "../transport";
const mockGet = get as ReturnType<typeof vi.fn>;
const mockPost = post as ReturnType<typeof vi.fn>;

const BASE_CONFIG = {
  apiKey: "ask_test_key",
  apiUrl: "https://api.test",
  approvalId: "apr-1",
  maxWaitMs: 30_000,
};

function resp(status: number, body: unknown) {
  return { status, body: JSON.stringify(body) };
}

/** Default claim-permit mock: not reached by any test that doesn't set up its own. */
function claimResp(body: unknown) {
  return resp(200, body);
}

describe("waitForApprovalResolution", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("throws immediately (fail closed) when no approvalId is supplied", async () => {
    await expect(
      waitForApprovalResolution({ ...BASE_CONFIG, approvalId: "" }),
    ).rejects.toThrow(EnforceError);
  });

  it("polls GET /v1/approvals/:id with the bearer token", async () => {
    mockGet.mockResolvedValueOnce(resp(200, { status: "denied" }));
    await waitForApprovalResolution(BASE_CONFIG);
    expect(mockGet).toHaveBeenCalledWith(
      "https://api.test/v1/approvals/apr-1",
      { Authorization: "Bearer ask_test_key" },
    );
  });

  it("returns approved status with the fresh permit token, claimed via POST claim-permit", async () => {
    mockGet.mockResolvedValueOnce(
      resp(200, { status: "approved", re_evaluation_decision: "allow" }),
    );
    mockPost.mockResolvedValueOnce(
      claimResp({ claimed: true, permit_token: "pt.v4.fresh", re_evaluation_decision: "allow", status: "approved" }),
    );
    const result = await waitForApprovalResolution(BASE_CONFIG);
    expect(result).toEqual({
      status: "approved",
      reEvaluationDecision: "allow",
      permitToken: "pt.v4.fresh",
    });
    expect(mockPost).toHaveBeenCalledWith(
      "https://api.test/v1/approvals/apr-1/claim-permit",
      "{}",
      { Authorization: "Bearer ask_test_key" },
    );
  });

  it("returns approved status with NO permit token honestly when the reevaluation didn't mint one", async () => {
    mockGet.mockResolvedValueOnce(
      resp(200, { status: "approved", re_evaluation_decision: "hold" }),
    );
    mockPost.mockResolvedValueOnce(
      claimResp({ claimed: false, permit_token: null, re_evaluation_decision: "hold", status: "approved" }),
    );
    const result = await waitForApprovalResolution(BASE_CONFIG);
    expect(result.status).toBe("approved");
    expect(result.permitToken).toBeUndefined();
  });

  it("returns approved status with NO permit token when claim-permit reports it already claimed (lost the race to a concurrent poller)", async () => {
    mockGet.mockResolvedValueOnce(resp(200, { status: "approved", re_evaluation_decision: "allow" }));
    mockPost.mockResolvedValueOnce(
      claimResp({ claimed: false, permit_token: null, re_evaluation_decision: "allow", status: "approved" }),
    );
    const result = await waitForApprovalResolution(BASE_CONFIG);
    expect(result.permitToken).toBeUndefined();
  });

  it("fails closed (no permit) rather than throwing when the claim-permit call itself fails", async () => {
    mockGet.mockResolvedValueOnce(resp(200, { status: "approved", re_evaluation_decision: "allow" }));
    mockPost.mockRejectedValueOnce(new Error("ECONNRESET"));
    const result = await waitForApprovalResolution(BASE_CONFIG);
    expect(result.status).toBe("approved");
    expect(result.permitToken).toBeUndefined();
  });

  it("returns a terminal denied/expired status as-is, uninterpreted, and never calls claim-permit", async () => {
    mockGet.mockResolvedValueOnce(resp(200, { status: "denied_by_timeout" }));
    const result = await waitForApprovalResolution(BASE_CONFIG);
    expect(result.status).toBe("denied_by_timeout");
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("keeps polling while status is pending, then claims the permit on the terminal poll", async () => {
    mockGet
      .mockResolvedValueOnce(resp(200, { status: "pending" }))
      .mockResolvedValueOnce(resp(200, { status: "approved" }));
    mockPost.mockResolvedValueOnce(
      claimResp({ claimed: true, permit_token: "pt-x", re_evaluation_decision: "allow", status: "approved" }),
    );

    const p = waitForApprovalResolution(BASE_CONFIG);
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await p;

    expect(result.status).toBe("approved");
    expect(result.permitToken).toBe("pt-x");
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("retries after a transient network error instead of throwing immediately", async () => {
    mockGet
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(resp(200, { status: "denied" }));

    const p = waitForApprovalResolution(BASE_CONFIG);
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await p;

    expect(result.status).toBe("denied");
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("fails closed immediately on 401/403 — auth failures are not transient", async () => {
    mockGet.mockResolvedValueOnce(resp(403, { error: "forbidden" }));
    await expect(waitForApprovalResolution(BASE_CONFIG)).rejects.toThrow(/authentication failed/i);
  });

  it("fails closed immediately on 404 — an unknown approval id is not worth retrying", async () => {
    mockGet.mockResolvedValueOnce(resp(404, { error: "not_found" }));
    await expect(waitForApprovalResolution(BASE_CONFIG)).rejects.toThrow(/not found/i);
  });

  it("throws a timeout error (fail closed) when the deadline elapses with no terminal status", async () => {
    mockGet.mockImplementation(() => Promise.resolve(resp(200, { status: "pending" })));

    const p = waitForApprovalResolution({ ...BASE_CONFIG, maxWaitMs: 4_999 });
    const check = expect(p).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(5_000);
    await check;
  });

  // ── Claim + consume (IMPL-026B claim-time reevaluation) ──────────────────

  const CHANGE_PLAN = { operation: "deploy", revision: "abc123", artifact_ref: "sha256:aa" };
  const IDENTITY = { version: "actor_identity.v1", signature: "runtime-signed" };

  it("approved_awaiting_claim is claimable: claims with the caller-built { actor_identity, change_plan } body", async () => {
    mockGet.mockResolvedValueOnce(
      resp(200, { status: "approved_awaiting_claim", claim_environment: "live" }),
    );
    mockPost.mockResolvedValueOnce(
      claimResp({
        claimed: true,
        permit_token: "pt.v4.claimed",
        re_evaluation_decision: "allow",
        re_evaluation_id: "ev-claim",
        status: "approved",
        execution_hash_expected: "h-claim",
      }),
    );
    const buildClaimBody = vi.fn(async () => ({ actor_identity: IDENTITY, change_plan: CHANGE_PLAN }));

    const result = await waitForApprovalResolution({ ...BASE_CONFIG, buildClaimBody });

    expect(buildClaimBody).toHaveBeenCalledWith({
      status: "approved_awaiting_claim",
      claimEnvironment: "live",
    });
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe("https://api.test/v1/approvals/apr-1/claim-permit");
    expect(JSON.parse(body as string)).toEqual({ actor_identity: IDENTITY, change_plan: CHANGE_PLAN });
    expect(result).toEqual({
      status: "approved_awaiting_claim",
      reEvaluationDecision: "allow",
      permitToken: "pt.v4.claimed",
      executionHashExpected: "h-claim",
      reEvaluationId: "ev-claim",
    });
  });

  it("without buildClaimBody the legacy claim body stays exactly {}", async () => {
    mockGet.mockResolvedValueOnce(resp(200, { status: "approved_awaiting_claim" }));
    mockPost.mockResolvedValueOnce(claimResp({ claimed: true, permit_token: "pt.x" }));
    await waitForApprovalResolution(BASE_CONFIG);
    expect(mockPost.mock.calls[0][1]).toBe("{}");
  });

  it("the claim body is built at claim time, not before (identity minted after the human decides)", async () => {
    mockGet
      .mockResolvedValueOnce(resp(200, { status: "pending" }))
      .mockResolvedValueOnce(resp(200, { status: "approved_awaiting_claim" }));
    mockPost.mockResolvedValueOnce(claimResp({ claimed: true, permit_token: "pt.x", execution_hash_expected: "h" }));
    const buildClaimBody = vi.fn(async () => ({ actor_identity: IDENTITY, change_plan: CHANGE_PLAN }));

    const p = waitForApprovalResolution({ ...BASE_CONFIG, buildClaimBody });
    await vi.advanceTimersByTimeAsync(0);
    expect(buildClaimBody).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000);
    await p;
    expect(buildClaimBody).toHaveBeenCalledTimes(1);
  });

  it("a buildClaimBody failure fails closed with an EnforceError and sends NO claim", async () => {
    mockGet.mockResolvedValueOnce(resp(200, { status: "approved_awaiting_claim" }));
    const buildClaimBody = vi.fn(async () => {
      throw new Error("OIDC token unavailable");
    });
    await expect(waitForApprovalResolution({ ...BASE_CONFIG, buildClaimBody })).rejects.toThrow(
      /could not build the claim body \(OIDC token unavailable\)/,
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("409 change_plan_mismatch: no permit, claimFailure names the code", async () => {
    mockGet.mockResolvedValueOnce(resp(200, { status: "approved_awaiting_claim" }));
    mockPost.mockResolvedValueOnce(
      resp(409, { error: "change_plan_mismatch", message: "plan changed", status: 409 }),
    );
    const result = await waitForApprovalResolution({
      ...BASE_CONFIG,
      buildClaimBody: async () => ({ actor_identity: IDENTITY, change_plan: CHANGE_PLAN }),
    });
    expect(result.permitToken).toBeUndefined();
    expect(result.executionHashExpected).toBeUndefined();
    expect(result.claimFailure).toBe("change_plan_mismatch");
  });

  it("a non-JSON non-200 claim reports the HTTP status as claimFailure", async () => {
    mockGet.mockResolvedValueOnce(resp(200, { status: "approved" }));
    mockPost.mockResolvedValueOnce({ status: 502, body: "bad gateway" });
    const result = await waitForApprovalResolution(BASE_CONFIG);
    expect(result.permitToken).toBeUndefined();
    expect(result.claimFailure).toBe("HTTP 502");
  });

  it("a malformed 200 claim response yields no permit", async () => {
    mockGet.mockResolvedValueOnce(resp(200, { status: "approved" }));
    mockPost.mockResolvedValueOnce({ status: 200, body: "not json" });
    const result = await waitForApprovalResolution(BASE_CONFIG);
    expect(result.permitToken).toBeUndefined();
    expect(result.claimFailure).toBe("malformed_response");
  });

  it("claimed:true with no permit_token is still no permit", async () => {
    mockGet.mockResolvedValueOnce(resp(200, { status: "approved" }));
    mockPost.mockResolvedValueOnce(claimResp({ claimed: true, permit_token: "" }));
    const result = await waitForApprovalResolution(BASE_CONFIG);
    expect(result.permitToken).toBeUndefined();
    expect(result.claimFailure).toBe("not_claimed");
  });

  it("a claim response without execution_hash_expected leaves it undefined (the caller decides it is fatal)", async () => {
    mockGet.mockResolvedValueOnce(resp(200, { status: "approved_awaiting_claim" }));
    mockPost.mockResolvedValueOnce(claimResp({ claimed: true, permit_token: "pt.x" }));
    const result = await waitForApprovalResolution(BASE_CONFIG);
    expect(result.permitToken).toBe("pt.x");
    expect(result.executionHashExpected).toBeUndefined();
  });

  it("revoked is terminal, never claimed", async () => {
    mockGet.mockResolvedValueOnce(resp(200, { status: "revoked" }));
    const buildClaimBody = vi.fn(async () => ({}));
    const result = await waitForApprovalResolution({ ...BASE_CONFIG, buildClaimBody });
    expect(result).toEqual({ status: "revoked", reEvaluationDecision: undefined });
    expect(buildClaimBody).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("end to end: the claimed permit is verified with payload_hash = the claim's execution_hash_expected", async () => {
    mockGet.mockResolvedValueOnce(resp(200, { status: "approved_awaiting_claim" }));
    mockPost
      .mockResolvedValueOnce(
        claimResp({ claimed: true, permit_token: "pt.v4.claimed", execution_hash_expected: "h-claim" }),
      )
      .mockResolvedValueOnce(resp(200, { valid: true, outcome: "verified" }));
    const resolution = await waitForApprovalResolution({
      ...BASE_CONFIG,
      buildClaimBody: async () => ({ actor_identity: IDENTITY, change_plan: CHANGE_PLAN }),
    });

    const vr = await verifyPermit(
      { apiKey: "ask_test_key", apiUrl: "https://api.test", action: "production.deploy", actor: "a", environment: "live" },
      {
        decision: "allow",
        permitToken: resolution.permitToken,
        executionHashExpected: resolution.executionHashExpected,
      },
    );
    expect(vr.verified).toBe(true);
    const [verifyUrl, verifyBody] = mockPost.mock.calls[1];
    expect(verifyUrl).toBe("https://api.test/v1-verify-permit");
    expect(JSON.parse(verifyBody as string)).toMatchObject({
      permit_token: "pt.v4.claimed",
      payload_hash: "h-claim",
      action_type: "production.deploy",
      environment: "live",
    });
  });

  it("end to end: a replayed claimed permit (PERMIT_ALREADY_USED) fails verification closed", async () => {
    mockGet.mockResolvedValueOnce(resp(200, { status: "approved" }));
    mockPost
      .mockResolvedValueOnce(claimResp({ claimed: true, permit_token: "pt.v4.claimed", execution_hash_expected: "h" }))
      .mockResolvedValueOnce(
        resp(200, { valid: false, outcome: "replay_blocked", verify_error_code: "PERMIT_ALREADY_USED" }),
      );
    const resolution = await waitForApprovalResolution(BASE_CONFIG);
    await expect(
      verifyPermit(
        { apiKey: "k", apiUrl: "https://api.test", action: "production.deploy", actor: "a" },
        { decision: "allow", permitToken: resolution.permitToken, executionHashExpected: resolution.executionHashExpected },
      ),
    ).rejects.toMatchObject({ verifyErrorCode: "PERMIT_ALREADY_USED", phase: "verify-permit" });
  });
});
