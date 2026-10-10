import { describe, expect, it } from "vitest";
import { verify, denyReasonText, EnforceError } from "../index";
import type { Decision } from "../index";

const allowed: Decision = { decision: "allow" };
const denied: Decision = { decision: "deny", denyReason: "policy violation" };
const held: Decision = { decision: "hold", holdReason: "change window" };
const escalated: Decision = { decision: "escalate" };

describe("verify", () => {
  it("passes through an allow decision without throwing", () => {
    expect(() => verify(allowed)).not.toThrow();
  });

  it("throws EnforceError(verify) on deny with reason", () => {
    const err = getEnforceError(() => verify(denied));
    expect(err.phase).toBe("verify");
    expect(err.message).toContain("policy violation");
    expect(err.decision).toBe(denied);
  });

  it("throws EnforceError(verify) on deny with fallback reason", () => {
    const err = getEnforceError(() => verify({ decision: "deny" }));
    expect(err.message).toContain("no reason provided");
  });

  it("names the deny code when the runtime withholds the reason text", () => {
    // v1-evaluate sends deny_code but omits deny_reason outside its `safe`
    // disclosure tier (ADR-024). Run 38028053605 printed "no reason provided"
    // for ACTOR_NOT_ALLOWED this way.
    const err = getEnforceError(() => verify({ decision: "deny", denyCode: "ACTOR_NOT_ALLOWED" }));
    expect(err.message).toContain("ACTOR_NOT_ALLOWED");
    expect(err.message).not.toContain("no reason provided");
  });

  it("throws EnforceError(verify) on hold with reason", () => {
    const err = getEnforceError(() => verify(held));
    expect(err.phase).toBe("verify");
    expect(err.message).toContain("change window");
  });

  it("throws EnforceError(verify) on hold with fallback reason", () => {
    const err = getEnforceError(() => verify({ decision: "hold" }));
    expect(err.message).toContain("awaiting approval");
  });

  it("throws EnforceError(verify) on escalate", () => {
    const err = getEnforceError(() => verify(escalated));
    expect(err.phase).toBe("verify");
    expect(err.message).toContain("Escalated");
  });

  it("attaches the decision to all non-allow errors", () => {
    for (const d of [denied, held, escalated]) {
      const err = getEnforceError(() => verify(d));
      expect(err.decision).toBe(d);
    }
  });
});

function getEnforceError(fn: () => void): EnforceError {
  try {
    fn();
    throw new Error("Expected EnforceError but nothing was thrown");
  } catch (err) {
    if (err instanceof EnforceError) return err;
    throw err;
  }
}

describe("denyReasonText", () => {
  it("prefers the reason text when the runtime sent it", () => {
    expect(denyReasonText({ denyReason: "Actor not on allow list", denyCode: "ACTOR_NOT_ALLOWED" })).toBe(
      "Actor not on allow list",
    );
  });

  it("falls back to the deny code and says the reason was withheld", () => {
    const text = denyReasonText({ denyCode: "ACTOR_NOT_ALLOWED" });
    expect(text).toContain("ACTOR_NOT_ALLOWED");
    expect(text).toContain("withholds");
  });

  it("says no reason was provided only when neither is present", () => {
    expect(denyReasonText({})).toBe("no reason provided");
    expect(denyReasonText(undefined)).toBe("no reason provided");
  });
});
