# Changelog

All notable changes to `atlasent-action` are documented here.

## [Unreleased]

### Added: the workload identity is re-presented at verify-permit

`@atlasent/enforce`'s `verifyPermit` and `reverifyPermit` now send the
caller's runtime-minted `actor_identity.v1` to `/v1-verify-permit` when the
config carries one, exactly as it was given. The action supplies a valid one on
each path:
- the single-step gate verifies seconds after evaluate with the same identity;
- the `verify-permit` boundary step sends the identity it already mints for
  `production.deploy` and the other change-control actions;
- `wait-for-approval` verifies the claimed permit with the identity minted at
  claim time, because the evaluate-time one may have expired during the wait.

The runtime checks this only for an action class classified
`verified_actor` (atlasent-api#3915). Every other class, which today is all of
them, ignores it, so nothing changes until a class is classified. Without
it, classifying `production.deploy` as `verified_actor` would deny every run of
this action (atlasent-api `docs/design/EXECUTION_PRINCIPAL_BINDING.md`,
rollout rule 3). Requests without an identity are byte-identical to before.

### Added: edge-function region pinning (`function-region`)

Every call to the AtlaSent runtime now carries an `x-region` header. The
hosted runtime defaults to `us-west-1`, the region of its database.
Supabase otherwise runs the function nearest the caller, and from an
east-coast runner that made evaluate about 3x slower: p50 5.2–7.3 s
against 1.8–2.1 s in-region. Configure it with the `function-region`
input or the `ATLASENT_FUNCTION_REGION` variable; `auto` turns pinning off.

Self-hosted runtimes are unchanged unless configured: they get no header
and byte-identical requests. A malformed value fails the step before any
request. One module owns the behaviour, `@atlasent/enforce`'s
`functionRegion`, which is also exported, and a guard test fails if any
other source file writes the header, or if a runtime caller skips it.

### `@atlasent/enforce` and `@atlasent/action` 2.1.0 (npm)

First npm release of `@atlasent/enforce` since 2.0.0. It ships every
`@atlasent/enforce` change merged since then (the Added/Fixed entries
below), which add new optional evaluate inputs and fix cloud-scoped permit
verification, hence a minor rather than a patch version. Both packages also
carry repository/homepage/bugs links pointing at the Atlasent GitHub org.
`@atlasent/action`'s build output is unchanged from 2.0.0; it moves to 2.1.0
because both packages publish together from one `npm-v` tag.

### Fixed: `verify-permit: 'true'` dropped the `context` input

The execution-boundary step (`verify-permit: 'true'`) ignored `context`, so a
permit issued with a cloud locus (`context.azure` / `context.aws`) in an
`evaluate-only` job could never be re-verified in the job that runs the
change: the runtime saw no locus and failed closed with
`AZURE_LOCUS_MISMATCH`. The step now re-presents `context` exactly as given.
A `context` that is not a JSON object fails the step (`INVALID_CONTEXT`)
before any verify call.

### Added: Azure DevOps task binds the ARM deployment (task 1.2.0)

New optional `azureDeploymentName` input (or `context.azure.deployment_name`;
if both are given they must agree). It is sent at evaluate as
`context.azure.deployment_name`, stored with the decision, and
`v1-azure-effect-verify` then accepts only
`Microsoft.Resources/deployments/write` on exactly that deployment
(atlasent-api#3640). Also fixes the task silently dropping a
`deployment_name` placed in the JSON context when it rebuilt `context.azure`.
A malformed name, or one given without a subscription and resource group,
fails the step.

### Fixed: AWS/Azure-scoped permits always failed verification

When the evaluate `context` carried `aws` (`account_id`, `region`) or
`azure` (`subscription_id`, `resource_group`), `v1-evaluate` signed those
values into the permit, and `v1-verify-permit` requires the same values
under `context` at verify. It treats an absent value as a mismatch
(`AWS_LOCUS_MISMATCH` / `AZURE_LOCUS_MISMATCH`). `@atlasent/enforce` never
sent `context` on the verify request, so every cloud-scoped permit failed
closed. It now re-presents exactly those two keys and nothing else from the
context. The fix is in `@atlasent/enforce`, so it reaches both this action's
`dist/index.js` and the Azure DevOps task's bundle. A permit without an
AWS/Azure scope sends a verify request byte-identical to before.

### Added: Azure DevOps task binds the Azure scope

`AtlaSentGate` gains `azureSubscriptionId` / `azureResourceGroup` inputs,
bound into the evaluate context as `context.azure` and re-presented at the
execution boundary. It also records the run's Azure DevOps metadata as
`context.azure_devops`, for audit only. The README documents the full
Azure Production Change Gate pipeline, including the post-deploy
`v1-azure-effect-verify` call.

### Removed: `v2-batch` input (#131)

`v2-batch: "true"` routed the `evaluations:` batch-eval path at a
`/v1-evaluate/batch` endpoint that never existed on the runtime API —
atlasent-api's `v1-evaluate` entry dispatcher only recognizes a
`/close-ops` suffix, no `/batch` sub-route. Every real call with
`v2-batch: "true"` set failed. Fixing the endpoint requires a
server-side change in atlasent-api that is out of scope for this repo, so
the input (and the client-side `/v1-evaluate/batch` POST, 404-fallback,
and >100-item chunking logic it drove) was removed entirely rather than
left as a documented-but-broken opt-in.

**Compatibility:** this only affects callers who explicitly set
`v2-batch: "true"` — an input GitHub Actions silently ignores if you keep
passing it. Because that opt-in could never have worked in production
(every real call 404'd against a nonexistent route), removing it is not a
behavior regression for any working caller. The default `evaluations:`
path — one sequential `/v1-evaluate` POST per item, unaffected by this
change — remains the only batch-eval behavior.

### SDK bump: `@atlasent/sdk` → `2.16.0` (pilot client-surface alignment)

Bumps the bundled `@atlasent/sdk` from `2.10.0` to `2.16.0` — the current
latest **published** npm version. `2.10.0` predates `2.14.0`, the release that
added the top-level `state_snapshot` field; with the pilot's action classes
defaulting to `requires_state_snapshot = true`, the stale pin was a
client-surface drift (the Action injects `state_snapshot` at the HTTP layer, so
the deploy gate kept working, but the bundled SDK was behind). `2.16.0` is the
known-good pinned version for the pilot path. No publish was required — this is
a dependency/lockfile bump only.

> The SDK repo source is at `2.17.0`, but that version is not published to npm
> yet. The Action tracks the latest *published* version; it moves to `2.17.0`
> when (and if) `2.17.0` is released. The Action does not import `@atlasent/sdk`
> at runtime (the contract goes over HTTP), so this bump carries no behavioral
> change to the gate.


### Approvals from PR reviews (P0 — deploy pilot)

The single-eval path now derives `context.approvals` from the pull request's
reviews, so the canonical `allow-2-approvals-change-window` policy template
works out of the box without a second integration.

- New `approvals-from` input (`pr-reviews` default | `none`). When
  `pr-reviews`, the action counts distinct reviewers whose latest review state
  is `APPROVED` (GitHub's own latest-review-per-user semantics:
  `COMMENTED`/`PENDING` don't change approval; a later `CHANGES_REQUESTED` or
  `DISMISSED` supersedes an earlier `APPROVED`) and injects
  `context.approvals` + `context.approving_reviewers`.
- Resolves the PR from the `pull_request` event ref, or — on a `push`/merge to
  the default branch — from the head commit's associated PR
  (`GET /repos/{repo}/commits/{sha}/pulls`).
- Requires `GITHUB_TOKEN` (`env: GITHUB_TOKEN: ${{ github.token }}`).
- **Best-effort, fail-open-to-zero:** any API error (including a non-JSON
  body) yields `0` approvals, which denies a count-gated deploy — the
  fail-closed direction. Never throws.
- The operator's `context` input still wins (an explicit `approvals` overrides
  the derived value). `change_window` remains an operator-supplied signal.
- New module `src/approvals.ts` with 16 unit tests; `dist/index.js` rebuilt.

### V1 convergence — SDK realignment verification (P0)

V1 pilot SDK alignment audit. `@atlasent/sdk` remains pinned at the latest
published npm version (`2.10.0`); the `2.11.0` source in
`atlasent-sdk/typescript/` is not yet published to the public registry as of
this commit. When `2.11.0` ships to npm, the pin should be bumped in a
follow-up PR.

Verified during the audit:
- Action does not import `@atlasent/sdk` directly — the runtime contract goes
  through `@atlasent/enforce`, which implements its own transport. The SDK pin
  is declarative only (for downstream consumers reading `package.json`).
- All 242 unit/integration tests pass against the current pin.
- `dist/index.js` rebuilt and committed (build is reproducible at 69.7kb).
- No regressions in the `client.evaluate` / `client.verifyPermit` /
  `client.evidenceBundles` surface used elsewhere in the platform.

No code changes in this entry — verification only.

## [2.11.0] — 2026-05-27

### SDK bump: `@atlasent/sdk` → `2.11.0`

Pins `@atlasent/sdk` at `2.11.0` (B.AC1 from V2_ROLLOUT.md). This release adds
three typed sub-clients available to action authors on the top-level SDK client:

- **`client.auth`** — token refresh and IdP connection listing.
- **`client.scim`** — SCIM 2.0 user and group provisioning.
- **`client.evidenceBundles`** — generate and download Ed25519-signed evidence
  bundles for audit and compliance workflows.

Also exports **`verifyEvidenceBundle(bundle)`** from the SDK root for offline
bundle integrity verification — no network call required. Useful in GxP and
regulated environments where evidence artifacts are archived and re-verified
against the original hash chain.

No action logic was changed; this is a dependency version bump and documentation
update only.

## [unreleased] — 2026-05-18

### Platform-generation reframing (doc-only, no code change)

Mirrors the umbrella reframing in the internal `CHANGELOG.md`. Platform generations: **v1** = pilot + cash-flowing capability layer (this repo's V2_ROLLOUT.md is preserved with a normalization header and continues to apply); **v2** = full enterprise surface (the internal `ENTERPRISE_V2_ROLLOUT.md`); **v3** = execution assurance. `V2-D#` identifiers retained; new decisions use `PROD-D#`. Package SemVer (e.g. `@atlasent/sdk@2.x`) is decoupled from platform generation labels per the internal `VERSIONING_DOCTRINE.md` doctrine 1.

## [0.1.0] — 2026-05-01 — initial public release

This is the first version-stable release. Earlier internal tags
(`v1.0.0` 2026-04-17, plus the source-only `v1.2.0` and `v1.3.0`
milestones) are superseded — they were aspirational version markers
during pre-release development and were never adopted by external
consumers. Resetting to `0.1.0` aligns the version contract with
SemVer (`0.x` while the public surface is still settling) and gives
us room to stabilise inputs/outputs before committing to the
SemVer-1.0 promise.

### Action

- **`evaluate` step** — calls `POST /v1-evaluate` before any
  deployment step executes. Threads `actor`, `action`, `target-id`,
  `bundle-id`, `change_window`, `approvals`, and arbitrary `context`
  into the request.
- **`verify-permit` step (A5)** — calls `POST /v1-verify-permit`
  after evaluate returns `decision: allow`. Closes the audit record
  and confirms the permit hasn't been revoked or already consumed.
  `verified` output is `"true"` only when both gates pass; `"false"`
  otherwise. Downstream steps must branch on `verified`, not
  re-derive from `decision`.
- **v2.1 batch entry point (B.AC4)** — `evaluations` input accepts
  a JSON array; the v2.1 path (`runV21` → `evaluateMany` →
  per-decision `verifyOne`) is used in place of single-eval when set.
- **`wait-for-id` / `wait-timeout-ms`** — block on a hold/escalate
  decision until the upstream approver flips it (SSE stream or
  polling fallback).
- **`v2-batch` / `v2-streaming` flags** — opt in to
  `/v1-evaluate/batch` and SSE streaming respectively.

### Outputs

- `decision` — `allow` / `deny` / `hold` / `escalate`.
- `permit-token` — single-use, audit reference (already consumed by
  the verify-permit step).
- `decision-id` — UUID for audit-trail correlation.
- `audit-hash` — tamper-evident context hash.
- `verified` — `"true"` only when verify-permit succeeded.
- `risk-score` — numeric risk score from the Decision response.
  Probes `result.risk.score` first (atlasent-api openapi
  `Decision.risk` shape), falls back to `result.risk_score` for
  older evaluators. Empty string when neither is present so
  `if: steps.gate.outputs.risk-score` doesn't see `undefined`.
- `decisions` (batch path) — JSON array of per-item results.
- `batch-id` (batch path) — server-assigned batch ID, or
  `loop-<ts>` for the sequential fallback.

### Inputs

- `api-key`, `agent`, `action`, `bundle-id`, `target-id`,
  `change_window`, `approvals`, `context`, `evaluations`,
  `wait-for-id`, `wait-timeout-ms`, `v2-batch`, `v2-streaming`.

### `@atlasent/enforce` (workspace package, v0.1.0)

- `enforce()` — orchestrator: `evaluate → verify → verifyPermit →
  execute`. The user-supplied `fn` never runs unless all three
  gates pass.
- `verifyPermit(config, decision)` — `POST /v1-verify-permit`;
  throws `EnforceError(phase="verify-permit")` for replay, expired
  tokens, missing `permit_token`, network errors, and `!2xx`
  responses.
- `EnforcePhase` enum: `evaluate | verify | verify-permit | execute`.

### Fail-closed behaviour

Every error path blocks the workflow:

- API unreachable, request timeout, or 5xx → step fails.
- Evaluator returns no `permit_token` for an `allow` → step fails.
- Verify-permit returns `verified: false` → `verified` output is
  `"false"`, step continues if `failOnDeny=false`, fails otherwise.
- Replay or consumed permit → `verified: false`, fail-closed.
- Malformed JSON in `evaluations` / `context` inputs → typed error
  message (no raw `SyntaxError` leakage).
- Hold / escalate → step fails when `failOnDeny=true`; gates
  downstream steps via `decision != "allow"` regardless.

### Reliability fixes baked in

- `transport.ts` handles mid-response `ECONNRESET` cleanly
  (`res.on("error", reject)` alongside `req.on("error", reject)`).
  Earlier internal builds crashed Node.js on the unhandled emitter.
- `waitViaPolling` retries both 5xx and `fetch` throws (network
  errors, malformed-JSON 200s); `AbortError` is re-thrown so
  caller cancellation still works.
- Batch error path emits `decisions=[]` and `batch-id=""` before
  failing so downstream `if: always()` steps see defined values.
- `wait-for-id` allow path: when polling resolves a hold/escalate
  to `allow`, `verifyOne` is called on the terminal permit (no
  `permitToken` → `verified=false`, fail-closed).

### Test surface (99 unit tests)

- `src/__tests__/gate.test.ts` — 9 SIM tests for `verifyOne()`.
- `src/__tests__/batch.test.ts` — 6 batch SIM tests.
- `src/__tests__/inputs.test.ts` — JSON parsing + error message tests.
- `packages/enforce/src/__tests__/verify-permit.test.ts` — 14 SIM tests.
- `packages/enforce/src/__tests__/transport.test.ts` — 5 socket-level tests.
- `packages/enforce/src/__tests__/enforce.test.ts` — orchestrator tests.

### GitHub Actions job summary

Renders a markdown table with decision, actor, SHA, branch, reason,
permit-token, audit-hash for every run (success or failure).

### GxP support

`change_window` and `approvals` context inputs ride through to the
evaluator without modification, enabling deny-on-out-of-window and
deny-on-missing-approval policies in regulated environments.

## [0.x] — Pre-release

The repository's earlier `v1.0.0` (2026-04-17), source-only
`v1.2.0` (2026-04-25), and source-only `v1.3.0` (2026-04-30)
milestones predate this release. They were not adopted by external
consumers and are not represented as separate Marketplace releases.
All shipped behaviour from those milestones is documented under
`[0.1.0]` above.
