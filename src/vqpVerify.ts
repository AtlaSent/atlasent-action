// VQP re-derivation audit — CI enforcement step.
//
// Calls v1-verify-vqp to re-derive the VQP prompt from DB rules, compute
// its SHA-256 hash, compare to the stored prompt_hash, and optionally
// re-run the AI to detect score drift.
//
// Fails the job when:
//   - hash_match = false  → prompt was mutated (integrity violation)
//   - verdict_changed = true AND vqp-fail-on-drift = true (default)
//
// API:
//   POST /functions/v1/v1-verify-vqp
//   Authorization: Bearer <service-role-key>
//   Body: { snapshot_id: string, rerun?: boolean }
//
//   Response (Supabase ok() envelope or bare):
//   { hash_match: boolean, rerun_score?: number, score_delta?: number,
//     verdict_changed?: boolean, audit_id?: string }

import { functionRegionHeaders } from "@atlasent/enforce";

export interface VqpVerifyInputs {
  supabaseUrl: string;
  serviceRoleKey: string;
  snapshotId: string;
  rerun: boolean;
}

export interface VqpVerifyResult {
  hashMatch: boolean;
  scoreDelta: number | null;
  verdictChanged: boolean;
  auditId: string;
}

interface VqpVerifyBody {
  hash_match?: boolean;
  rerun_score?: number;
  score_delta?: number;
  verdict_changed?: boolean;
  audit_id?: string;
}

export async function runVqpVerify(
  inputs: VqpVerifyInputs,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<VqpVerifyResult> {
  const base = inputs.supabaseUrl.replace(/\/$/, '');
  const url = `${base}/functions/v1/v1-verify-vqp`;

  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${inputs.serviceRoleKey}`,
      ...functionRegionHeaders(url),
    },
    body: JSON.stringify({
      snapshot_id: inputs.snapshotId,
      rerun: inputs.rerun,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`v1-verify-vqp failed (${res.status}): ${text.slice(0, 400)}`);
  }

  let parsed: VqpVerifyBody & { data?: VqpVerifyBody; success?: boolean };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw new Error(`v1-verify-vqp returned non-JSON: ${text.slice(0, 200)}`);
  }

  // Unwrap Supabase ok() envelope when present.
  const body: VqpVerifyBody =
    parsed.success && parsed.data ? parsed.data : parsed;

  return {
    hashMatch: body.hash_match === true,
    scoreDelta: body.score_delta !== undefined ? body.score_delta : null,
    verdictChanged: body.verdict_changed === true,
    auditId: body.audit_id ?? '',
  };
}
