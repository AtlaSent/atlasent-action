import { describe, expect, it, vi } from "vitest";
import {
  GITHUB_ACTIONS_OIDC_AUDIENCE,
  WORKLOAD_IDENTITY_REQUEST_TIMEOUT_MS,
  WorkloadIdentityError,
  apiKeyCredentialReference,
  mintGithubActionsActorIdentity,
  mintSupplyChainAssertion,
  SUPPLY_CHAIN_OIDC_AUDIENCE,
} from "../workloadIdentity";

const ENV = {
  ACTIONS_ID_TOKEN_REQUEST_URL: "https://oidc.actions.example/token?api-version=1",
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: "request-secret",
};

const ASSERTION = {
  version: "actor_identity.v1",
  subject: { principal_id: "github-actions:123:workflow", principal_kind: "workload" },
};

const SOURCE = {
  issuer: "https://token.actions.githubusercontent.com" as const,
  repository: "AtlaSent-Systems-Inc/app",
  repository_id: "123",
  ref: "refs/heads/main",
  sha: "abc123",
  workflow_ref: "AtlaSent-Systems-Inc/app/.github/workflows/deploy.yml@refs/heads/main",
  actor: "bettyc925",
  actor_id: "112233",
  run_id: "778899",
  run_attempt: "1",
  environment: "production",
};

function okFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://oidc.actions.example/token")) {
      expect(new URL(url).searchParams.get("audience")).toBe(GITHUB_ACTIONS_OIDC_AUDIENCE);
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        "Bearer request-secret",
      );
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify({ value: "header.payload.signature" }));
    }
    expect(url).toBe("https://runtime.example/functions/v1/v1-idp-broker/mint/actor-identity");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer ask_live_key");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init?.body))).toEqual({
      provider: "github_actions",
      id_token: "header.payload.signature",
      action_type: "production.deploy",
      environment: "production",
    });
    return new Response(
      JSON.stringify({
        kind: "actor_identity.v1",
        actor_id: "github-actions:123:workflow",
        assertion: ASSERTION,
        source: SOURCE,
      }),
    );
  });
}

describe("mintGithubActionsActorIdentity", () => {
  it("derives a stable one-way API-key credential reference", () => {
    expect(apiKeyCredentialReference("ask_live_key")).toBe("sha256:5869162d91fd769f");
  });

  it("exchanges the job OIDC token for a runtime-minted assertion", async () => {
    const fetchImpl = okFetch();
    const masked: string[] = [];
    const result = await mintGithubActionsActorIdentity(
      {
        apiUrl: "https://runtime.example/functions/v1/",
        apiKey: "ask_live_key",
        actionType: "production.deploy",
        environment: "production",
      },
      { fetchImpl: fetchImpl as typeof fetch, env: ENV, mask: (value) => masked.push(value) },
    );

    expect(result).toEqual({
      actorId: "github-actions:123:workflow",
      assertion: ASSERTION,
      source: SOURCE,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(masked).toEqual(["request-secret", "header.payload.signature"]);
  });

  it("uses a bounded timeout for both workload-identity network requests", async () => {
    expect(WORKLOAD_IDENTITY_REQUEST_TIMEOUT_MS).toBe(30_000);
    const fetchImpl = okFetch();

    await mintGithubActionsActorIdentity(
      {
        apiUrl: "https://runtime.example/functions/v1",
        apiKey: "ask_live_key",
        actionType: "production.deploy",
        environment: "production",
      },
      { fetchImpl: fetchImpl as typeof fetch, env: ENV },
    );

    for (const [, init] of fetchImpl.mock.calls) {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("fails closed with a permission hint when GitHub does not expose OIDC", async () => {
    await expect(
      mintGithubActionsActorIdentity(
        {
          apiUrl: "https://runtime.example/functions/v1",
          apiKey: "k",
          actionType: "production.deploy",
          environment: "production",
        },
        { fetchImpl: vi.fn() as unknown as typeof fetch, env: {} },
      ),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof WorkloadIdentityError && error.message.includes("id-token: write"),
    );
  });

  it("fails closed when GitHub rejects the token request", async () => {
    const fetchImpl = vi.fn(async () => new Response("forbidden", { status: 403 }));
    await expect(
      mintGithubActionsActorIdentity(
        {
          apiUrl: "https://runtime.example/functions/v1",
          apiKey: "k",
          actionType: "production.deploy",
          environment: "production",
        },
        { fetchImpl: fetchImpl as typeof fetch, env: ENV },
      ),
    ).rejects.toThrow(/GitHub OIDC token request failed \(HTTP 403\)/);
  });

  it("fails closed when the broker rejects the verified job binding", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: "jwt" })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "github_actions_binding_mismatch" }), { status: 403 }),
      );
    await expect(
      mintGithubActionsActorIdentity(
        {
          apiUrl: "https://runtime.example/functions/v1",
          apiKey: "k",
          actionType: "production.deploy",
          environment: "production",
        },
        { fetchImpl: fetchImpl as typeof fetch, env: ENV },
      ),
    ).rejects.toThrow(/binding_mismatch/);
  });

  it("identifies the exact key safely when the broker mint scope is missing", async () => {
    const apiKey = "ask_test_secret-value-that-must-not-be-logged";
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: "jwt" })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "insufficient_scope",
            message: "Missing permission: idp_broker:mint",
            status: 403,
          }),
          { status: 403 },
        ),
      );

    let error: unknown;
    try {
      await mintGithubActionsActorIdentity(
        {
          apiUrl: "https://runtime.example/functions/v1",
          apiKey,
          actionType: "production.deploy",
          environment: "staging",
        },
        { fetchImpl: fetchImpl as typeof fetch, env: ENV },
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(WorkloadIdentityError);
    const message = (error as Error).message;
    expect(message).toContain(apiKeyCredentialReference(apiKey));
    expect(message).toContain("grant only idp_broker:mint");
    expect(message).not.toContain(apiKey);
    expect(message).not.toContain(apiKey.slice(0, 12));
  });

  it("rejects a malformed successful broker response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: "jwt" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ actor_id: "caller-value" })));
    await expect(
      mintGithubActionsActorIdentity(
        {
          apiUrl: "https://runtime.example/functions/v1",
          apiKey: "k",
          actionType: "production.deploy",
          environment: "production",
        },
        { fetchImpl: fetchImpl as typeof fetch, env: ENV },
      ),
    ).rejects.toThrow(/invalid actor_identity\.v1 response/);
  });
});

