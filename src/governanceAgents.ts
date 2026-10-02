// AtlaSent Governance Agents — PR-check mode.
//
// Invokes one or more constrained advisory governance agents against a
// governed change and posts findings as a non-required GitHub Actions
// step result. Findings are signal, not authorization — this mode does
// NOT gate by default.
//
// Routing:
//   migration_review        — scans SQL migrations in standard locations
//   runtime_contract_drift  — diffs openapi.yaml vs route inventory vs SDK types
//   <any other registered>  — supply a pre-built artifact via governance-artifact-file
//
// The action POSTs to `${api-url}/v1/governance/agents/<slug>/evaluate`
// with `{ change_id, input_hash, artifact, invoked_by_kind: 'service_account' }`.
// The endpoint persists the evaluation + findings and returns them.
//
// Optional gating:
//   governance-fail-on-severity — fail the step at this severity or higher
//   governance-fail-on-blocker  — shortcut for severity=blocker
//
// Authority boundary unchanged: nothing in this file can satisfy a gate
// or clear a hold. The API endpoint structurally cannot either
// (governance_agent_findings.can_authorize CHECK = false).

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { functionRegionHeaders } from "@atlasent/enforce";

export type AgentSeverity = "info" | "low" | "medium" | "high" | "blocker";

const SEVERITY_RANK: Record<AgentSeverity, number> = {
  info: 1,
  low: 2,
  medium: 3,
  high: 4,
  blocker: 5,
};

export interface AgentFinding {
  id: string;
  agent_slug: string;
  finding_type: string;
  severity: AgentSeverity;
  summary: string;
  required_authority: string | null;
  recommended_action: string | null;
  evidence_refs: unknown;
  can_authorize: false;
}

export interface AgentEvaluation {
  id: string;
  agent_slug: string;
  agent_version: string;
  status: "completed" | "failed" | "timeout";
  highest_severity: AgentSeverity | null;
  findings_count: number;
  summary: string | null;
}

export interface InvokeAgentResponse {
  evaluation: AgentEvaluation;
  findings: AgentFinding[];
}

export interface RunGovernanceAgentsOptions {
  apiKey: string;
  apiUrl: string;
  changeId: string;
  agentSlugs: readonly string[];
  /** Optional pre-built artifact path for agents that aren't auto-discovered. */
  artifactFile?: string;
  /** Workspace root for path resolution; defaults to GITHUB_WORKSPACE or cwd. */
  workspace?: string;
  /** Threshold above which the step fails. Omit to never fail on findings. */
  failOnSeverity?: AgentSeverity;
  /** Invocation provenance recorded on the evaluation. */
  invokedBy?: string;
  /** Override fetch (test seam). */
  fetchImpl?: typeof fetch;
  /** Override fs/path operations (test seam). */
  fileSystem?: {
    readFileSync: (p: string, enc: "utf-8") => string;
    existsSync: (p: string) => boolean;
    readdirSync: (p: string) => string[];
    statSync: (p: string) => { isDirectory(): boolean; isFile(): boolean };
  };
}

export interface RunGovernanceAgentsResult {
  evaluations: AgentEvaluation[];
  findings: AgentFinding[];
  highest_severity: AgentSeverity | null;
  failed: boolean;
}

// ─── public entry ───────────────────────────────────────────────────────────

