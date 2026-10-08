import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reverifyPermit, verifyPermit, evaluate, EnforceError } from "../index";
import type { Decision, EnforceConfig } from "../index";

vi.mock("../transport", () => ({ post: vi.fn() }));
import { post } from "../transport";
const mockPost = post as ReturnType<typeof vi.fn>;

const CONFIG: EnforceConfig = {
  apiKey: "ask_test_key",
  apiUrl: "https://api.test",
  action: "production.deploy",
  actor: "github:github-actions[bot]",
  environment: "production",
  targetId: "service:hello-safeguard",
  executionPayloadHash: "sha256:artifact-A",
};

function resp(status: number, body: unknown) {
  mockPost.mockResolvedValueOnce({ status, body: JSON.stringify(body) });
}
function lastBody(): Record<string, unknown> {
  const call = mockPost.mock.calls[mockPost.mock.calls.length - 1];
  return JSON.parse(call[1] as string) as Record<string, unknown>;
}

describe("execution-boundary verification (B3/B4)", () => {
  beforeEach(() => mockPost.mockReset());
  afterEach(() => vi.restoreAllMocks());

  // ── artifact digest is a canonical evaluate input ──────────────────────────
  it("evaluate sends the artifact digest as top-level execution_payload_hash", async () => {
    resp(200, { decision: "allow", permit_token: "pt-1" });
    await evaluate(CONFIG);
    const body = lastBody();
    expect(body.execution_payload_hash).toBe("sha256:artifact-A");
    // never buried in context/presentation
    expect((body.context as Record<string, unknown>).execution_payload_hash).toBeUndefined();
  });

  // ── verify re-binds environment + artifact digest at the boundary ──────────
  it("reverifyPermit re-binds environment + payload_hash + target at verify", async () => {
    resp(200, { valid: true, outcome: "verified" });
    await reverifyPermit(CONFIG, "pt-1");
    const body = lastBody();
    expect(body.permit_token).toBe("pt-1");
    expect(body.action_type).toBe("production.deploy");
    expect(body.environment).toBe("production");
    expect(body.payload_hash).toBe("sha256:artifact-A");
    expect(body.target_id).toBe("service:hello-safeguard");
  });

  // ── commit-point principal binding (atlasent-api#3915) ────────────────────
  it("re-presents the runtime-minted actor_identity at verify, as given", async () => {
    const actorIdentity = { version: "actor_identity.v1", subject: { actor_id: "agent:a1" }, signature: "sig" };
    resp(200, { valid: true, outcome: "verified" });
    await reverifyPermit({ ...CONFIG, actorIdentity }, "pt-1");
    expect(lastBody().actor_identity).toEqual(actorIdentity);

    resp(200, { valid: true, outcome: "verified" });
    await verifyPermit({ ...CONFIG, actorIdentity }, { decision: "allow", permitToken: "pt-2" } as Decision);
    expect(lastBody().actor_identity).toEqual(actorIdentity);
  });

  it("sends no actor_identity at verify when the caller has none", async () => {
    resp(200, { valid: true, outcome: "verified" });
    await reverifyPermit(CONFIG, "pt-1");
    expect("actor_identity" in lastBody()).toBe(false);
  });

  it("an ACTOR_IDENTITY_REQUIRED refusal from verify fails closed", async () => {
    resp(200, { valid: false, outcome: "invalid", verify_error_code: "ACTOR_IDENTITY_REQUIRED" });
    await expect(reverifyPermit(CONFIG, "pt-1")).rejects.toBeInstanceOf(EnforceError);
  });

  // ── reads the runtime `valid` field (not the legacy `verified`) ────────────
  it("treats runtime {valid:true} as verified", async () => {
    resp(200, {
      valid: true,
      outcome: "verified",
      audit_entry_hash: "decision-audit-hash",
      verify_audit_hash: "verification-audit-hash",
    });
    const r = await reverifyPermit(CONFIG, "pt-1");
    expect(r.verified).toBe(true);
    expect(r.outcome).toBe("verified");
    expect(r.auditHash).toBe("decision-audit-hash");
    expect(r.verifyAuditHash).toBe("verification-audit-hash");
  });

  it("still accepts the legacy {verified:true} field", async () => {
    resp(200, { verified: true, outcome: "ok" });
    const r = await reverifyPermit(CONFIG, "pt-1");
    expect(r.verified).toBe(true);
  });

  // ── THE artifact-substitution attack: evaluate A, execute B → fail closed ──
  it("blocks an altered artifact (PAYLOAD_MISMATCH) at the boundary", async () => {
    // runtime rejects because the presented payload_hash != the bound one
    resp(200, { valid: false, outcome: "mismatch", verify_error_code: "PAYLOAD_MISMATCH", mismatch_fields: ["payload_hash"] });
    const err = await reverifyPermit({ ...CONFIG, executionPayloadHash: "sha256:artifact-B" }, "pt-1")
      .catch((e: unknown) => e as EnforceError);
    expect(err).toBeInstanceOf(EnforceError);
    expect(err.phase).toBe("verify-permit");
    expect(err.outcome).toBe("mismatch");
    expect(err.verifyErrorCode).toBe("PAYLOAD_MISMATCH");
    expect(err.mismatchFields).toEqual(["payload_hash"]);
  });

  // ── wrong environment → fail closed ────────────────────────────────────────
  it("blocks a wrong-environment permit (ENVIRONMENT_MISMATCH)", async () => {
    resp(200, { valid: false, outcome: "mismatch", verify_error_code: "ENVIRONMENT_MISMATCH", mismatch_fields: ["environment"] });
    const err = await reverifyPermit({ ...CONFIG, environment: "staging" }, "pt-1").catch((e: unknown) => e as EnforceError);
    expect(err.verifyErrorCode).toBe("ENVIRONMENT_MISMATCH");
  });

  // ── missing / expired / replayed → fail closed ─────────────────────────────
  it("fails closed with MISSING_PERMIT when no token is presented", async () => {
    const err = await reverifyPermit(CONFIG, "").catch((e: unknown) => e as EnforceError);
    expect(err.verifyErrorCode).toBe("MISSING_PERMIT");
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("blocks an expired permit (PERMIT_EXPIRED)", async () => {
    resp(200, { valid: false, outcome: "expired", verify_error_code: "PERMIT_EXPIRED" });
    const err = await reverifyPermit(CONFIG, "pt-1").catch((e: unknown) => e as EnforceError);
    expect(err.outcome).toBe("expired");
    expect(err.verifyErrorCode).toBe("PERMIT_EXPIRED");
  });

  it("blocks a replayed permit (PERMIT_ALREADY_USED / replay_blocked)", async () => {
    resp(200, { valid: false, outcome: "replay_blocked", verify_error_code: "PERMIT_ALREADY_USED" });
    const err = await reverifyPermit(CONFIG, "pt-1").catch((e: unknown) => e as EnforceError);
    expect(err.outcome).toBe("replay_blocked");
    expect(err.verifyErrorCode).toBe("PERMIT_ALREADY_USED");
  });

  // ── verifyPermit (gate path) also surfaces the code + reads valid ──────────
  it("verifyPermit surfaces verify_error_code and reads valid", async () => {
    resp(200, { valid: false, outcome: "mismatch", verify_error_code: "PAYLOAD_MISMATCH" });
    const decision: Decision = { decision: "allow", permitToken: "pt-1" };
    const err = await verifyPermit(CONFIG, decision).catch((e: unknown) => e as EnforceError);
    expect(err.verifyErrorCode).toBe("PAYLOAD_MISMATCH");
    expect(err.outcome).toBe("mismatch");
  });
});
