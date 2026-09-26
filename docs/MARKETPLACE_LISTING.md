# GitHub Marketplace Listing — AtlaSent Gate

Operator procedure + approved listing copy for publishing this action to the
GitHub Marketplace. This listing is a developer *discovery* channel: the
action is free, drives API signups, and bills nothing itself.

## Prerequisites (all already true — verify, don't rebuild)

- [x] `action.yml` has `name`, `description`, and `branding` (`shield` / `green`).
- [x] The repo is public with a `README.md` (the Marketplace page body).
- [x] Releases exist and the floating `v1` tag tracks the latest (RELEASING.md).
- [ ] The Marketplace name "AtlaSent Gate" is unused by another listing
      (checked at publish time — GitHub enforces uniqueness on save).
- [ ] Two-factor auth enforced for the publishing account (GitHub requirement).

## Approved listing copy

| Field | Value |
|---|---|
| Listing name | **AtlaSent Gate** (from `action.yml`) |
| Short description | from `action.yml` — do not fork a second description string |
| Primary category | **Deployment** |
| Secondary category | **Security** |
| Pricing | Free (the action is open; usage is billed by the AtlaSent API per the approved pricing record — never through GitHub) |

## Publish procedure (one-time)

1. Draft a release for the current tag in the GitHub UI (or edit the latest
   published release).
2. Tick **"Publish this Action to the GitHub Marketplace"**, accept the
   Marketplace Developer Agreement on first use, pick the categories above.
3. Publish. Subsequent releases created by `release.yml` keep the listing
   updated automatically — the listing always shows the latest release, and
   `@v1` continues to resolve per RELEASING.md.

## After publishing

- Confirm the listing page renders the README correctly (badges, YAML blocks).
- Add the Marketplace link to atlasent-docs' integration page and the
  console onboarding "connect CI" step (follow-ups, not blockers).
- Steady-state: nothing manual — RELEASING.md's existing "Confirm the
  Marketplace listing" step covers each release.

## What this listing is NOT

No billing, no plans, no paid tiers through GitHub. All monetization stays
on the governed action via the AtlaSent API (pricing decision record
2026-07-31: $50 / 1,000 governed actions, parity across channels).