describe("mintSupplyChainAssertion", () => {
  const DIGEST = "sha256:" + "a".repeat(64);
  const SC_ASSERTION = {
    schema: "assertion.v1", class: "supply_chain",
    subject: { type: "resource", ref: "npm:@acme/widget" },
    claim: { artifact_digest: DIGEST },
  };
  const args = { apiUrl: "https://runtime.example/functions/v1/", apiKey: "ask_live_key", artifactDigest: "A".repeat(64), resourceId: "npm:@acme/widget", environment: "production" };

  function scFetch(response: unknown, status = 200) {
    const calls: Array<{ url: string; body?: unknown }> = [];
    const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://oidc.actions.example/token")) {
        calls.push({ url });
        return new Response(JSON.stringify({ value: "sc.token.sig" }));
      }
      calls.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(response), { status });
    });
    return { f, calls };
  }

  it("requests a token with the supply_chain audience (never the actor-identity one) and posts the normalized digest", async () => {
    const { f, calls } = scFetch({ kind: "supply_chain_assertion.v1", assertion: SC_ASSERTION });
    const masked: string[] = [];
    const a = await mintSupplyChainAssertion(args, { fetchImpl: f as typeof fetch, env: ENV, mask: (v) => masked.push(v) });
    expect(a).toEqual(SC_ASSERTION);
    expect(new URL(calls[0].url).searchParams.get("audience")).toBe(SUPPLY_CHAIN_OIDC_AUDIENCE);
    expect(SUPPLY_CHAIN_OIDC_AUDIENCE).not.toBe(GITHUB_ACTIONS_OIDC_AUDIENCE);
    expect(calls[1].url).toBe("https://runtime.example/functions/v1/v1-supply-chain-assertion");
    expect(calls[1].body).toEqual({ id_token: "sc.token.sig", artifact_digest: DIGEST, resource_id: "npm:@acme/widget", environment: "production" });
    expect(masked).toContain("sc.token.sig");
  });

  it.each([
    ["another resource", { ...SC_ASSERTION, subject: { type: "resource", ref: "npm:@acme/other" } }],
    ["another digest", { ...SC_ASSERTION, claim: { artifact_digest: "sha256:" + "b".repeat(64) } }],
    ["another class", { ...SC_ASSERTION, class: "risk" }],
  ])("refuses an assertion for %s", async (_n, assertion) => {
    const { f } = scFetch({ kind: "supply_chain_assertion.v1", assertion });
    await expect(mintSupplyChainAssertion(args, { fetchImpl: f as typeof fetch, env: ENV })).rejects.toBeInstanceOf(WorkloadIdentityError);
  });

  it("surfaces the issuer's refusal", async () => {
    const { f } = scFetch({ error: "provenance_unverified", message: "no attestation for this digest" }, 422);
    await expect(mintSupplyChainAssertion(args, { fetchImpl: f as typeof fetch, env: ENV })).rejects.toThrow(/HTTP 422.*no attestation for this digest/);
  });

  it("refuses before any network call without a sha256 digest, a resource, or OIDC", async () => {
    const { f } = scFetch({});
    await expect(mintSupplyChainAssertion({ ...args, artifactDigest: "md5:x" }, { fetchImpl: f as typeof fetch, env: ENV })).rejects.toThrow(/sha256/);
    await expect(mintSupplyChainAssertion({ ...args, resourceId: " " }, { fetchImpl: f as typeof fetch, env: ENV })).rejects.toThrow(/target-id/);
    await expect(mintSupplyChainAssertion(args, { fetchImpl: f as typeof fetch, env: {} })).rejects.toThrow(/id-token: write/);
    expect(f).not.toHaveBeenCalled();
  });
});
