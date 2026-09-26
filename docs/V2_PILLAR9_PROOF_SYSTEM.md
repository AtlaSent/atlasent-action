# Pillar 9 — Verifiable Proof System: Action workstreams

> **Doctrine normalization header (2026-05-18).** This file is
> preserved unchanged below per Doctrine 4 of
> [`atlasent/VERSIONING_DOCTRINE.md`](https://github.com/Atlasent/atlasent/blob/claude/normalize-roadmap-versioning-NWPuP/VERSIONING_DOCTRINE.md).
> Under the current doctrine there is no "v2 product"; the verifiable
> proof system described here belongs to **Phase 3** (Execution
> Assurance & Operational Sovereignty), shipping additively on the
> `AtlaSent v1` contract. The filename, "Pillar 9" identifier, and
> code-level flag name (`v2_proof_system`) are retained per Doctrine 4.

Companion to
[`atlasent-api/docs/V2_PILLAR9_PROOF_SYSTEM.md`](https://github.com/Atlasent/atlasent-api/pull/116).

**Do not implement until v1 GA. Do not merge until v2 GA.**

---

## Action workstreams

### 1. New outputs: `proof-id` and `payload-hash`

Add to `action.yml`:

```yaml
outputs:
  decision:
    description: allow | deny | hold | escalate
  risk-score:
    description: Numeric risk score 0-100
  proof-id:
    description: Proof ID for the issued authorization (present on allow)
  payload-hash:
    description: SHA-256 of the canonicalized action payload
  verification-url:
    description: Public proof page URL for this decision
```

### 2. Payload hash from CI context

The action computes `payloadHash` from a deterministic subset of CI context:

| Field | Source |
|---|---|
| `GITHUB_SHA` | Commit hash being deployed |
| `GITHUB_WORKFLOW` | Workflow name |
| `GITHUB_RUN_ID` | Run ID |
| `GITHUB_REPOSITORY` | Repo identifier |
| Additional fields declared via `payload-fields:` input | User-declared |

The hash is computed using the same canonical JSON algorithm as the SDK
(`hashPayload()` / `@atlasent/sdk`). The raw CI context values are never
sent to the API — only `payloadHash`.

Example workflow:

```yaml
- uses: atlasent-systems/atlasent-action@v2
  id: gate
  env:
    ATLASENT_API_KEY: ${{ secrets.ATLASENT_KEY }}
  with:
    action: production.deploy
    payload-fields: |
      environment=production
      approver=${{ github.actor }}

- name: Use proof ID
  run: echo "Proof: ${{ steps.gate.outputs.proof-id }}"
```

### 3. Post-job consume step

When `mode: gate` (default), the action gates on the decision. In v2, a
post-job step finalizes the proof after the gated job completes.

On job success:
```
POST /v1/permits/:id/consume
{ payloadHash, executionStatus: 'executed' }
```

On job failure:
```
POST /v1/permits/:id/consume
{ payloadHash, executionStatus: 'failed', exitCode }
```

Implemented as a `post:` lifecycle step (composite action). The permit ID
and payload hash are stashed in `$RUNNER_TEMP` by the main step for the
post step to read.

### 4. Check-run proof link

When check-run mode is active (Pillar 5 of action v2 plan), the check-run
`details_url` links to the public proof page:

```
https://app.atlasent.io/proofs/{proofId}
```

This makes proof verification accessible directly from the GitHub PR checks
panel.

### 5. Advisory mode proof

When `mode: advisory` is active (action does not block on deny), the proof
is still created and emitted as an output. The proof `executionStatus` will
be `executed` regardless of the decision, surfacing advisory-mode bypass
in the audit trail.

---

## Open questions

1. **Post-job consume: composite `post:` vs separate finalize step.**
   Composite `post:` is cleaner. JS action requires users to add a separate
   finalize step. Which wins? Recommendation: composite action with `post:`.
2. **`payload-fields:` input.** Explicit key=value list, or auto-capture
   all available `GITHUB_*` env vars? Recommendation: explicit list — predictable
   hash, no accidental inclusion of sensitive env values.
3. **Advisory mode proof disclosure.** Should advisory bypasses be flagged
   in the proof as a distinct `executionStatus` (e.g. `advisory_executed`)
   rather than plain `executed`?
