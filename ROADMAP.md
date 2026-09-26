# atlasent-action — roadmap

> **Doctrine (2026-05-18 normalization).** This roadmap follows the
> canonical phase framing in
> the internal `VERSIONING_DOCTRINE.md`.
> The public/runtime contract is **AtlaSent v1** (stable). Roadmap
> sequencing uses **Phase 1 / Phase 2 / Phase 3** (with `Wave` / `Pillar`
> inside). There is no "v2 product" and no "v3 product"; Phase 2 and
> Phase 3 ship additively on the `v1` contract. Historical filenames
> (`V2_ROLLOUT.md`, `V2_PLAN.md`, `docs/DESIGN_V2.md`,
> `docs/V2_PILLAR9_PROOF_SYSTEM.md`) and code-level identifiers
> (`v2_proof_system`, `v2_batch`, `v2_streaming`, action input names
> like `v2-batch`/`v2-streaming`) are preserved per Doctrine 4 — they
> are schema-history and code artifacts, not platform-version labels.

GitHub Action that gates CI deploys on an AtlaSent `allow` decision.
Distributed via the GitHub Marketplace. The action is a thin client
over the stable `/v1/*` wire contract.

## Phase 1 — Stabilization & Pilot Readiness (must ship)

Hardens the action against the frozen `v1` substrate (frozen 2026-05-17).
All items below are additive on `v1`; no contract changes.

### Status — May 2026

- Items 1–3 complete (target-id input, four-value decision output, Marketplace listing polish)
- Item 4 (release-ops): PR #28 open with automated release workflow — ready to merge → tag v1.3.0

### Marketplace status

- Only **v1.0.0** is currently live on the Marketplace
- **v1.3.0** is ready to ship once PR #28 merges
- v1.3.0 includes everything since v1.0.0 (see below)

Note: `v1.0.0` / `v1.3.0` here are the action's npm/Marketplace package
SemVer (Doctrine 5), independent of the platform `v1` contract.

### What v1.3.0 includes vs v1.0.0

- **Batch path** — `evaluations` / `wait-for-id` / `wait-timeout-ms` / `v2-batch` / `v2-streaming` inputs; `decisions` / `batch-id` outputs (input names preserved per Doctrine 4)
- **Verify-permit wiring** — `verify-permit` input is now meaningful (`verified` output populated)
- **`target-id` input** — landed in v1.2.0 (2026-04-25)
- **`risk-score` output** — landed in v1.2.0
- **All bug fixes** — `transport.ts` ECONNRESET crash, polling not retrying network errors, `wait-for-id` allow path silently fail-closed, `decisions`/`batch-id` unset on batch error, raw `SyntaxError` on bad JSON inputs, `GateInfraError` mislabeled "Unexpected error"

### Phase 1 work items

1. ~~**`target-id` input**~~ landed in v1.2.0 (CHANGELOG 2026-04-25). `action.yml` on main declares the input and threads it into both top-level `target_id` and `context.target_id`.

2. ~~**Four-value `decision` output**~~ landed. `action.yml` declares `decision: 'allow/deny/hold/escalate'`; the batch path (`runV21`) and the `wait-for-id` poller surface hold/escalate end-to-end. (Module name `runV21` retained per Doctrine 4.)

3. ~~**Marketplace listing polish**~~ branding in `action.yml` (`icon: shield`, `color: green`). README + LICENSE present on main. Listing itself still on v1.0.0 — see item 4.

