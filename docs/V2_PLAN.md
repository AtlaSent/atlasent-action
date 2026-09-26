# atlasent-action V2 Plan

> **Doctrine normalization header (2026-05-18).** This file is
> preserved unchanged below per Doctrine 4 of
> [`atlasent/VERSIONING_DOCTRINE.md`](https://github.com/Atlasent/atlasent/blob/claude/normalize-roadmap-versioning-NWPuP/VERSIONING_DOCTRINE.md).
> Under the current doctrine there is no "v2 product"; the action
> workstreams described here are split between **Phase 1** (batch /
> streaming / matrix-job ergonomics) and **Phase 2** (enterprise
> distribution / GitHub App / check-run mode), all shipping additively
> on the `AtlaSent v1` contract. The "Pillar 2/3/4" structure in the
> body refers to the historical pre-reframing pillar layout. Filename
> retained per Doctrine 4.

> Companion to the canonical plan: **[atlasent-api/docs/V2_PLAN.md](https://github.com/Atlasent/atlasent-api/blob/claude/v2-planning/docs/V2_PLAN.md)**.
> This file enumerates only the GitHub Action workstreams. Product-level
> rationale, non-goals, and timeline live in the canonical plan.
> Status: **draft** — do not merge until v2 releases.

## Action workstreams

Mapped to the pillars in the canonical plan:

### Pillar 2 — Batch evaluation (matrix-job mode)

The single biggest action-side v2 win. CI matrix jobs today fan out
N action invocations = N HTTP round-trips. Move to one call.

- **`mode: batch` input** — collects every action invocation in the
  same workflow run and submits a single `POST /v1-evaluate:batch` at
  the join point.
- **`needs:` declaration** — when set, the batch step blocks downstream
  jobs only on the subset of decisions they depend on, not the whole
  batch.
- Job summary renders one row per decision with its permit / audit hash.

### Pillar 3 — Streaming decisions (job summary integration)

- Stream decisions into the job summary in real time as they're issued
  (rather than waiting for action completion). Operators see denials
  immediately when watching a long-running matrix.
- Optional `summary-stream: true` input.

### Pillar 4 — Self-hosted runner support

- Document running the action against a self-hosted control plane
  (`api-url:` already supports custom URLs; what changes is the
  default, the CA-cert handling, and the proxy story).
- Self-hosted runner network egress notes — what to allow.

### Marketplace + distribution

- **Marketplace v2 listing** — refresh README, screenshots, branded
  badge, version badge.
- **Pin to `@atlasent/sdk` v2** — the action currently has its own
  bundled HTTP client (`src/index.ts`). v2 swaps to `@atlasent/sdk`
  for one source of truth on retry / error / rate-limit semantics.
- **Floating `v2` tag** — published alongside `v2.0.0` on release;
  customers pin to `@v2` for minor-version updates.

### Modes (carry-over from v1 ROADMAP)

- **Advisory mode** (`enforce: false`) — the action runs `evaluate`,
  posts results to the job summary + PR comment, but never fails the
  workflow. Already partially possible via `fail-on-deny: false`; v2
  formalizes it as a first-class mode.
- **Check-run mode** — instead of a workflow step, install as a GitHub
  App that posts a check-run with annotations. v2 stretch goal; needs
  GitHub App registration.

## Non-goals (action-specific)

- Triggering AtlaSent decisions outside CI context (e.g., from issue
  comments). Action stays workflow-scoped.
- Self-rolling the rate-limit backoff. Inherits behavior from `@atlasent/sdk`.

## Cross-repo dependencies

- `atlasent-sdk` v2 batch + streaming clients (this action calls them).
- `atlasent-api` v2 batch + streaming endpoints.
- `atlasent-docs` self-hosted runbook + GitHub App setup guide.

## Open action-lead questions

1. **GitHub App vs. composite action** — check-run mode wants the App;
   workflow-step mode wants the composite. v2 picks both, or just one?
2. **Bundle size** — adding `@atlasent/sdk` as a real dep grows the
   bundled `dist/index.js`. Acceptable, or stay zero-dep with a vendored
   slim client?
3. **Matrix batch coordination** — needs an action-internal cache to
   dedupe identical evaluations across matrix legs. Use `actions/cache`
   or implement in-process?

Do not merge. Stays in draft through v2 GA.