export async function runGovernanceAgents(
  opts: RunGovernanceAgentsOptions,
): Promise<RunGovernanceAgentsResult> {
  if (!opts.apiKey) throw new Error("apiKey is required");
  if (!opts.apiUrl) throw new Error("apiUrl is required");
  if (!opts.changeId) {
    throw new Error("changeId is required — set governance-change-id input");
  }
  if (opts.agentSlugs.length === 0) {
    throw new Error("agentSlugs must be non-empty");
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  const fs_ = opts.fileSystem ?? defaultFs();
  const workspace = opts.workspace ?? process.env["GITHUB_WORKSPACE"] ?? process.cwd();

  // Optionally read an externally-supplied artifact map for agents that
  // can't be auto-discovered (e.g. runtime_contract_drift wants OpenAPI +
  // route inventory + SDK type names).
  const artifactMap = opts.artifactFile
    ? readArtifactFile(opts.artifactFile, workspace, fs_)
    : {};

  const evaluations: AgentEvaluation[] = [];
  const findings: AgentFinding[] = [];

  for (const slug of opts.agentSlugs) {
    const artifact = artifactMap[slug] ?? autoDiscoverArtifact(slug, workspace, fs_);
    if (!artifact) {
      throw new Error(
        `No artifact for agent "${slug}". Either supply one via governance-artifact-file ` +
          `(a JSON object keyed by agent slug) or use a slug that supports auto-discovery ` +
          `(migration_review, runtime_contract_drift).`,
      );
    }

    const result = await invokeAgent(
      {
        apiKey: opts.apiKey,
        apiUrl: opts.apiUrl,
        changeId: opts.changeId,
        slug,
        artifact,
        invokedBy: opts.invokedBy ?? "github-action",
        fetchImpl,
      },
    );

    evaluations.push(result.evaluation);
    findings.push(...result.findings);
  }

  const highest = highestSeverity(findings);
  const failed =
    !!opts.failOnSeverity &&
    !!highest &&
    SEVERITY_RANK[highest] >= SEVERITY_RANK[opts.failOnSeverity];

  return { evaluations, findings, highest_severity: highest, failed };
}

// ─── invocation ─────────────────────────────────────────────────────────────

interface InvokeArgs {
  apiKey: string;
  apiUrl: string;
  changeId: string;
  slug: string;
  artifact: unknown;
  invokedBy: string;
  fetchImpl: typeof fetch;
}

async function invokeAgent(args: InvokeArgs): Promise<InvokeAgentResponse> {
  const url = `${args.apiUrl.replace(/\/$/, "")}/v1/governance/agents/${encodeURIComponent(args.slug)}/evaluate`;
  const body = JSON.stringify({
    change_id: args.changeId,
    input_hash: hashArtifact(args.artifact),
    artifact: args.artifact,
    invoked_by_kind: "service_account",
    invoked_by: args.invokedBy,
  });

  let resp: Response;
  try {
    resp = await args.fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.apiKey}`,
        ...functionRegionHeaders(url),
      },
      body,
    });
  } catch (err) {
    throw new Error(
      `governance agent ${args.slug}: network error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    if (resp.status === 501) {
      throw new Error(
        `governance agent ${args.slug}: registered in the DB but no in-process implementation is deployed (501). ` +
          `Skip this slug or upgrade the API.`,
      );
    }
    throw new Error(
      `governance agent ${args.slug}: HTTP ${resp.status} ${resp.statusText} — ${text.slice(0, 500)}`,
    );
  }

  const parsed = (await resp.json()) as InvokeAgentResponse;
  if (!parsed.evaluation || !Array.isArray(parsed.findings)) {
    throw new Error(`governance agent ${args.slug}: malformed response`);
  }
  return parsed;
}

// ─── artifact discovery ─────────────────────────────────────────────────────

const MIGRATION_DIRS = [
  "supabase/migrations",
  "supabase/migrations-runtime",
  "supabase/migrations-console",
  "supabase/migrations-shared",
];

type Fs = NonNullable<RunGovernanceAgentsOptions["fileSystem"]>;

function defaultFs(): Fs {
  return {
    readFileSync: (p, enc) => fs.readFileSync(p, enc),
    existsSync: (p) => fs.existsSync(p),
    readdirSync: (p) => fs.readdirSync(p),
    statSync: (p) => fs.statSync(p),
  };
}

function autoDiscoverArtifact(slug: string, workspace: string, fs_: Fs): unknown | null {
  if (slug === "migration_review") return discoverMigrationArtifact(workspace, fs_);
  if (slug === "runtime_contract_drift") return discoverRuntimeContractArtifact(workspace, fs_);
  return null;
}

function discoverMigrationArtifact(workspace: string, fs_: Fs): unknown {
  const files: { path: string; content: string }[] = [];
  for (const dir of MIGRATION_DIRS) {
    const abs = path.resolve(workspace, dir);
    if (!fs_.existsSync(abs)) continue;
    if (!fs_.statSync(abs).isDirectory()) continue;
    for (const entry of fs_.readdirSync(abs)) {
      if (!entry.endsWith(".sql")) continue;
      const full = path.join(abs, entry);
      if (!fs_.statSync(full).isFile()) continue;
      files.push({
        path: path.relative(workspace, full),
        content: fs_.readFileSync(full, "utf-8"),
      });
    }
  }
  return { migrations: files };
}

function discoverRuntimeContractArtifact(workspace: string, fs_: Fs): unknown | null {
  const openapiPath = ["openapi.yaml", "openapi-v1.yaml", "openapi.yml"]
    .map((p) => path.resolve(workspace, p))
    .find((p) => fs_.existsSync(p));
  if (!openapiPath) return null;

  const openapi = parseOpenApiPaths(fs_.readFileSync(openapiPath, "utf-8"));
  const routesDir = path.resolve(workspace, "supabase/functions");
  const routes = fs_.existsSync(routesDir) ? discoverRuntimeRoutes(routesDir, fs_) : [];

  // SDK types: look for an exported type-name list. Best-effort.
  const typeNames: string[] = [];
  const typesIndex = path.resolve(workspace, "packages/types/src/index.ts");
  if (fs_.existsSync(typesIndex)) {
    const content = fs_.readFileSync(typesIndex, "utf-8");
    for (const m of content.matchAll(/export\s+(?:type|interface)\s+([A-Z][A-Za-z0-9_]*)/g)) {
      typeNames.push(m[1]);
    }
  }

  return {
    openapi: { paths: openapi },
    runtime: { routes },
    sdk: { type_names: typeNames },
  };
}