4. **Cut the v1.3.0 release** — **PR #28 open with automated release workflow — ready to merge → tag v1.3.0**. Code is on main but only v1.0.0 is tagged or released. The Marketplace listing customers see is v1.0.0, missing every change documented in CHANGELOG since 2026-04-17:
   - **v1.2.0** (2026-04-25): `target-id` input, `risk-score` output. CHANGELOG entry notes "Source-only release. `dist/index.js` must be rebuilt before tagging — release engineering tracks the rebuild step."
   - **v1.3.0** (2026-04-30): `evaluations` / `wait-for-id` / `wait-timeout-ms` / `v2-batch` / `v2-streaming` inputs; `decisions` / `batch-id` outputs; A5 `verify-permit` wiring (`verified` is meaningful now); plus security-relevant bug fixes — `transport.ts` ECONNRESET crash, polling not retrying network errors, `wait-for-id` allow path silently fail-closed, `decisions`/`batch-id` unset on batch error, raw `SyntaxError` on bad JSON inputs, `GateInfraError` mislabeled "Unexpected error".

   Required steps (automated via PR #28):
   - `npm run build` to refresh `dist/index.js` (`@atlasent/enforce` is bundled via esbuild — there is no runtime SDK pin to chase).
   - Commit the rebuilt `dist/` if it has drifted.
   - Tag `v1.3.0` at HEAD.
   - Cut GitHub Release for v1.3.0, with the existing CHANGELOG entry as release notes.
   - Move the floating `v1` major tag to `v1.3.0`.
   - Verify the Marketplace listing reflects v1.3.0.

   Tracking issue: [#25](https://github.com/Atlasent/atlasent-action/issues/25).

## Phase 1 — Post-stabilization, ordered by impact

5. **Check-run mode** — in addition to exit-code pass/fail, create a GitHub Check with risk bullets and a link to the evaluation in the console.
6. **Auto-comment on PRs** — summary comment when the action blocks.
7. **Self-hosted runner compat** — document egress requirements (api.atlasent.io), IP allowlist considerations.
8. **Matrix job support** — today one evaluation per job; allow batch eval for matrix fans. (Partially addressed by the v1.3.0 batch path, but the matrix-fan ergonomics aren't documented.)

## Phase 2 — Enterprise Hardening & Runtime Expansion (additive on v1)

Action-side hooks into Phase 2 enterprise capabilities (SSO/SCIM
context propagation in CI evaluations, evidence bundle emission on
deploy gates, Delta VQP context). Scope tracked alongside the umbrella
Phase 2 plan; no action-side breaking change required.

## Phase 3 — Execution Assurance & Operational Sovereignty (additive on v1)

The verifiable proof system work documented in
[`docs/V2_PILLAR9_PROOF_SYSTEM.md`](docs/V2_PILLAR9_PROOF_SYSTEM.md)
(filename preserved per Doctrine 4) belongs to this phase: the action
emits `proof-id` / `payload-hash` outputs, runs a post-job consume
step, and links check-runs to public proof pages. Ships additively
under the `v1` contract; flag-gated via control-plane `v2_proof_system`
(flag name retained per Doctrine 4).

## Cross-repo dependencies

- **atlasent-api**: the `decision` enum (`allow|deny|hold|escalate`) and the `/v1-verify-permit` endpoint are on `main` and surfaced here.
- **atlasent-sdk**: no longer a runtime dep — `@atlasent/enforce` is a workspace package bundled into `dist/index.js` at build time. The pre-v1.3.0 "pin SDK version" item is moot.
- **atlasent-docs**: needs a "CI gate" page pointing at Marketplace.
- **atlasent-control-plane**: tenant flags `v2_batch`, `v2_streaming`, `v2_proof_system` (flag names retained per Doctrine 4).

## Historical / preserved documents

Per Doctrine 4, the following files retain their original filenames and
substantive content; they carry normalization headers mapping their
historical framing onto the current phase framing:

- [`V2_ROLLOUT.md`](V2_ROLLOUT.md) — historical; substantive content describes Phase 1 capabilities (batch / streaming-wait / SDK pin).
- [`docs/V2_ROLLOUT.md`](docs/V2_ROLLOUT.md) — historical; Wave B subset.
- [`docs/DESIGN_V2.md`](docs/DESIGN_V2.md) — historical design doc for the action's remote-evaluator migration (now landed under `v1`).
- [`docs/V2_PLAN.md`](docs/V2_PLAN.md) — historical; action workstreams mapped to old "pillar" structure.
- [`docs/V2_PILLAR9_PROOF_SYSTEM.md`](docs/V2_PILLAR9_PROOF_SYSTEM.md) — historical; substantive content describes Phase 3 (Execution Assurance) work.

## Open questions

- Publish to GitHub Marketplace under `atlasent` or `atlasent-systems`? The org handle affects SEO.
- Fail-open or fail-closed when the AtlaSent API is unreachable? Current behavior is fail-closed (correct default); may need an opt-out for non-critical pipelines.
