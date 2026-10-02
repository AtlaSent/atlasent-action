import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluate, verifyPermit, waitForApprovalResolution } from "../index";

vi.mock("../transport", () => ({ get: vi.fn(), post: vi.fn() }));

import { get, post } from "../transport";
const mockPost = post as ReturnType<typeof vi.fn>;
const mockGet = get as ReturnType<typeof vi.fn>;

const HOSTED = "https://kttccumlnmdtupgbyfue.supabase.co/functions/v1";
const SELF_HOSTED = "https://api.test";

const BASE = { apiKey: "ask_test_key", action: "production.deploy", actor: "alice" };

function allow() {
  mockPost.mockResolvedValueOnce({
    status: 200,
    body: JSON.stringify({ decision: "allow", request_id: "ev-1", permit_token: "pt-1" }),
  });
}

describe("region header on runtime requests", () => {
  const savedEnv = process.env.ATLASENT_FUNCTION_REGION;
  beforeEach(() => {
    mockPost.mockReset();
    mockGet.mockReset();
    delete process.env.ATLASENT_FUNCTION_REGION;
  });
  afterEach(() => {
    if (savedEnv === undefined) delete process.env.ATLASENT_FUNCTION_REGION;
    else process.env.ATLASENT_FUNCTION_REGION = savedEnv;
  });

  it("evaluate pins the hosted runtime to us-west-1 and keeps Authorization", async () => {
    allow();
    await evaluate({ ...BASE, apiUrl: HOSTED });
    const [url, , headers] = mockPost.mock.calls[0];
    expect(url).toBe(`${HOSTED}/v1-evaluate`);
    expect(headers).toEqual({ Authorization: "Bearer ask_test_key", "x-region": "us-west-1" });
  });

  it("evaluate sends exactly the old headers to a self-hosted runtime (compatibility)", async () => {
    allow();
    await evaluate({ ...BASE, apiUrl: SELF_HOSTED });
    expect(mockPost.mock.calls[0][2]).toEqual({ Authorization: "Bearer ask_test_key" });
  });

  it("the region never changes the request body", async () => {
    allow();
    await evaluate({ ...BASE, apiUrl: HOSTED });
    allow();
    await evaluate({ ...BASE, apiUrl: HOSTED, functionRegion: "auto" });
    expect(mockPost.mock.calls[0][1]).toBe(mockPost.mock.calls[1][1]);
    expect(mockPost.mock.calls[1][2]).toEqual({ Authorization: "Bearer ask_test_key" });
  });

  it("config.functionRegion overrides the environment variable", async () => {
    process.env.ATLASENT_FUNCTION_REGION = "us-east-1";
    allow();
    await evaluate({ ...BASE, apiUrl: HOSTED, functionRegion: "eu-west-1" });
    expect(mockPost.mock.calls[0][2]["x-region"]).toBe("eu-west-1");
  });

  it("the environment variable applies when config does not set a region", async () => {
    process.env.ATLASENT_FUNCTION_REGION = "us-east-1";
    allow();
    await evaluate({ ...BASE, apiUrl: SELF_HOSTED });
    expect(mockPost.mock.calls[0][2]["x-region"]).toBe("us-east-1");
  });

  it("a malformed region fails closed before any request is sent", async () => {
    await expect(evaluate({ ...BASE, apiUrl: HOSTED, functionRegion: "US-WEST-1" })).rejects.toThrow();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("verify-permit carries the same header", async () => {
    mockPost.mockResolvedValueOnce({
      status: 200,
      body: JSON.stringify({ verified: true, valid: true, outcome: "verified" }),
    });
    await verifyPermit({ ...BASE, apiUrl: HOSTED }, {
      decision: "allow",
      evaluationId: "ev-1",
      permitToken: "pt-1",
    });
    const [url, , headers] = mockPost.mock.calls[0];
    expect(url).toBe(`${HOSTED}/v1-verify-permit`);
    expect(headers["x-region"]).toBe("us-west-1");
    expect(headers.Authorization).toBe("Bearer ask_test_key");
  });

  it("the approval poll carries the same header", async () => {
    mockGet.mockResolvedValueOnce({ status: 200, body: JSON.stringify({ status: "rejected" }) });
    await waitForApprovalResolution({
      apiKey: "ask_test_key",
      apiUrl: HOSTED,
      approvalId: "ap-1",
      maxWaitMs: 1_000,
    }).catch(() => undefined);
    const [url, headers] = mockGet.mock.calls[0];
    expect(url).toBe(`${HOSTED}/v1/approvals/ap-1`);
    expect(headers).toEqual({ Authorization: "Bearer ask_test_key", "x-region": "us-west-1" });
  });
});
