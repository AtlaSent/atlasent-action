import { describe, expect, it, vi } from "vitest";

// Tests for waitForTerminalDecision() — the compatibility shim over
// @atlasent/enforce's waitForApprovalResolution(), the canonical
// pause-and-resume approval poll (GET /v1-approvals/:id). Prior versions of
// this suite tested a since-removed implementation that polled/streamed
// /v1-evaluate — an endpoint that never existed server-side (see stream.ts's
// header comment). This suite verifies the shim's bridging logic only; the
// real poll mechanics are covered in packages/enforce's own test suite.

vi.mock("@atlasent/enforce", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@atlasent/enforce")>();
  return { ...actual, waitForApprovalResolution: vi.fn() };
});

import { waitForApprovalResolution } from "@atlasent/enforce";
import { waitForTerminalDecision } from "../stream";

const mockResolve = waitForApprovalResolution as ReturnType<typeof vi.fn>;

const BASE_OPTS = {
  apiUrl: "https://api.test",
  apiKey: "ask_test_key",
  evaluationId: "apr-123",
  timeoutMs: 30_000,
  v2Streaming: false,
};

describe("waitForTerminalDecision (pause-and-resume shim)", () => {
  it("delegates to @atlasent/enforce's waitForApprovalResolution with the right args", async () => {
    mockResolve.mockResolvedValueOnce({ status: "denied" });
    await waitForTerminalDecision(BASE_OPTS);
    expect(mockResolve).toHaveBeenCalledWith({
      apiKey: "ask_test_key",
      apiUrl: "https://api.test",
      approvalId: "apr-123",
      maxWaitMs: 30_000,
    });
  });

  it("maps status=approved with a permit token to decision=allow", async () => {
    mockResolve.mockResolvedValueOnce({ status: "approved", permitToken: "pt.v4.fresh" });
    const result = await waitForTerminalDecision(BASE_OPTS);
    expect(result.decision).toBe("allow");
    expect(result.permitToken).toBe("pt.v4.fresh");
  });

  it("maps status=approved with NO permit token to decision=deny (fail closed, never allow without a real token)", async () => {
    mockResolve.mockResolvedValueOnce({ status: "approved" });
    const result = await waitForTerminalDecision(BASE_OPTS);
    expect(result.decision).toBe("deny");
  });

  it("maps status=denied to decision=deny", async () => {
    mockResolve.mockResolvedValueOnce({ status: "denied" });
    const result = await waitForTerminalDecision(BASE_OPTS);
    expect(result.decision).toBe("deny");
  });

  it("maps status=denied_by_timeout to decision=deny", async () => {
    mockResolve.mockResolvedValueOnce({ status: "denied_by_timeout" });
    const result = await waitForTerminalDecision(BASE_OPTS);
    expect(result.decision).toBe("deny");
  });

  it("propagates a thrown timeout/error from waitForApprovalResolution rather than swallowing it", async () => {
    mockResolve.mockRejectedValueOnce(new Error("Approval wait timed out after 30000ms"));
    await expect(waitForTerminalDecision(BASE_OPTS)).rejects.toThrow(/timed out/);
  });

  it("v2Streaming has no effect — still delegates to the same polling implementation", async () => {
    mockResolve.mockResolvedValueOnce({ status: "denied" });
    await waitForTerminalDecision({ ...BASE_OPTS, v2Streaming: true });
    expect(mockResolve).toHaveBeenCalledWith(
      expect.objectContaining({ approvalId: "apr-123" }),
    );
  });
});
