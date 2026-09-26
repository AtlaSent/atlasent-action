# atlasent-action — V2 Rollout

> **Doctrine normalization header (2026-05-18).** This file is
> preserved unchanged below per Doctrine 4 of
> [`atlasent/VERSIONING_DOCTRINE.md`](https://github.com/Atlasent/atlasent/blob/claude/normalize-roadmap-versioning-NWPuP/VERSIONING_DOCTRINE.md).
> Under the current doctrine there is no "v2 product"; the work
> described in this document is **Phase 1** (Stabilization & Pilot
> Readiness — batch / streaming-wait / SDK pin) shipping additively on
> the `AtlaSent v1` contract. The filename, `V2-D#` decision IDs, and
> code-level identifiers (`v2_batch`, `v2_streaming`, action input
> names) are retained per Doctrine 4. The body below — including the
> earlier (now-superseded) reframing note — is left intact as
> historical record.

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

**Status:** plan · **Wave:** B (action SDK pin + batch + streaming-wait) · **Updated:** 2026-04-26

> **V1 GA — 2026-05-17.** V1 substrate frozen — the canonical foundation
> this V2 plan extends. The `/v1/*` wire surface, schema, audit chain,
> and Ed25519-signed export envelope are stable; V2 work in this plan is
> **additive** on V1 (no V1 wire/schema/audit-chain changes ship under V2).
> V2 implementation is unblocked pending umbrella
> [`V2_DECISIONS.md`](https://github.com/Atlasent/atlasent/blob/main/V2_DECISIONS.md) sign-off.
> Canonical V1 reference: [`atlasent-api/docs/runtime/golden-path-v1.md`](https://github.com/Atlasent/atlasent-api/blob/main/docs/runtime/golden-path-v1.md).
> V1 GA closeout PRs: see umbrella [`ROADMAP.md`](https://github.com/Atlasent/atlasent/blob/main/ROADMAP.md) "V1 GA — what closed" section.

Action-side cut of the [umbrella v2 rollout](https://github.com/Atlasent/atlasent/blob/claude/plan-v2-rollout-5IPGF/V2_ROLLOUT.md). The action already shipped v2.0.0 (OIDC keyless). v2.1 adds batch fan-out, streaming-wait, and SDK 2.x pin.

## Position

The action is a *bundled* gate — it doesn't runtime-import `@atlasent/sdk`. v2.1 changes that for two new code paths only (batch + streaming) so the bundle stays small for the v2.0 path.

## v2.1 deliverables

| ID | Item | Path | Notes |
|---|---|---|---|
| B.AC1 | Pin `@atlasent/sdk@^2` for the new code paths | `package.json`, build pipeline | Stays bundled. |
| B.AC2 | New `evaluations` list input — fan out via `evaluateMany` | `action.yml`, `src/inputs.ts`, `src/batch.ts` | Single `action.yml` input parser auto-detects single (`action:`) vs list (`evaluations:`). List wins when both. |
| B.AC3 | Streaming-wait for `change_window` approvals | `src/stream.ts` | Consumes `/v1-evaluate/stream` SSE; falls back to 5s polling when `v2_streaming` flag is off. |
| B.AC4 | Wire B.AC1–3 into `src/index.ts` main flow + `action.yml` inputs | `src/index.ts`, `action.yml` | Last; depends on input-shape sign-off in plan PR #15. |
| B.AC5 | Default `auth-mode: oidc` in README example | `README.md` | Backward-compatible (`api-key` remains the default *input* value). |

Each item ships with a fallback path so the v2.0 code stays byte-identical until the matching tenant flag flips.

## Tenant-flag matrix

| Flag (from `atlasent-control-plane`) | Code path |
|---|---|
| `v2_batch=true` | `evaluateMany` → `POST /v1-evaluate/batch` |
| `v2_batch=false` (default) | per-item loop on `/v1-evaluate` (today's behavior) |
| `v2_streaming=true` | SSE consumer for `change_window` waits |
| `v2_streaming=false` (default) | 5-second polling on `/v1-evaluate/:id` |

## Behavior conditioning layer

The action **does not** participate directly in the v2
[behavior conditioning layer](https://github.com/Atlasent/atlasent-docs/blob/main/docs/V2_BEHAVIOR_CONDITIONING_LAYER.md) — the action's
agent is CI infrastructure, not a wellness app. But:

- A future `behavior-aware` policy can deny CI deploys based on the
  on-call engineer's recent escalation rate (drawn from `behavior-insights` aggregates). The action emits `actor` (GitHub username) in the v1 evaluate context already; the policy side is what changes.
- `change_window` decisions today already integrate with human approvals; v2 streaming-wait makes that loop tighter.

## Sequencing

1. Plan PR #15 input-shape decision (single vs list, auto-detect)
2. B.AC1–3 in flight as draft PR #16 (modules sit alongside v2.0 entry, not yet wired)
3. B.AC4 wiring once API endpoints (`/v1-evaluate/batch`, `/v1-evaluate/stream`) are deployed (Waqas lane)
4. v1.2.0 polish (target-id input + risk-score output, draft PR #17) lands FIRST so v2.1 stacks cleanly

## Cross-repo dependencies

- **atlasent-sdk**: 2.x publish must precede B.AC1
- **atlasent-api**: `/v1-evaluate/batch`, `/v1-evaluate/stream`, plus the `evaluations[].id` correlation field — all Waqas lane
- **atlasent-control-plane**: `v2_batch` and `v2_streaming` per-tenant flags
- **atlasent-examples**: `flows/01-deploy-gate` becomes the canonical example workflow; updated in `flows/00-golden-path` once v2.1 ships

## Out of scope for v2.1

- GitLab CI / Bitbucket Pipelines actions — separate companion repos
- Azure DevOps extension — same
- Marketplace listing polish (icon, color, branding) — tracked in v1 GA milestones, not gated on v2

## Open questions

- Input shape: `evaluations:` (list) auto-detect vs explicit `mode: batch`? Plan PR #15 open question.
- Streaming progress UX in GitHub Actions step summary: refresh in place vs append?
- Should the action surface batch decision *summaries* (allow/deny counts) as a separate output for use by downstream summary jobs?

## Cross-repo links

- Per-repo plan: [`atlasent-docs/plans/atlasent-action.md`](https://github.com/Atlasent/atlasent-docs/blob/main/plans/atlasent-action.md)
- Open PRs: #15 (plan, draft), #16 (B.AC1-3 implementation, draft), #17 (v1.2.0 polish, draft)
- Behavior layer: [`V2_BEHAVIOR_CONDITIONING_LAYER.md`](https://github.com/Atlasent/atlasent-docs/blob/main/docs/V2_BEHAVIOR_CONDITIONING_LAYER.md)
