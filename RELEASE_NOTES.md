# Release Notes — v1.4.0

**Pending release.** Ships the merged evidence + remediation work to `@v1`
consumers. The features below are already on `main` but the floating `v1` tag
still points at a pre-#100 commit, so `uses: Atlasent/atlasent-action@v1`
does not yet include them — cutting `v1.4.0` (which auto-moves `v1`) fixes that.

### Trust at the moment of the gate

- **Job-summary evidence panel (#100).** Every terminal outcome (allow / deny /
  hold / escalate / fail-closed error) now renders a rich Markdown panel on the
  GitHub run page: the decision, reason, action/actor/environment/target, risk,
  the evidence anchors (evaluation ID, audit chain hash, permit issued &
  verified), a deep link to the console decision replay, and the workflow run.
  The single-use permit token and raw proof hash are never printed.
- **Deny remediation — "How to fix" (#101).** On a non-allow outcome the panel
  surfaces the runtime's remediation hint (summary + concrete steps + deny-code
  reference) so a blocked deploy shows not just *why* but *how to unblock*.

### Notes

- Additive only — no input/output or wire-shape changes; the canonical shape
  stays `env: ATLASENT_API_KEY` + `with: api-url`/`action`/`target-id`.
- `dist/index.js` is rebuilt and committed (the release gate verifies it is
  current).
- Cutting the `v1.4.0` tag runs the dogfood release gate, cosign-signs
  `dist/index.js`, publishes the GitHub Release, and re-points the floating
  `v1` tag to this release.

# Release Notes — v1.3.0

**Release date:** 2026-04-30

## V1 Pilot Readiness Update (draft, not released) — 2026-05-26

This repository now enforces a strict Deploy Gate V1 fail-closed posture for production deploy authorization.

### Readiness hardening

- Enforced fail-closed behavior on policy outcomes across single and batch flows.
  deny, hold, and escalate now fail the workflow even when fail-on-deny is set false.
- Added ATLASENT_BASE_URL environment support as the default API base URL source.
  api-url input still overrides it when set.
- Kept API routing V1-only: evaluate uses /v1-evaluate and permit verification uses /v1-verify-permit.
- Clarified action metadata and README quickstart around required pilot secrets:
  ATLASENT_API_KEY and ATLASENT_BASE_URL.

### Compliance and trust fixes

- Aligned license artifacts to Apache-2.0 across repository metadata and package metadata.
- Removed deprecated demo workflow toggles that could imply non-fail-closed operation.

### Verification status for this draft

- typecheck: passing
- build: passing
- tests: 180 passing

Do not publish this as a release until GitHub checks are green on main and the fail-closed behavior is validated in CI logs.

## AtlaSent GitHub Action Gate v1.3.0

This release aligns the public release notes with the shipped `action.yml` contract and the v2.1 batch/verification flow.

### Usage

```yaml
- uses: Atlasent/atlasent-action@v1
  env:
    ATLASENT_API_KEY: ${{ secrets.ATLASENT_API_KEY }}
  with:
    action: production.deploy
    actor: ${{ github.actor }}
    context: '{"repo":"${{ github.repository }}"}'
```

### Inputs

| Input | Required | Description |
|---|---|---|
| `ATLASENT_API_KEY` env | Yes | AtlaSent API key (`ask_live_*` or `ask_test_*`). |
| `action` | No* | Action type for single-eval path (ignored when `evaluations` is set). |
| `actor` | No | Actor identity. Defaults to `${{ github.actor }}`. |
| `target-id` | No | Target resource identifier; propagated for policy gating. |
| `environment` | No | Environment hint (`live` on main, `test` otherwise by convention). |
| `api-url` | No | API base URL. Default: `https://api.atlasent.io`. |
| `fail-on-deny` | No | Default: `true`. Set `false` for audit-only on policy deny. |
| `context` | No | JSON context object for single-eval path. Default: `{}`. |
| `evaluations` | No | JSON array for batch mode; overrides single-eval inputs. |
| `wait-for-id` | No | Evaluation ID to wait on until terminal (`allow`/`deny`). |
| `wait-timeout-ms` | No | Wait timeout in ms when using `wait-for-id`. Default: `600000`. |
| `v2-batch` | No | Opt into `/v1-evaluate/batch`. Default: `false`. |
| `v2-streaming` | No | Opt into SSE wait stream. Default: `false`. |

\* `action` is effectively required for single-evaluation usage.

### Outputs

| Output | Description |
|---|---|
| `decision` | Single-eval decision (`allow` / `deny` / `hold` / `escalate`). |
| `permit-token` | Consumed permit token audit reference (single-eval path). |
| `evaluation-id` | Evaluation ID (single-eval path). |
| `proof-hash` | Cryptographic proof hash (single-eval path). |
| `risk-score` | Numeric risk score or empty string if unavailable. |
| `verified` | `"true"` only when required permit verification passes; otherwise `"false"` (fail-closed). |
| `decisions` | Batch JSON array of per-item decision/verification results. |
| `batch-id` | Batch identifier from server or local fallback. |

### What was corrected from v1.0.0 notes

- Replaced stale input names (`atlasent_api_key`, `atlasent_anon_key`, `agent`) with live contract keys (`api-key`, `actor`, etc.).
- Removed deprecated/incorrect outputs (`decision_id`, `audit_hash`) and documented current outputs (`evaluation-id`, `proof-hash`, `risk-score`, `decisions`, `batch-id`).
- Documented v2.1 batch controls (`evaluations`, `wait-for-id`, `v2-batch`, `v2-streaming`) and strict `verified` semantics.
- Updated default API base URL to `https://api.atlasent.io`.

### Tag policy

The `@v1` tag is maintained for compatible updates. Pin to a specific version tag for reproducible builds.
