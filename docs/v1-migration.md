# Migrating to v1

This guide covers changes when upgrading to `atlasent-action@v1`.

## Breaking Changes from Pre-release

### Credentials moved from `with:` inputs to `env:`

Pre-release builds accepted the API key as a `with:` input. `action.yml`
does not declare any `api_key` / `atlasent_api_key` / `anon_key` input —
credentials are read from environment variables instead, so they use
GitHub's secret-masking on every log line:

| Old (`with:` input) | New (`env:` var) | Notes |
|-----|-----|-------|
| `api_key` | `ATLASENT_API_KEY` | Required on every mode |
| — | `ATLASENT_BASE_URL` | Required — Supabase functions base URL, e.g. `https://<ref>.supabase.co/functions/v1` |

There is no `anon_key` / `atlasent_anon_key` input or env var in the current action.

### Input renames

| Old | New | Notes |
|-----|-----|-------|
| `action_type` | `action` | Shortened |

### Output additions

v1 adds these outputs (see `action.yml` for the full list of 48):
- `permit-token`: pass to a later `verify-permit: 'true'` step to re-verify and consume it at the execution boundary
- `verified`: `"true"` only when `decision=allow` AND the permit was verified — gate on this, not `decision`
- `audit-hash`: tamper-evident audit hash, when the API returns one

## Upgrade Example

**Before (pre-release):**
```yaml
- uses: atlasent-systems-inc/atlasent-action@v0
  with:
    api_key: ${{ secrets.ATLASENT_API_KEY }}
    action_type: deploy
```

**After (v1):**
```yaml
- name: Gate with AtlaSent
  id: gate
  uses: Atlasent/atlasent-action@v1
  env:
    ATLASENT_API_KEY: ${{ secrets.ATLASENT_API_KEY }}
    ATLASENT_BASE_URL: ${{ secrets.ATLASENT_BASE_URL }}
  with:
    action: production.deploy
    environment: production

- name: Deploy
  if: steps.gate.outputs.verified == 'true'
  run: ./scripts/deploy.sh

# Re-verify the permit at the execution boundary (optional, recommended for
# multi-step workflows where the gate step and the protected step are not
# adjacent):
- name: Verify permit
  if: always()
  uses: Atlasent/atlasent-action@v1
  env:
    ATLASENT_API_KEY: ${{ secrets.ATLASENT_API_KEY }}
    ATLASENT_BASE_URL: ${{ secrets.ATLASENT_BASE_URL }}
  with:
    verify-permit: 'true'
    permit-token: ${{ steps.gate.outputs.permit-token }}
    action: production.deploy
    environment: production
```

There is no `action: verify` mode, `permit_id` input, or `outcome:` input —
`verify-permit` is a separate boolean input (see above), and the permit
identifier is passed via `permit-token`, not `permit_id`.

## New: Verify Step

v1 introduces an optional `verify-permit: 'true'` mode that re-verifies
(and consumes) an already-issued permit at the execution boundary,
independent of the gate step that issued it. This closes the audit record
after execution and helps satisfy 21 CFR Part 11 §11.10(e) audit trail
requirements.

Always add a verify step with `if: always()` so it runs even when a prior
step fails.
