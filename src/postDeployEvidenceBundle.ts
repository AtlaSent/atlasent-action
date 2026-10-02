/**
 * Post-deploy compliance evidence bundle generator.
 *
 * Calls POST /v1/orgs/{orgId}/evidence-exports after a successful
 * authorization gate to build a canonical compliance envelope and
 * record its SHA-256 for audit purposes.
 *
 * The call is gracefully degraded:
 *   - 402 Payment Required → org is not on enterprise; emits a warning
 *     and sets empty outputs (never fails the build)
 *   - Network / timeout errors → emits a warning, sets empty outputs
 *
 * Auth: uses Authorization: Bearer — same api-key input already present.
 */

import { functionRegionHeaders } from "@atlasent/enforce";

export type EvidenceBundleRegime = "soc2_type_ii" | "hipaa" | "gdpr";

export const VALID_EVIDENCE_REGIMES = new Set<EvidenceBundleRegime>([
  "soc2_type_ii",
  "hipaa",
  "gdpr",
]);

export interface PostDeployEvidenceBundleArgs {
  apiUrl: string;
  apiKey: string;
  /** Organisation ID derived from GITHUB_REPOSITORY owner segment. */
  orgId: string;
  regime: EvidenceBundleRegime;
  /** Lookback window length in days (default: 90). */
  days: number;
  /** Actor label written into the generated_by field. */
  actor?: string;
}

export interface PostDeployEvidenceBundleResult {
  /** SHA-256 hex digest of the canonical bundle bytes, or empty string. */
  sha256: string;
  /** Evidence export record ID, or empty string. */
  exportId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoNow(): string {
  return new Date().toISOString();
}

function isoOffsetDays(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// ─── Main caller ──────────────────────────────────────────────────────────────

/**
 * Call POST /v1/orgs/{orgId}/evidence-exports and return the export ID and
 * bundle SHA-256.  Returns empty strings on any non-fatal error so the action
 * output is always set regardless of outcome.
 */
export async function callPostDeployEvidenceBundle(
  args: PostDeployEvidenceBundleArgs,
  log: { info: (m: string) => void; warning: (m: string) => void },
  timeoutMs = 30_000,
): Promise<PostDeployEvidenceBundleResult> {
  const empty: PostDeployEvidenceBundleResult = { sha256: "", exportId: "" };

  const url = `${args.apiUrl.replace(/\/$/, "")}/v1/orgs/${encodeURIComponent(args.orgId)}/evidence-exports`;

  const windowTo = isoNow();
  const windowFrom = isoOffsetDays(args.days);

  const body = {
    regime: args.regime,
    window: { from: windowFrom, to: windowTo },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
        ...functionRegionHeaders(url),
        ...(args.actor ? { "X-AtlaSent-Actor": args.actor } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (res.status === 402) {
      // Org not on enterprise tier — degrade gracefully
      log.warning(
        "AtlaSent evidence-bundle: organization is not on the enterprise plan (HTTP 402). " +
          "Upgrade to generate compliance evidence bundles from CI.",
      );
      return empty;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log.warning(
        `AtlaSent evidence-bundle: POST ${url} → HTTP ${res.status} (advisory; build not affected). ${text}`.trim(),
      );
      return empty;
    }

    // Shape: { export: EvidenceExportRecord; bundle: EvidenceBundle; sha256: string }
    const data = (await res.json()) as {
      export?: { id?: string; bundle_sha256?: string };
      sha256?: string;
    };

    const exportId = data.export?.id ?? "";
    const sha256 = data.sha256 ?? data.export?.bundle_sha256 ?? "";

    log.info(`AtlaSent evidence-bundle: export ${exportId} sha256=${sha256}`);
    return { sha256, exportId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warning(
      `AtlaSent evidence-bundle: request failed (advisory; build not affected): ${msg}`,
    );
    return empty;
  } finally {
    clearTimeout(timer);
  }
}
