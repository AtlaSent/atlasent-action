import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enforce, EnforceError, isBlockedBeforeExecution } from "../index";
import type { Decision } from "../index";

vi.mock("../transport", () => ({ post: vi.fn() }));

import { post } from "../transport";
const mockPost = post as ReturnType<typeof vi.fn>;

const BASE_CONFIG = {
  apiKey: "ask_test_key",
  apiUrl: "https://api.test",
  action: "production.deploy",
  actor: "alice",
};

// Raw API response shapes (snake_case) used for mock HTTP bodies
const ALLOW_RESPONSE = { decision: "allow", evaluation_id: "ev-1", permit_token: "pt-abc" };
const DENY_RESPONSE = { decision: "deny", deny_reason: "policy blocked" };
const VERIFY_OK = { verified: true, outcome: "ok" };

function mockResponse(status: number, body: unknown) {
  mockPost.mockResolvedValueOnce({ status, body: JSON.stringify(body) });
}

/** Queue: evaluate response, then verify-permit response. */
function mockAllow() {
  mockResponse(200, ALLOW_RESPONSE);
  mockResponse(200, VERIFY_OK);
}

describe("enforce — contract invariants", () => {
  beforeEach(() => mockPost.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it("executes fn and returns { result, decision, verifyOutcome } when allow+verified", async () => {
    mockAllow();
    const fn = vi.fn().mockResolvedValue("deployed");
    const out = await enforce(BASE_CONFIG, fn);
    expect(fn).toHaveBeenCalledOnce();
    expect(out.result).toBe("deployed");
    expect(out.decision.decision).toBe("allow");
    expect(out.decision.permitToken).toBe("pt-abc");
    expect(out.verifyOutcome).toBe("ok");
  });

  it("calls evaluate then verify-permit (two POST calls)", async () => {
    mockAllow();
    await enforce(BASE_CONFIG, vi.fn().mockResolvedValue(null));
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockPost.mock.calls[0][0]).toBe("https://api.test/v1-evaluate");
    expect(mockPost.mock.calls[1][0]).toBe("https://api.test/v1-verify-permit");
  });

  it("fn never runs when evaluate throws (network failure)", async () => {
    mockPost.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const fn = vi.fn();
    await expect(enforce(BASE_CONFIG, fn)).rejects.toBeInstanceOf(EnforceError);
    expect(fn).not.toHaveBeenCalled();
  });

  it("fn never runs when evaluate throws (5xx)", async () => {
    mockResponse(500, {});
    const fn = vi.fn();
    await expect(enforce(BASE_CONFIG, fn)).rejects.toBeInstanceOf(EnforceError);
    expect(fn).not.toHaveBeenCalled();
  });

  it("fn never runs when verify throws (deny)", async () => {
    mockResponse(200, DENY_RESPONSE);
    const fn = vi.fn();
    await expect(enforce(BASE_CONFIG, fn)).rejects.toSatisfy(
      (e: EnforceError) => e instanceof EnforceError && e.phase === "verify",
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it("fn never runs when verify throws (hold)", async () => {
    mockResponse(200, { decision: "hold" });
    const fn = vi.fn();
    await expect(enforce(BASE_CONFIG, fn)).rejects.toBeInstanceOf(EnforceError);
    expect(fn).not.toHaveBeenCalled();
  });

  it("fn never runs when verify throws (escalate)", async () => {
    mockResponse(200, { decision: "escalate" });
    const fn = vi.fn();
    await expect(enforce(BASE_CONFIG, fn)).rejects.toBeInstanceOf(EnforceError);
    expect(fn).not.toHaveBeenCalled();
  });

  it("fn never runs when verifyPermit returns verified=false (replay)", async () => {
    mockResponse(200, ALLOW_RESPONSE);
    mockResponse(200, { verified: false, outcome: "permit_consumed" });
    const fn = vi.fn();
    await expect(enforce(BASE_CONFIG, fn)).rejects.toSatisfy(
      (e: EnforceError) => e instanceof EnforceError && e.phase === "verify-permit",
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it("fn never runs when verifyPermit is unreachable", async () => {
    mockResponse(200, ALLOW_RESPONSE);
    mockPost.mockRejectedValueOnce(new Error("ETIMEDOUT"));
    const fn = vi.fn();
    await expect(enforce(BASE_CONFIG, fn)).rejects.toSatisfy(
      (e: EnforceError) => e instanceof EnforceError && e.phase === "verify-permit",
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it("fn never runs when evaluate returns allow but no permit_token", async () => {
    mockResponse(200, { decision: "allow", evaluation_id: "ev-1" }); // no permit_token
    const fn = vi.fn();
    await expect(enforce(BASE_CONFIG, fn)).rejects.toSatisfy(
      (e: EnforceError) =>
        e instanceof EnforceError &&
        e.phase === "verify-permit" &&
        /no permit_token/.test(e.message),
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it("propagates fn errors naturally after a successful allow+verify", async () => {
    mockAllow();
    const boom = new Error("deploy exploded");
    const fn = vi.fn().mockRejectedValue(boom);
    await expect(enforce(BASE_CONFIG, fn)).rejects.toBe(boom);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("error from evaluate phase carries null decision", async () => {
    mockResponse(401, {});
    const fn = vi.fn();
    const err = await enforce(BASE_CONFIG, fn).catch((e: unknown) => e as EnforceError);
    expect(err).toBeInstanceOf(EnforceError);
    expect(err.phase).toBe("evaluate");
    expect(err.decision).toBeNull();
  });

  it("error from verify phase carries the decision", async () => {
    mockResponse(200, DENY_RESPONSE);
    const fn = vi.fn();
    const err = await enforce(BASE_CONFIG, fn).catch((e: unknown) => e as EnforceError);
    expect(err).toBeInstanceOf(EnforceError);
    expect(err.phase).toBe("verify");
    expect(err.decision?.decision).toBe("deny");
  });

  it("error from verify-permit phase carries the decision", async () => {
    mockResponse(200, ALLOW_RESPONSE);
    mockResponse(200, { verified: false, outcome: "permit_expired" });
    const fn = vi.fn();
    const err = await enforce(BASE_CONFIG, fn).catch((e: unknown) => e as EnforceError);
    expect(err).toBeInstanceOf(EnforceError);
    expect(err.phase).toBe("verify-permit");
    expect(err.decision?.decision).toBe("allow");
    expect(err.decision?.permitToken).toBe("pt-abc");
  });
});

// #206: `instanceof EnforceError` is not proof the callback was blocked. The
// README's handler prints "blocked before your function ran" only when
// isBlockedBeforeExecution(err) holds; these pin that classification.
describe("enforce — gate errors vs callback errors (#206)", () => {
  beforeEach(() => mockPost.mockReset());
  afterEach(() => vi.restoreAllMocks());

  /** The README example's catch-block classification, verbatim in logic. */
  function readmeMessage(err: unknown): string {
    if (isBlockedBeforeExecution(err)) {
      return `blocked before your function ran, at ${err.phase}: ${err.message}`;
    }
    if (err instanceof EnforceError) return `your function ran, then failed: ${err.message}`;
    return "other";
  }

  it("a callback that ran and then threw an EnforceError is not classified as blocked", async () => {
    mockAllow();
    const ran: string[] = [];
    const thrown = new EnforceError("callback-side failure", "evaluate");
    const fn = vi.fn(async () => {
      ran.push("effect started");
      throw thrown;
    });

    let caught: unknown;
    try {
      await enforce(BASE_CONFIG, fn);
    } catch (e) {
      caught = e;
    }

    expect(ran).toEqual(["effect started"]);
    expect(caught).toBe(thrown); // propagated unchanged
    expect(isBlockedBeforeExecution(caught)).toBe(false);
    expect((caught as EnforceError).blockedBeforeExecution).toBe(false);
    expect(readmeMessage(caught)).not.toContain("blocked before your function ran");
  });

  it("a nested enforce() gate denial escaping the outer callback is not classified as blocked", async () => {
    // Outer: allow + verified. Inner (inside the callback): deny.
    mockAllow();
    mockResponse(200, DENY_RESPONSE);
    const ran: string[] = [];
    const fn = vi.fn(async () => {
      ran.push("outer effect started");
      return enforce(BASE_CONFIG, async () => "inner");
    });

    let caught: unknown;
    try {
      await enforce(BASE_CONFIG, fn);
    } catch (e) {
      caught = e;
    }

    expect(ran).toEqual(["outer effect started"]);
    expect(caught).toBeInstanceOf(EnforceError);
    expect((caught as EnforceError).phase).toBe("verify");
    expect(isBlockedBeforeExecution(caught)).toBe(false);
    expect(readmeMessage(caught)).not.toContain("blocked before your function ran");
  });

  it.each([
    ["evaluate", () => mockPost.mockRejectedValueOnce(new Error("ECONNREFUSED"))],
    ["verify", () => mockResponse(200, DENY_RESPONSE)],
    [
      "verify-permit",
      () => {
        mockResponse(200, ALLOW_RESPONSE);
        mockResponse(200, { verified: false, outcome: "permit_consumed" });
      },
    ],
  ] as const)("a real gate failure at %s is classified as blocked before execution", async (phase, arrange) => {
    arrange();
    const fn = vi.fn();
    let caught: unknown;
    try {
      await enforce(BASE_CONFIG, fn);
    } catch (e) {
      caught = e;
    }
    expect(fn).not.toHaveBeenCalled();
    expect((caught as EnforceError).phase).toBe(phase);
    expect(isBlockedBeforeExecution(caught)).toBe(true);
    expect((caught as EnforceError).blockedBeforeExecution).toBe(true);
    expect(readmeMessage(caught)).toContain("blocked before your function ran");
  });

  it("an EnforceError constructed outside enforce() is never classified as blocked", () => {
    expect(isBlockedBeforeExecution(new EnforceError("forged", "evaluate"))).toBe(false);
    expect(isBlockedBeforeExecution(new Error("x"))).toBe(false);
    expect(isBlockedBeforeExecution(undefined)).toBe(false);
  });
});