function parseOpenApiPaths(yaml: string): Array<{ path: string; methods: string[] }> {
  // Tiny YAML-subset parser tailored to OpenAPI `paths:` block.
  // Sufficient for {path: {method: ...}} shapes; not a general parser.
  const out: Array<{ path: string; methods: string[] }> = [];
  const lines = yaml.split("\n");
  let inPaths = false;
  let currentPath: { path: string; methods: string[] } | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!inPaths) {
      if (/^paths:\s*$/.test(line)) inPaths = true;
      continue;
    }
    // Exit paths block when we hit a sibling top-level key.
    if (/^[A-Za-z]/.test(line)) {
      inPaths = false;
      if (currentPath) {
        out.push(currentPath);
        currentPath = null;
      }
      continue;
    }
    const pathMatch = /^  (\/[\w/{}.-]+):/.exec(line);
    if (pathMatch) {
      if (currentPath) out.push(currentPath);
      currentPath = { path: pathMatch[1], methods: [] };
      continue;
    }
    const methodMatch = /^    (get|post|put|patch|delete):/i.exec(line);
    if (methodMatch && currentPath) {
      currentPath.methods.push(methodMatch[1].toLowerCase());
    }
  }
  if (currentPath) out.push(currentPath);
  return out;
}

function discoverRuntimeRoutes(
  routesDir: string,
  fs_: Fs,
): Array<{ path: string; methods: string[]; function_name: string }> {
  const routes: Array<{ path: string; methods: string[]; function_name: string }> = [];
  for (const entry of fs_.readdirSync(routesDir)) {
    if (!entry.startsWith("v1-")) continue;
    const dir = path.join(routesDir, entry);
    if (!fs_.statSync(dir).isDirectory()) continue;
    // Inferred path from function name. Heuristic — same logic the
    // openapi-coverage script uses.
    const inferredPath = "/" + entry.replace(/-/g, "/").replace(/^\//, "");
    routes.push({
      path: inferredPath,
      // Methods unknown without parsing the handler; leave empty so the
      // drift agent treats per-method as "not asserted by runtime" and
      // only flags path-level drift.
      methods: [],
      function_name: entry,
    });
  }
  return routes;
}

// ─── artifact file loader ───────────────────────────────────────────────────

function readArtifactFile(
  artifactPath: string,
  workspace: string,
  fs_: Fs,
): Record<string, unknown> {
  const abs = path.isAbsolute(artifactPath)
    ? artifactPath
    : path.resolve(workspace, artifactPath);
  if (!fs_.existsSync(abs)) {
    throw new Error(`governance-artifact-file not found: ${artifactPath}`);
  }
  const raw = fs_.readFileSync(abs, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `governance-artifact-file is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      "governance-artifact-file must be a JSON object keyed by agent slug",
    );
  }
  return parsed as Record<string, unknown>;
}

// ─── helpers ────────────────────────────────────────────────────────────────

export function hashArtifact(artifact: unknown): string {
  const canonical = canonicalJson(artifact);
  return "sha256:" + createHash("sha256").update(canonical).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + canonicalJson((value as Record<string, unknown>)[k]))
      .join(",") +
    "}"
  );
}

export function highestSeverity(findings: readonly AgentFinding[]): AgentSeverity | null {
  let best: AgentSeverity | null = null;
  let rank = 0;
  for (const f of findings) {
    if (SEVERITY_RANK[f.severity] > rank) {
      rank = SEVERITY_RANK[f.severity];
      best = f.severity;
    }
  }
  return best;
}

// ─── step summary rendering ─────────────────────────────────────────────────

export function renderStepSummary(result: RunGovernanceAgentsResult): string {
  const lines: string[] = [];
  lines.push("## Constrained Governance Agents — findings");
  lines.push("");
  lines.push(
    "> Findings are advisory. They produce signal, not authorization. " +
      "Required gates remain on the governance authority surface.",
  );
  lines.push("");

  for (const e of result.evaluations) {
    lines.push(`### ${e.agent_slug} \`${e.agent_version}\``);
    lines.push("");
    lines.push(
      `Status: **${e.status}** — findings: **${e.findings_count}** — highest: **${e.highest_severity ?? "—"}**`,
    );
    if (e.summary) lines.push(`> ${e.summary}`);
    lines.push("");

    const own = result.findings.filter((f) => f.agent_slug === e.agent_slug);
    if (own.length === 0) {
      lines.push("_No findings._");
      lines.push("");
      continue;
    }
    lines.push("| Severity | Type | Authority | Summary |");
    lines.push("|---|---|---|---|");
    for (const f of own) {
      const auth = f.required_authority ?? "—";
      const summary = f.summary.replace(/\|/g, "\\|").replace(/\n+/g, " ");
      lines.push(`| ${f.severity} | \`${f.finding_type}\` | ${auth} | ${summary} |`);
    }
    lines.push("");
  }

  if (result.highest_severity) {
    lines.push(`**Overall highest severity:** \`${result.highest_severity}\``);
  } else {
    lines.push("**No findings.**");
  }
  return lines.join("\n") + "\n";
}
