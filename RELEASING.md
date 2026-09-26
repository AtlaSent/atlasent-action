# Releasing `atlasent-action`

Customers reference the action as
`uses: Atlasent/atlasent-action@v1`, so a published `v1` GitHub
Release must exist and the floating `v1` tag must track the latest `v1.x`.

The [`Release`](.github/workflows/release.yml) workflow builds, verifies the
committed `dist/index.js`, runs the AtlaSent release gate (dogfood), keyless-signs
the bundle with cosign, **creates the GitHub Release**, and **moves the floating
`v1` tag** to it.

## Prerequisites

- `dist/index.js` is committed and current (`npm run build` produces no diff).
  The release **fails** if it has drifted — build and commit it before tagging.
- Repo secrets: `ATLASENT_API_KEY`, `ATLASENT_BASE_URL` (for the release gate).

## No manual publish path

The one-time `bootstrap` input (skip the release gate to publish the first `v1`)
has been **removed**: `v1` exists, and a gate-skip input is a standing way
around the gate. A manual run of `Release` is now a dry run: it builds and
verifies `dist/index.js` and does nothing else. It does not gate, sign, create a
Release or move `v1`. The org's `package.release` policy (v7) likewise only
authorizes `Release` on a `push` of a `vX.Y.Z` tag.

The same applies to `Publish packages` (the npm packages): its `publish` and
`skip_gate` inputs are gone, a manual run is build + test only, and publishing
requires pushing an `npm-v<semver>` tag.

## Releasing

Push a tag. The gate runs (dogfood) on every release:

```sh
git tag v1.4.0
git push origin v1.4.0   # release.yml runs on the tag push, gate active
```

The workflow creates the `v1.4.0` Release and advances `v1` automatically.

> **An automated Claude Code session cannot do this step itself (confirmed
> 2026-09-10, not assumed).** Tag pushes and ref deletions get an HTTP 403
> from this environment's git credential, while ordinary branch pushes to
> the same repo succeed immediately before and after — isolated by testing
> a branch push/delete against the same remote in the same session. A
> session can prepare everything up to the tag (build, verify `dist/index.js`
> is current, confirm CI is green on the target commit) and hand back the
> exact `git tag`/`git push` commands, but a human has to run them.

## Correcting `v1` out of band

Use the [`Move v1 floating tag`](.github/workflows/create-v1-tag.yml) workflow
(`gh workflow run create-v1-tag.yml -f target_tag=v1.3.0`). Defaults to the
latest `v1.*.*` tag when no target is given. No hardcoded SHAs.

## Note: version vocabulary

`package.json` is currently `2.0.0` while the published tag line is `v1.x`
(matching the README and the console onboarding snippet). The git tag — not
`package.json` — is what `uses: …@v1` resolves and what the Marketplace lists, so
this does not affect resolution. Reconciling `package.json` to the `v1` line is a
separate cleanup.
