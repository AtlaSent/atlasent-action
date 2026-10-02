// Post-authorization behavior insights evaluation.
//
// After an authorization gate succeeds, orgs can optionally trigger a
// behavior insights campaign evaluation for the acting subject. This is
// best-effort: a failure here never blocks or reverses the authorization
// decision. 403 (flag not enabled) is silently swallowed.

import { functionRegionHeaders } from "@atlasent/enforce";
export interface InsightsFired {
  campaignId: string;
  name: string;
  delivery: Record<string, unknown>;
}

export interface InsightsSkipped {
  campaignId: string;
  name: string;
  reason: string;
}

export interface InsightsEvaluateResult {
  subjectId: string;
  fired: InsightsFired[];
  skipped: InsightsSkipped[];
}

export interface InsightsEvaluateConfig {
  apiKey: string;
  apiUrl: string;
  orgId: string;
  subjectId: string;
  sessionCount?: number;
  patternScores?: Record<string, number>;
  events?: { type: string; occurredAt?: string }[];
}

export async function runInsightsEvaluate(
  cfg: InsightsEvaluateConfig,
  log: { info: (m: string) => void; warning: (m: string) => void } = console as any,
): Promise<InsightsEvaluateResult | null> {
  try {
    const res = await fetch(
      `${cfg.apiUrl}/v1/orgs/${cfg.orgId}/insights/evaluate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
          ...functionRegionHeaders(cfg.apiUrl),
        },
        body: JSON.stringify({
          subjectId: cfg.subjectId,
          sessionCount: cfg.sessionCount,
          patternScores: cfg.patternScores,
          events: cfg.events,
        }),
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (res.status === 403) {
      log.info("AtlaSent insights: feature flag not enabled, skipping");
      return null;
    }
    if (!res.ok) {
      log.warning(`AtlaSent insights evaluate returned ${res.status} (advisory)`);
      return null;
    }

    const result = (await res.json()) as InsightsEvaluateResult;
    if (result.fired.length > 0) {
      log.info(
        `AtlaSent insights: ${result.fired.length} campaign(s) fired for subject "${cfg.subjectId}": ` +
        result.fired.map((f) => f.name).join(", ")
      );
    }
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warning(`AtlaSent insights evaluate failed (advisory): ${msg}`);
    return null;
  }
}
