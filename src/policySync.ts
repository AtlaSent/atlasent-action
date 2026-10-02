// AtlaSent Policy Sync — HTTP client for v1-policy-sync.
//
// Posts a policy bundle JSON file to the policy sync endpoint.
// Supports dry-run (preview diff) and live apply modes.
// CI fails when the sync run is rejected or fails validation.

import * as fs from "fs";
import * as path from "path";
import { functionRegionHeaders } from "@atlasent/enforce";

export interface PolicyBundleEntry {
  name: string;
  body: string;
  description?: string;
  tags?: string[];
}

export type PolicySyncStatus =
  | "pending"
  | "validating"
  | "applying"
  | "completed"
  | "failed"
  | "rejected";

export interface PolicySyncRun {
  id: string;
  org_id: string;
  source: string;
  commit_sha?: string;
  ref?: string;
  bundle_hash: string;
  status: PolicySyncStatus;
  policies_added: number;
  policies_updated: number;
  policies_removed: number;
  diff?: unknown;
  applied_by?: string;
}

export interface PolicySyncResult {
  run: PolicySyncRun;
  diff: string;
  rejected: boolean;
}

export interface PolicySyncOptions {
  apiKey: string;
  apiUrl: string;
  bundlePath: string;
  source?: string;
  commitSha?: string;
  ref?: string;
  dryRun: boolean;
}

export async function runPolicySync(opts: PolicySyncOptions): Promise<PolicySyncResult> {
  const { apiKey, apiUrl, bundlePath, source, commitSha, ref, dryRun } = opts;

  // Resolve path relative to GITHUB_WORKSPACE (the checkout root in CI)
  const workspace = process.env["GITHUB_WORKSPACE"] ?? ".";
  const absPath = path.isAbsolute(bundlePath)
    ? bundlePath
    : path.resolve(workspace, bundlePath);

  if (!fs.existsSync(absPath)) {
    throw new Error(
      `Policy bundle not found: ${bundlePath} (resolved to ${absPath})`,
    );
  }

  let policies: PolicyBundleEntry[];
  try {
    const raw = fs.readFileSync(absPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("Policy bundle must be a JSON array of policy entries");
    }
    policies = parsed as PolicyBundleEntry[];
  } catch (err) {
    throw new Error(
      `Failed to parse policy bundle at ${bundlePath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  if (policies.length === 0) {
    throw new Error("Policy bundle is empty — at least one entry is required");
  }

  const url = `${apiUrl.replace(/\/$/, "")}/v1/policy-sync`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...functionRegionHeaders(url),
      },
      body: JSON.stringify({
        policies,
        source: source ?? "github-action",
        commit_sha: commitSha,
        ref,
        dry_run: dryRun,
      }),
    });
  } catch (err) {
    throw new Error(
      `Network error reaching ${url}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  if (!resp.ok) {
    let detail = "";
    try {
      const errBody = (await resp.json()) as { error?: string; message?: string };
      detail = errBody.error ?? errBody.message ?? "";
    } catch {
      // ignore parse failure on error body
    }
    throw new Error(
      `v1-policy-sync responded ${resp.status}${detail ? `: ${detail}` : ""}`,
    );
  }

  let run: PolicySyncRun;
  try {
    run = (await resp.json()) as PolicySyncRun;
  } catch {
    throw new Error("Could not parse JSON response from v1-policy-sync");
  }

  return {
    run,
    diff: formatSyncDiff(run),
    rejected: run.status === "rejected" || run.status === "failed",
  };
}

export function formatSyncDiff(run: PolicySyncRun): string {
  const parts: string[] = [];
  if (run.policies_added > 0) parts.push(`+${run.policies_added} added`);
  if (run.policies_updated > 0) parts.push(`~${run.policies_updated} updated`);
  if (run.policies_removed > 0) parts.push(`-${run.policies_removed} removed`);
  return parts.length > 0 ? parts.join(", ") : "no changes";
}
