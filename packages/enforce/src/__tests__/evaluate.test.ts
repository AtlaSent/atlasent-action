import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluate, EnforceError } from "../index";

vi.mock("../transport", () => ({ post: vi.fn() }));

import { post } from "../transport";
const mockPost = post as ReturnType<typeof vi.fn>;

const BASE_CONFIG = {
  apiKey: "ask_test_key",
  apiUrl: "https://api.test",
  action: "production.deploy",
  actor: "alice",
};

function mockResponse(status: number, body: unknown) {
  mockPost.mockResolvedValueOnce({ status, body: JSON.stringify(body) });
}

describe("evaluate", () => {
  beforeEach(() => mockPost.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it("returns a mapped Decision on a 200 allow response", async () => {
    // request_id is the REAL /v1-evaluate wire field (see v1-evaluate/handler.ts's
    // `return json({ ..., request_id: effectiveRequestId, ... })` — confirmed by
    // direct source read). evaluation_id is never a key on the HTTP response body,
    // only an internal DB column name — see #130.
    mockResponse(200, {
      decision: "allow",
      request_id: "ev-1",
      permit_token: "pt-abc",
      proof_hash: "ph-xyz",
      risk_score: 12,
    });
    const d = await evaluate(BASE_CONFIG);
    expect(d.decision).toBe("allow");
    expect(d.evaluationId).toBe("ev-1");
    expect(d.permitToken).toBe("pt-abc");
    expect(d.proofHash).toBe("ph-xyz");
    expect(d.riskScore).toBe(12);
  });

  it("falls back to evaluation_id when request_id is absent (defensive, not the real wire shape)", async () => {
    mockResponse(200, { decision: "allow", evaluation_id: "ev-legacy" });
    const d = await evaluate(BASE_CONFIG);
    expect(d.evaluationId).toBe("ev-legacy");
  });

  it("prefers request_id over evaluation_id when both are present", async () => {
    mockResponse(200, { decision: "allow", request_id: "ev-real", evaluation_id: "ev-legacy" });
    const d = await evaluate(BASE_CONFIG);
    expect(d.evaluationId).toBe("ev-real");
  });

  it("maps canonical risk shape { risk: { score } }", async () => {
    mockResponse(200, { decision: "allow", risk: { score: 77 } });
    const d = await evaluate(BASE_CONFIG);
    expect(d.riskScore).toBe(77);
  });

  it("returns undefined riskScore when neither shape is present", async () => {
    mockResponse(200, { decision: "deny", deny_reason: "blocked" });
    const d = await evaluate(BASE_CONFIG);
    expect(d.riskScore).toBeUndefined();
  });

  it("maps deny_code and remediation from the evaluate response", async () => {
    mockResponse(200, {
      decision: "deny",
      deny_reason: "environment_mismatch",
      deny_code: "ENVIRONMENT_MISMATCH",
      remediation: {
        summary: "Use a matching key.",
        how_to: ["step one", "step two"],
        docs: "https://example.com/deny-codes.md",
      },
    });
    const d = await evaluate(BASE_CONFIG);
    expect(d.denyCode).toBe("ENVIRONMENT_MISMATCH");
    expect(d.remediation?.summary).toBe("Use a matching key.");
    expect(d.remediation?.how_to).toEqual(["step one", "step two"]);
    expect(d.remediation?.docs).toBe("https://example.com/deny-codes.md");
  });

  it("threads target_id into both top-level and context", async () => {
    mockResponse(200, { decision: "allow" });
    await evaluate({ ...BASE_CONFIG, targetId: "svc-prod" });
    const body = JSON.parse(mockPost.mock.calls[0][1] as string) as Record<string, unknown>;
    expect(body["target_id"]).toBe("svc-prod");
    expect((body["context"] as Record<string, unknown>)["target_id"]).toBe("svc-prod");
  });

  it("forwards a runtime-minted actor_identity.v1 as a top-level field", async () => {
    mockResponse(200, { decision: "allow" });
    const actorIdentity = {
      version: "actor_identity.v1",
      subject: { principal_id: "github-actions:123:deploy", principal_kind: "workload" },
      signature: "signed-by-runtime-broker",
    };
    await evaluate({ ...BASE_CONFIG, actorIdentity });
    const body = JSON.parse(mockPost.mock.calls[0][1] as string) as Record<string, unknown>;
    expect(body["actor_identity"]).toEqual(actorIdentity);
  });

  it("forwards assertions and resource_id as top-level fields, and omits them when absent", async () => {
    mockResponse(200, { decision: "allow" });
    const assertion = { schema: "assertion.v1", class: "supply_chain", subject: { type: "resource", ref: "npm:@acme/widget" } };
    await evaluate({ ...BASE_CONFIG, assertions: [assertion], resourceId: "npm:@acme/widget" });
    const body = JSON.parse(mockPost.mock.calls[0][1] as string) as Record<string, unknown>;
    expect(body["assertions"]).toEqual([assertion]);
    expect(body["resource_id"]).toBe("npm:@acme/widget");
    expect((body["context"] as Record<string, unknown>)["assertions"]).toBeUndefined();

    mockResponse(200, { decision: "allow" });
    await evaluate({ ...BASE_CONFIG, assertions: [] });
    const bare = JSON.parse(mockPost.mock.calls[1][1] as string) as Record<string, unknown>;
    expect("assertions" in bare).toBe(false);
    expect("resource_id" in bare).toBe(false);
  });

  it("forwards change_plan as a top-level field", async () => {
    mockResponse(200, { decision: "allow" });
    const changePlan = {
      operation: "deploy",
      revision: "775689f3648121b21ccc1641ebfdd5938bcbd827",
      artifact_ref: "sha256:artifact",
    };
    await evaluate({ ...BASE_CONFIG, changePlan });
    const body = JSON.parse(mockPost.mock.calls[0][1] as string) as Record<string, unknown>;
    expect(body["change_plan"]).toEqual(changePlan);
    expect((body["context"] as Record<string, unknown>)["change_plan"]).toBeUndefined();
  });

  it("forwards evidence_profile as a top-level field, distinct from change_plan", async () => {
    mockResponse(200, { decision: "allow" });
    const evidenceProfile = {
      kind: "control_override",
      control_id: "waf-rule-442",
      override_scope: "inbound traffic only, api.example.com",
      reason: "Active incident INC-1029.",
      expires_at: "2026-08-30T13:00:00Z",
    };
    await evaluate({ ...BASE_CONFIG, evidenceProfile });
    const body = JSON.parse(mockPost.mock.calls[0][1] as string) as Record<string, unknown>;
    expect(body["evidence_profile"]).toEqual(evidenceProfile);
    expect(body["change_plan"]).toBeUndefined();
    expect((body["context"] as Record<string, unknown>)["evidence_profile"]).toBeUndefined();
  });

  it("throws EnforceError(evaluate) on network error", async () => {
    mockPost.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(evaluate(BASE_CONFIG)).rejects.toSatisfy(
      (e: EnforceError) => e instanceof EnforceError && e.phase === "evaluate",
    );
  });

  it.each([500, 502, 503])("throws EnforceError(evaluate) on HTTP %i", async (status) => {
    mockResponse(status, {});
    await expect(evaluate(BASE_CONFIG)).rejects.toSatisfy(
      (e: EnforceError) => e instanceof EnforceError && e.phase === "evaluate",
    );
  });

  it("throws EnforceError(evaluate) on 401", async () => {
    mockResponse(401, {});
    await expect(evaluate(BASE_CONFIG)).rejects.toSatisfy(
      (e: EnforceError) => e instanceof EnforceError && e.message.includes("Authentication failed"),
    );
  });

  it("throws EnforceError(evaluate) on 429", async () => {
    mockResponse(429, {});
    await expect(evaluate(BASE_CONFIG)).rejects.toSatisfy(
      (e: EnforceError) => e instanceof EnforceError && e.message.includes("Rate limited"),
    );
  });

  it("throws EnforceError(evaluate) on non-JSON body", async () => {
    mockPost.mockResolvedValueOnce({ status: 200, body: "not-json" });
    await expect(evaluate(BASE_CONFIG)).rejects.toSatisfy(
      (e: EnforceError) => e instanceof EnforceError && e.message.includes("Non-JSON"),
    );
  });

  it("hits the correct endpoint", async () => {
    mockResponse(200, { decision: "allow" });
    await evaluate(BASE_CONFIG);
    expect(mockPost.mock.calls[0][0]).toBe("https://api.test/v1-evaluate");
  });

  it("sends Authorization header with the api key", async () => {
    mockResponse(200, { decision: "allow" });
    await evaluate(BASE_CONFIG);
    expect((mockPost.mock.calls[0][2] as Record<string, string>)["Authorization"]).toBe(
      "Bearer ask_test_key",
    );
  });

  it("strips trailing slash from apiUrl", async () => {
    mockResponse(200, { decision: "allow" });
    await evaluate({ ...BASE_CONFIG, apiUrl: "https://api.test/" });
    expect(mockPost.mock.calls[0][0]).toBe("https://api.test/v1-evaluate");
  });

  // ── State transition context forwarding ────────────────────────────────────

  it("forwards current_state and proposed_state as top-level POST body fields", async () => {
    mockResponse(200, { decision: "allow" });
    await evaluate({
      ...BASE_CONFIG,
      current_state: { description: "running v1.2", attributes: { sha: "abc" } },
      proposed_state: { description: "running v1.3", attributes: { sha: "def" } },
    });
    const body = JSON.parse(mockPost.mock.calls[0][1] as string) as Record<string, unknown>;
    expect(body["current_state"]).toEqual({ description: "running v1.2", attributes: { sha: "abc" } });
    expect(body["proposed_state"]).toEqual({ description: "running v1.3", attributes: { sha: "def" } });
  });

  it("forwards resource as top-level field and omits target_id when resource is set", async () => {
    mockResponse(200, { decision: "allow" });
    await evaluate({
      ...BASE_CONFIG,
      resource: { type: "database", id: "prod-db", attributes: { region: "us-east-1" } },
    });
    const body = JSON.parse(mockPost.mock.calls[0][1] as string) as Record<string, unknown>;
    expect(body["resource"]).toEqual({ type: "database", id: "prod-db", attributes: { region: "us-east-1" } });
    expect(body["target_id"]).toBeUndefined();
  });

  it("falls back to target_id when resource is absent (backward compat)", async () => {
    mockResponse(200, { decision: "allow" });
    await evaluate({ ...BASE_CONFIG, targetId: "svc-legacy" });
    const body = JSON.parse(mockPost.mock.calls[0][1] as string) as Record<string, unknown>;
    expect(body["target_id"]).toBe("svc-legacy");
    expect(body["resource"]).toBeUndefined();
  });

  it("forwards execution_binding as a top-level POST body field", async () => {
    mockResponse(200, { decision: "allow" });
    await evaluate({
      ...BASE_CONFIG,
      execution_binding: { kind: "supabase-migration", adapter_version: "1.0.0", resource_id: "prod-db" },
    });
    const body = JSON.parse(mockPost.mock.calls[0][1] as string) as Record<string, unknown>;
    expect(body["execution_binding"]).toEqual({
      kind: "supabase-migration",
      adapter_version: "1.0.0",
      resource_id: "prod-db",
    });
  });

  // ── Response field extraction ──────────────────────────────────────────────

  it("surfaces risk_class and authority_basis from the response", async () => {
    mockResponse(200, {
      decision: "allow",
      risk_class: "high",
      authority_basis: { kind: "quorum", reference: "qr-001", granted_by: "approver@org" },
    });
    const d = await evaluate(BASE_CONFIG);
    expect(d.risk_class).toBe("high");
    expect(d.authority_basis).toEqual({ kind: "quorum", reference: "qr-001", granted_by: "approver@org" });
  });

  it("surfaces escalation_id from a hold response", async () => {
    mockResponse(200, {
      decision: "hold",
      hold_reason: "awaiting quorum",
      escalation_id: "esc-abc123",
    });
    const d = await evaluate(BASE_CONFIG);
    expect(d.decision).toBe("hold");
    expect(d.escalation_id).toBe("esc-abc123");
  });

  it("leaves risk_class, authority_basis, escalation_id undefined when absent", async () => {
    mockResponse(200, { decision: "allow" });
    const d = await evaluate(BASE_CONFIG);
    expect(d.risk_class).toBeUndefined();
    expect(d.authority_basis).toBeUndefined();
    expect(d.escalation_id).toBeUndefined();
  });

  // atlasent-api's v1-evaluate/v1-verify-permit handlers emit `audit_entry_hash`
  // (see the `...(auditEntryHash && { audit_entry_hash: auditEntryHash })` spread
  // in handler.ts) — there is no `audit_hash` field on the real response. Reading
  // only `audit_hash` left the `audit-hash` action output permanently empty in
  // production. `audit_hash` stays accepted as a fallback for any older/other
  // build that might still emit it.
  it("maps the real wire field audit_entry_hash to auditHash", async () => {
    mockResponse(200, { decision: "allow", audit_entry_hash: "sha256:real-hash" });
    const d = await evaluate(BASE_CONFIG);
    expect(d.auditHash).toBe("sha256:real-hash");
  });

  it("falls back to legacy audit_hash when audit_entry_hash is absent", async () => {
    mockResponse(200, { decision: "allow", audit_hash: "sha256:legacy-hash" });
    const d = await evaluate(BASE_CONFIG);
    expect(d.auditHash).toBe("sha256:legacy-hash");
  });

  it("prefers audit_entry_hash over audit_hash when both are present", async () => {
    mockResponse(200, {
      decision: "allow",
      audit_entry_hash: "sha256:real-hash",
      audit_hash: "sha256:legacy-hash",
    });
    const d = await evaluate(BASE_CONFIG);
    expect(d.auditHash).toBe("sha256:real-hash");
  });

  // ── quorum / approval forwarding ───────────────────────────────────────────

  it("forwards quorum as a top-level field", async () => {
    mockResponse(200, { decision: "allow" });
    const quorum = { version: "approval_quorum.v1", tenant_id: "org-1", action_hash: "h", environment: "production", policy: { required_count: 1 }, approvals: [] };
    await evaluate({ ...BASE_CONFIG, quorum });
    const body = JSON.parse(mockPost.mock.calls[0][1] as string) as Record<string, unknown>;
    expect(body["quorum"]).toEqual(quorum);
  });

  it("forwards approval as a top-level field", async () => {
    mockResponse(200, { decision: "allow" });
    const approval = { artifact: { version: "approval_artifact.v1" } };
    await evaluate({ ...BASE_CONFIG, approval });
    const body = JSON.parse(mockPost.mock.calls[0][1] as string) as Record<string, unknown>;
    expect(body["approval"]).toEqual(approval);
  });

  // ── ADR-055 two-call acceptance lane (onInsufficientApprovals retry) ──────

  const SIGNING_HINT = {
    assertion_type: "approval_artifact.v1",
    bind: { action_hash: "hash-abc", tenant_id: "org-1", environment: "production" },
  };

  it("retries once with the callback's quorum on an INSUFFICIENT_APPROVALS deny carrying a signing_hint, passing the deny's own evaluationId", async () => {
    mockResponse(200, {
      decision: "deny",
      deny_code: "INSUFFICIENT_APPROVALS",
      signing_hint: SIGNING_HINT,
      request_id: "ev-1",
    });
    mockResponse(200, { decision: "allow", permit_token: "pt-retry" });

    const onInsufficientApprovals = vi.fn().mockResolvedValue({
      version: "approval_quorum.v1",
      approvals: [{ version: "approval_artifact.v1" }],
    });

    const d = await evaluate({ ...BASE_CONFIG, onInsufficientApprovals });

    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(onInsufficientApprovals).toHaveBeenCalledWith(SIGNING_HINT, "ev-1");
    expect(d.decision).toBe("allow");
    expect(d.permitToken).toBe("pt-retry");
    const secondBody = JSON.parse(mockPost.mock.calls[1][1] as string) as Record<string, unknown>;
    expect((secondBody["quorum"] as Record<string, unknown>)["version"]).toBe("approval_quorum.v1");
  });

  it("passes evaluationId as undefined to the callback when the deny response carries no request_id/evaluation_id", async () => {
    mockResponse(200, {
      decision: "deny",
      deny_code: "INSUFFICIENT_APPROVALS",
      signing_hint: SIGNING_HINT,
    });
    const onInsufficientApprovals = vi.fn().mockResolvedValue(undefined);

    await evaluate({ ...BASE_CONFIG, onInsufficientApprovals });

    expect(onInsufficientApprovals).toHaveBeenCalledWith(SIGNING_HINT, undefined);
  });

  it("returns the original deny, unretried, when the callback resolves to undefined", async () => {
    mockResponse(200, {
      decision: "deny",
      deny_code: "INSUFFICIENT_APPROVALS",
      deny_reason: "no reviewers found",
      signing_hint: SIGNING_HINT,
    });
    const onInsufficientApprovals = vi.fn().mockResolvedValue(undefined);

    const d = await evaluate({ ...BASE_CONFIG, onInsufficientApprovals });

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(d.decision).toBe("deny");
    expect(d.denyReason).toBe("no reviewers found");
  });

  it("returns the original deny, unretried, when the callback throws", async () => {
    mockResponse(200, {
      decision: "deny",
      deny_code: "INSUFFICIENT_APPROVALS",
      signing_hint: SIGNING_HINT,
    });
    const onInsufficientApprovals = vi.fn().mockRejectedValue(new Error("mint unreachable"));

    const d = await evaluate({ ...BASE_CONFIG, onInsufficientApprovals });

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(d.decision).toBe("deny");
  });

  it("never retries a deny with a different deny_code", async () => {
    mockResponse(200, {
      decision: "deny",
      deny_code: "ENVIRONMENT_MISMATCH",
      signing_hint: SIGNING_HINT,
    });
    const onInsufficientApprovals = vi.fn();

    await evaluate({ ...BASE_CONFIG, onInsufficientApprovals });

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(onInsufficientApprovals).not.toHaveBeenCalled();
  });

  it("never retries INSUFFICIENT_APPROVALS when no signing_hint is present", async () => {
    mockResponse(200, { decision: "deny", deny_code: "INSUFFICIENT_APPROVALS" });
    const onInsufficientApprovals = vi.fn();

    await evaluate({ ...BASE_CONFIG, onInsufficientApprovals });

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(onInsufficientApprovals).not.toHaveBeenCalled();
  });

  it("never calls the callback when no callback is configured", async () => {
    mockResponse(200, {
      decision: "deny",
      deny_code: "INSUFFICIENT_APPROVALS",
      signing_hint: SIGNING_HINT,
    });

    const d = await evaluate(BASE_CONFIG);

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(d.decision).toBe("deny");
  });

  it("retries at most once even if the retried response is itself an unretried-shape INSUFFICIENT_APPROVALS deny", async () => {
    // The retry call strips onInsufficientApprovals from config, so even a
    // second INSUFFICIENT_APPROVALS+signing_hint response cannot trigger a
    // second retry — this proves the guard, not just the happy path.
    mockResponse(200, {
      decision: "deny",
      deny_code: "INSUFFICIENT_APPROVALS",
      signing_hint: SIGNING_HINT,
    });
    mockResponse(200, {
      decision: "deny",
      deny_code: "INSUFFICIENT_APPROVALS",
      signing_hint: SIGNING_HINT,
    });
    const onInsufficientApprovals = vi.fn().mockResolvedValue({ version: "approval_quorum.v1" });

    const d = await evaluate({ ...BASE_CONFIG, onInsufficientApprovals });

    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(onInsufficientApprovals).toHaveBeenCalledTimes(1);
    expect(d.decision).toBe("deny");
  });
});
