# atlasent-action — v2.1 rollout

> **Doctrine normalization header (2026-05-18).** This file is
> preserved unchanged below per Doctrine 4 of
> [`atlasent/VERSIONING_DOCTRINE.md`](https://github.com/Atlasent/atlasent/blob/claude/normalize-roadmap-versioning-NWPuP/VERSIONING_DOCTRINE.md).
> Under the current doctrine there is no "v2 product"; the work
> described here is **Phase 1** (additive on the `AtlaSent v1`
> contract). The "v2.1" label is the action's npm/Marketplace SemVer
> (Doctrine 5), not a platform version. Filenames and code identifiers
> (`v2_batch`, `v2_streaming`, `src/v21.ts`) are retained per
> Doctrine 4.

> **Reframing normalization header (2026-05-18).** This document
> remains in scope and is preserved unchanged per the "do not rewrite
> history" doctrine ([`atlasent/VERSIONING_DOCTRINE.md`](https://github.com/Atlasent/atlasent/blob/main/VERSIONING_DOCTRINE.md)
> doctrine 4). Under the 2026-05-18 platform-generation reframing,
> the work described here is reclassified as the **v1.x capability
> layer** — additive cash-flowing capabilities on top of the V1 GA
> substrate. The platform-generation label **v2** now refers to the
> full enterprise surface, planned in
> [`atlasent/ENTERPRISE_V2_ROLLOUT.md`](https://github.com/Atlasent/atlasent/blob/main/ENTERPRISE_V2_ROLLOUT.md).
> Filename and `V2-D#` identifiers are retained for reference
> stability; "V2" in this document refers to the historical pre-reframing
> framing, not the post-reframing platform-generation v2. New
> decisions use the **`PROD-D#`** namespace. See
> [`atlasent/ROADMAP.md`](https://github.com/Atlasent/atlasent/blob/main/ROADMAP.md)
> for the current generation matrix.

Wave B of the [umbrella v2 rollout](https://github.com/Atlasent/atlasent/blob/claude/plan-v2-rollout-5IPGF/V2_ROLLOUT.md). Companion implementation to plan PR #15.

## Status

| Item | Module | State |
|---|---|---|
| B.AC1 — list-input parser (`evaluations:`) | `src/inputs.ts` | landed (this PR, draft) |
| B.AC2 — batch fan-out via `/v1-evaluate/batch` | `src/batch.ts` | landed (this PR, draft) |
| B.AC3 — streaming-wait for change_window | `src/stream.ts` | landed (this PR, draft) |
| B.AC4 — wire v2.1 modules into `action.yml` + `src/index.ts` | not in this PR | pending review of the new shape |

## Scope (this PR)

New files only. `action.yml` and `src/index.ts` are untouched so the
v2.0 entry point keeps shipping unchanged. The v2.1 entry point at
`src/v21.ts` is a preview surface; B.AC4 wires it in after this PR
settles.

## Tenant flags

- `v2_batch` — `evaluateMany()` switches between `/v1-evaluate/batch`
  and per-item loop.
- `v2_streaming` — `waitForTerminalDecision()` switches between SSE
  consumption and 5s polling.

## Why this PR is a draft

- B.AC4 wiring waits on review of the input shape (single vs list).
- The v2.1 entry point is reviewable in `src/v21.ts` without touching
  the production action.
- Endpoints behind both flags are gated by `atlasent-control-plane#5`
  (now landed as control-plane#6).
