import { describe, expect, it, vi } from "vitest";
import {
  GithubApprovalMintError,
  buildApprovalQuorum,
  mintGithubApprovalArtifacts,
} from "../githubApprovalMint";
import type { ApprovalSigningHint } from "@atlasent/enforce";

const HINT: ApprovalSigningHint = {
  assertion_type: "approval_artifact.v1",
  bind: { action_hash: "hash-abc", tenant_id: "org-1", environment: "production" },
};

const BASE_ARGS = {
  apiUrl: "https://runtime.example/functions/v1",
  apiKey: "ask_test_key",
  repository: "acme/widgets",
  pullRequestNumber: 7,
  actionType: "production.deploy",
  hint: HINT,
  evaluationId: "eval-123",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("mintGithubApprovalArtifacts", () => {
  it("posts the correct body and returns reviewers + artifacts on success", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://runtime.example/functions/v1/v1-github-approval-mint");
      expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer ask_test_key");
      expect(JSON.parse(String(init?.body))).toEqual({
        evaluation_id: "eval-123",
        repository: "acme/widgets",
        pull_request_number: 7,
        action_type: "production.deploy",
        action_hash: "hash-abc",
        environment: "production",
      });
      return jsonResponse(200, {
        reviewers: ["alice", "bob"],
        artifacts: [{ version: "approval_artifact.v1", reviewer: { principal_id: "github:alice" } }],
      });
    });

    const result = await mintGithubApprovalArtifacts(BASE_ARGS, { fetchImpl: fetchImpl as typeof fetch });
    expect(result.reviewers).toEqual(["alice", "bob"]);
    expect(result.artifacts).toHaveLength(1);
  });

  it("includes resource_id when supplied", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))["resource_id"]).toBe("svc-api");
      return jsonResponse(200, { reviewers: ["alice"], artifacts: [{ version: "approval_artifact.v1" }] });
    });
    await mintGithubApprovalArtifacts(
      { ...BASE_ARGS, resourceId: "svc-api" },
      { fetchImpl: fetchImpl as typeof fetch },
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("strips a trailing slash from apiUrl", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("https://runtime.example/functions/v1/v1-github-approval-mint");
      return jsonResponse(200, { reviewers: [], artifacts: [{ version: "approval_artifact.v1" }] });
    });
    await mintGithubApprovalArtifacts(
      { ...BASE_ARGS, apiUrl: "https://runtime.example/functions/v1/" },
      { fetchImpl: fetchImpl as typeof fetch },
    );
  });

  it("throws GithubApprovalMintError when the endpoint is unreachable", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(
      mintGithubApprovalArtifacts(BASE_ARGS, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(GithubApprovalMintError);
  });

  it("throws GithubApprovalMintError with the server's message on a non-2xx response", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(422, { error: "no_qualifying_approvals", message: "no distinct approving reviewer" }),
    );
    await expect(
      mintGithubApprovalArtifacts(BASE_ARGS, { fetchImpl: fetchImpl as typeof fetch }),
    ).rejects.toSatisfy(
      (e) => e instanceof GithubApprovalMintError && e.message.includes("no distinct approving reviewer"),
    );
  });

  it("throws GithubApprovalMintError on a non-2xx response with a non-JSON body", async () => {
    const fetchImpl = vi.fn(async () => new Response("gateway timeout", { status: 504 }));
    await expect(
      mintGithubApprovalArtifacts(BASE_ARGS, { fetchImpl: fetchImpl as typeof fetch }),
    ).rejects.toSatisfy(
      (e) => e instanceof GithubApprovalMintError && e.message.includes("gateway timeout"),
    );
  });

  it("throws GithubApprovalMintError on a non-JSON 200 response", async () => {
    const fetchImpl = vi.fn(async () => new Response("not-json", { status: 200 }));
    await expect(
      mintGithubApprovalArtifacts(BASE_ARGS, { fetchImpl: fetchImpl as typeof fetch }),
    ).rejects.toBeInstanceOf(GithubApprovalMintError);
  });

  it("throws GithubApprovalMintError when the response carries zero artifacts", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { reviewers: [], artifacts: [] }));
    await expect(
      mintGithubApprovalArtifacts(BASE_ARGS, { fetchImpl: fetchImpl as typeof fetch }),
    ).rejects.toBeInstanceOf(GithubApprovalMintError);
  });
});

describe("buildApprovalQuorum", () => {
  it("builds an honest quorum envelope bound to the hint, required_count matching the artifact count", () => {
    const artifacts = [{ version: "approval_artifact.v1" }, { version: "approval_artifact.v1" }];
    const quorum = buildApprovalQuorum(HINT, artifacts);
    expect(quorum["version"]).toBe("approval_quorum.v1");
    expect(quorum["tenant_id"]).toBe("org-1");
    expect(quorum["action_hash"]).toBe("hash-abc");
    expect(quorum["environment"]).toBe("production");
    expect((quorum["policy"] as Record<string, unknown>)["required_count"]).toBe(2);
    expect(quorum["approvals"]).toEqual(artifacts);
    expect(typeof quorum["issued_at"]).toBe("string");
  });
});

describe("mintGithubApprovalArtifacts edge-function region", () => {
  const saved = process.env.ATLASENT_FUNCTION_REGION;
  const restore = () => {
    if (saved === undefined) delete process.env.ATLASENT_FUNCTION_REGION;
    else process.env.ATLASENT_FUNCTION_REGION = saved;
  };

  async function headersFor(apiUrl: string): Promise<Record<string, string>> {
    let seen: Record<string, string> = {};
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen = init?.headers as Record<string, string>;
      return jsonResponse(200, { reviewers: [], artifacts: [] });
    });
    await mintGithubApprovalArtifacts({ ...BASE_ARGS, apiUrl }, { fetchImpl: fetchImpl as typeof fetch }).catch(
      () => undefined,
    );
    return seen;
  }

  it("pins the hosted runtime to us-west-1", async () => {
    delete process.env.ATLASENT_FUNCTION_REGION;
    try {
      const h = await headersFor("https://kttccumlnmdtupgbyfue.supabase.co/functions/v1");
      expect(h["x-region"]).toBe("us-west-1");
      expect(h["Authorization"]).toBe("Bearer ask_test_key");
    } finally {
      restore();
    }
  });

  it("leaves a self-hosted runtime unpinned unless configured", async () => {
    delete process.env.ATLASENT_FUNCTION_REGION;
    try {
      expect((await headersFor(BASE_ARGS.apiUrl))["x-region"]).toBeUndefined();
      process.env.ATLASENT_FUNCTION_REGION = "eu-west-1";
      expect((await headersFor(BASE_ARGS.apiUrl))["x-region"]).toBe("eu-west-1");
    } finally {
      restore();
    }
  });
});
