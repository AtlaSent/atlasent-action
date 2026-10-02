/**
 * Best-effort evidence event emitter.
 *
 * After a successful enforce() the action posts an `execution_started`
 * evidence event to /v1-runtime-events so the runtime verification chain
 * (Phase B2/B4 in the API) has a real record of the CI run that was
 * authorized. The emit is fire-and-forget:
 *
 *   - Failures NEVER fail the build (advisory-grade)
 *   - The endpoint may not exist on every API deployment; absence is
 *     reported as a debug-level message, not a warning
 *   - We don't await unbounded; a hard 5s timeout caps the cost
 *
 * Stable event payload shape (must match the API's append_evidence_event
 * contract, per ADR-runtime-verification-and-governance-provenance):
 *   {
 *     event_type: "execution_started" | "execution_completed" | "execution_failed",
 *     permit_token: string,
 *     evaluation_id: string,
 *     environment: string,
 *     execution_started_at?: ISO8601,
 *     execution_result_hash?: hex(sha256) (for *_completed only),
 *     metadata: {
 *       source: "github-action",
 *       repository, ref, sha, run_id, run_url, ...
 *     }
 *   }
 */

import { createHash } from "node:crypto";
import { functionRegionHeaders } from "@atlasent/enforce";

export type EvidenceEventType =
  | "execution_started"
  | "execution_completed"
  | "execution_failed";

export interface EvidenceEvent {
  event_type: EvidenceEventType;
  permit_token: string;
  evaluation_id: string;
  environment: string;
  execution_started_at?: string;
  execution_result_hash?: string;
  metadata: Record<string, unknown>;
}

export interface EmitConfig {
  apiKey: string;
  apiUrl: string;
  timeoutMs?: number;
  /**
   * Optional override for the endpoint path. The default points at the
   * canonical handler the API will expose for B2/B7 wiring. Lets users on
   * a forked or self-hosted API redirect without rebuilding the action.
   */
  endpoint?: string;
}

/**
 * Compute a stable SHA-256 hash of the execution result payload. Used by
 * Phase B3's action_hash_mismatch / output_hash_mismatch binding checks.
 * Pure function so tests are trivial.
 */
export function hashResult(payload: unknown): string {
  const canonical = typeof payload === "string"
    ? payload
    : JSON.stringify(payload, Object.keys(payload as object).sort());
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export async function emitEvidenceEvent(
  cfg: EmitConfig,
  event: EvidenceEvent,
  log: { info: (m: string) => void; warning: (m: string) => void } = console as unknown as {
    info: (m: string) => void;
    warning: (m: string) => void;
  },
): Promise<void> {
  const url = `${cfg.apiUrl.replace(/\/$/, "")}${cfg.endpoint ?? "/v1-runtime-events"}`;
  const timeoutMs = cfg.timeoutMs ?? 5000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
        ...functionRegionHeaders(url),
      },
      body: JSON.stringify(event),
      signal: controller.signal,
    });

    if (res.status === 404) {
      // Endpoint not deployed on this API — common during the rollout
      // window when atlasent-action is ahead of atlasent-api. Don't warn.
      log.info(
        `AtlaSent: runtime evidence endpoint not present at ${url} (skipping ${event.event_type})`,
      );
      return;
    }
    if (!res.ok) {
      log.warning(
        `AtlaSent: evidence emit ${event.event_type} → HTTP ${res.status} (advisory; build not affected)`,
      );
      return;
    }
    log.info(`AtlaSent: evidence event ${event.event_type} emitted`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warning(
      `AtlaSent: evidence emit failed (advisory; build not affected): ${msg}`,
    );
  } finally {
    clearTimeout(timer);
  }
}
