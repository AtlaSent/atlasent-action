// Pause-and-resume approval protocol — compatibility shim.
//
// PRIOR BEHAVIOR (removed): this file used to poll `GET {apiUrl}/v1-evaluate/:id`
// and stream `POST {apiUrl}/v1-evaluate/stream`. Neither endpoint has ever
// existed on the runtime API — `/v1-evaluate` only accepts POST and has no
// GET or `/stream` route at all (see atlasent-api's
// supabase/functions/v1-evaluate/{index,handler,_entry}.ts: the entry
// dispatcher only distinguishes a `/close-ops` suffix from everything else,
// and handler.ts has no `req.method === "GET"` branch anywhere). Both code
// paths in this file always failed against a real deployment.
//
// This file now delegates to @atlasent/enforce's waitForApprovalResolution(),
// the canonical implementation, which polls the REAL status endpoint —
// `GET /v1-approvals/:id` (atlasent-api's v1-approvals, single-item route
// added alongside this change) — and is also what the primary single-eval
// path (src/index.ts) uses directly.
//
// Kept as a thin wrapper, rather than deleted, so src/v21.ts's existing
// `waitForId` (batch/v2.1 preview) call site keeps compiling and pointing at
// a real endpoint without a wider rewrite of that undocumented surface. Note
// the field is still named `evaluationId` here for source compat — it is
// actually the approval_request_id (v1-evaluate's hold/escalate response
// field), same as everywhere else in this protocol.
//
// v2Streaming has no effect: there is no SSE endpoint to stream from. It is
// accepted (not rejected) so existing callers don't hard-fail, but the wait
// always polls.

import type { Decision } from "./types";
import { waitForApprovalResolution } from "@atlasent/enforce";

export interface WaitOptions {
  apiUrl: string;
  apiKey: string;
  /** Actually the approval_request_id — see file header. */
  evaluationId: string;
  timeoutMs: number;
  v2Streaming: boolean;
  signal?: AbortSignal;
}

export async function waitForTerminalDecision(
  opts: WaitOptions,
): Promise<Decision> {
  const resolution = await waitForApprovalResolution({
    apiKey: opts.apiKey,
    apiUrl: opts.apiUrl,
    approvalId: opts.evaluationId,
    maxWaitMs: opts.timeoutMs,
  });

  // Bridge ApprovalResolution -> the Decision shape this module's existing
  // callers (src/v21.ts) already branch on. Only "approved" AND a real
  // minted permit token count as allow — every other terminal status
  // (denied, denied_by_timeout, expired, an approval accepted with no
  // fresh permit, or anything else the server reports) is deny, fail closed.
  if (resolution.status === "approved" && resolution.permitToken) {
    return {
      decision: "allow",
      permitToken: resolution.permitToken,
      evaluatedAt: new Date().toISOString(),
    };
  }
  return {
    decision: "deny",
    evaluatedAt: new Date().toISOString(),
  };
}
