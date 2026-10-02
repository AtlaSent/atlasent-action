// Structural guard for edge-function region pinning (@atlasent/enforce
// functionRegion). Two properties:
//   1. Only the functionRegion module writes the `x-region` header. Callers
//      spread functionRegionHeaders(url); none hand-rolls the header.
//   2. Every source file that sends a request to a runtime `/v1` path uses
//      functionRegionHeaders, so a newly added runtime call cannot silently
//      skip pinning and land back on the slow, cross-region path.
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const SOURCE_DIRS = ["src", "packages/enforce/src", "packages/azure-devops-task/src", "packages/action/src"];
const REGION_MODULE = path.join("packages", "enforce", "src", "functionRegion.ts");

// Files that match the "sends a request to /v1" heuristic but do not call the
// AtlaSent runtime's edge functions. Each needs a reason.
const NOT_RUNTIME_CALLERS: Record<string, string> = {
  "src/index.ts": "its own fetches go to the GitHub API and Slack/webhooks; runtime calls are delegated to modules covered here",
  "src/releaseCandidate.ts": "calls the atlasent-control-plane release API, not a Supabase edge function",
};

function sourceFiles(): string[] {
  const out: string[] = [];
  for (const dir of SOURCE_DIRS) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs)) {
      if (name.endsWith(".ts") && !name.endsWith(".d.ts") && !name.endsWith(".test.ts")) {
        out.push(path.join(dir, name));
      }
    }
  }
  return out;
}

describe("edge-function region pinning is centralized", () => {
  const files = sourceFiles();

  it("scans a non-empty source set", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files).toContain(REGION_MODULE);
  });

  it("only the functionRegion module writes the x-region header", () => {
    const offenders = files.filter(
      (f) => f !== REGION_MODULE && /x-region/i.test(fs.readFileSync(path.join(ROOT, f), "utf-8")),
    );
    expect(offenders).toEqual([]);
  });

  it("every runtime caller uses functionRegionHeaders", () => {
    const missing = files.filter((f) => {
      if (f === REGION_MODULE || f in NOT_RUNTIME_CALLERS) return false;
      const src = fs.readFileSync(path.join(ROOT, f), "utf-8");
      const sendsRequest = /fetch[A-Za-z]*\(|\bpost\(|\bget\(/.test(src);
      const targetsV1 = /`[^`]*\/v1[-/]/.test(src);
      return sendsRequest && targetsV1 && !/functionRegionHeaders\(|runtimeHeaders\(/.test(src);
    });
    expect(missing).toEqual([]);
  });

  it("the allowlist names only files that exist", () => {
    for (const f of Object.keys(NOT_RUNTIME_CALLERS)) {
      expect(fs.existsSync(path.join(ROOT, f)), f).toBe(true);
    }
  });
});
