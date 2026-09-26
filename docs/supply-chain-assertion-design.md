# Design: `supply_chain.v1` assertion issuance

Status: **scoping only — no implementation in this PR.** Written to close
Named Follow-up #2 from `atlasent-control-plane`'s CLAUDE.md ("build
`supply_chain` assertion issuance in `atlasent-action`") with a concrete plan,
since a real implementation needs cross-repo work this session can't do or
verify alone (see "Why this needs a dedicated session" below).

## 1. Current urgency: re-checked against control-plane PR #180

The reason this follow-up existed — three publish gates
(`publish-images.yml`, `publish-marketplace-images.yml`,
`package-helm-oci.yml`) in `atlasent-control-plane` blocked on
`artifact.release`, which requires a `supply_chain` assertion this repo
can't mint — **no longer applies to those three gates specifically.**

An internal control-plane PR (open, draft, not yet merged as of this
writing; not public)
re-targets all three from `artifact.release` to `package.release`, with a
live production query as evidence: `artifact.release` has exactly one row in
runtime prod (`org_id: null`, the unprovisioned Canon template, zero active
`constraint_bundles`) — no org has ever provisioned it. `package.release` is
live today with active bundles in 5 orgs, one of which (the AtlaSent release
org — id omitted, this is a PUBLIC repo) already gates real release workflows
for this repo, `atlasent-verify`, and `atlasent-sdk`, and is `role-only` with
`required_assertion_classes` empty — no `supply_chain` assertion needed.
`atlasent-action`'s own `release.yml` already dogfoods this exact
`package.release` gate (see `RELEASING.md` step 2 / `CLAUDE.md` "Release
process").

PR #180's own body states the supply-chain-assertion-issuer follow-up "stays
withdrawn — not needed for this action type" for those three gates.

**Consequence: this design doc is not blocking anything today.** It exists
because `artifact.release` (CANON-000002) is still a real Canon action any
future publish-shaped gate could reasonably target — its `role-only` +
`supply_chain` authorization pattern is a correct semantic fit for "a
build produced this exact artifact and it wasn't tampered with in transit,"
which `package.release`'s pure role check does not attest to. Building this
capability once, correctly, is worth having on the shelf.

## 2. What the Canon action requires

Source: `atlasent` repo, `contract/canonical-actions/ACT-0002-artifact-release.yaml`
(canon_id `CANON-000002`, slug `artifact.release`).

```yaml
gate_flags:
  requires_verified_actor: true
  requires_state_snapshot: true
  required_assertion_classes:
    - supply_chain
authorization_pattern:
  type: role-only
  roles_allowed: [release-manager, maintainer, ci-release-bot]
  conditions: [actor_role_required, verified_actor_required, supply_chain_assertion_required]
evidence_requirements:
  required_assertions: [supply_chain]
  notes: >
    State snapshot should include the artifact content hash and the registry
    destination. The supply_chain assertion provides SLSA-level provenance.
```

The spec's own test cases pin the expected shape precisely:

- `missing supply chain assertion` → deny, `ASSERTION_UNVERIFIED` (a
  verified actor is not sufficient on its own).
- `verified CI bot with supply chain assertion` → allow.
- The `sales.objections` entry spells out the threat model directly: 2FA on
  the publishing account doesn't stop a compromised CI pipeline from
  publishing with valid credentials; the assertion has to prove *this build*
  produced *this exact artifact*, not just that *some* authorized actor is
  calling.

So a `supply_chain` assertion is not "an extra JSON field the workflow
fills in" — per `atlasent-api`'s own IMPL-029 doctrine (Canon identity ≠
Canon conformance), a caller-declared `context.*` field is never an
acceptable substitute for a fact the CAR expects to be platform-verified.
The assertion has to be **independently checkable by the runtime**, the same
way `actor_identity.v1` is today (see next section) — not merely present.

## 3. Existing precedent in this repo: `actor_identity.v1` (`src/workloadIdentity.ts`)

`production.deploy`'s `requires_verified_actor` gate is satisfied today by
`mintGithubActionsActorIdentity()`:

1. The action requests a GitHub OIDC JWT scoped to audience
   `atlasent:actor_identity.v1` (`ACTIONS_ID_TOKEN_REQUEST_URL` /
   `_TOKEN`, requires `permissions: id-token: write`).
2. It POSTs that raw JWT (never a self-constructed identity claim) to a
   **runtime-owned broker endpoint**, `POST /v1-idp-broker/mint/actor-identity`,
   along with `action_type` / `environment`.
3. The broker verifies the JWT against GitHub's OIDC issuer, derives
   `repository` / `sha` / `workflow_ref` / `actor` / etc. itself, and returns
   a signed `actor_identity.v1` assertion object plus the `source` claims it
   was derived from.
4. `index.ts` attaches the returned assertion — never a client-built one —
   to `EnforceConfig.actorIdentity`, which `@atlasent/enforce` forwards to
   `/v1-evaluate`.

The governing rule stated in the module's own header comment: *"The Action
never constructs `actor_identity.v1` itself and never accepts an
issuer/principal kind from workflow input."* A `supply_chain` assertion must
follow the same shape: **minted by a runtime broker from independently
checkable inputs, never self-asserted by the calling workflow.**

## 4. Proposed `supply_chain.v1` assertion shape

Modeled on `actor_identity.v1`'s split between "what the broker verified"
(`source`) and "what gets forwarded to evaluate" (`assertion`):

```ts
interface SupplyChainAssertionSource {
  issuer: "https://token.actions.githubusercontent.com";
  repository: string;          // owner/repo that produced the artifact
  repository_id: string;
  ref: string;
  sha: string;                 // commit the artifact was built from
  workflow_ref: string;
  run_id: string;
  run_attempt: string;
}

interface SupplyChainAssertion {
  version: "supply_chain.v1";
  subject: {
    digest: string;             // "sha256:<hex>" — the artifact's real digest
    digest_algorithm: "sha256";
    name: string;                // e.g. "npmjs.org:@atlasent/sdk@1.2.3" or an image ref
  };
  predicate_type: string;        // e.g. "https://slsa.dev/provenance/v1"
  builder_id: string;            // GitHub Actions OIDC-derived builder identity
  materials: Array<{ uri: string; digest: Record<string, string> }>; // source commit(s)
  provenance_verified_by: "github_artifact_attestations" | "cosign" | "in_toto";
  issued_at: string;             // RFC3339, broker-stamped
}
```

The load-bearing design question this doc deliberately does **not** answer
is *how the broker independently confirms* `subject.digest` actually
corresponds to what the workflow says it just built — that's the whole
point of the assertion, and getting it wrong (trusting a client-declared
digest) would recreate the IMPL-029 anti-pattern under a new field name.
The strongest available anchor is GitHub's own **Artifact Attestations API**
(`GET /repos/{owner}/{repo}/attestations/{subject-digest}`, populated by
`actions/attest-build-provenance` in the `build` job) — the broker calls
that API itself server-side using the repository derived from the verified
OIDC token, rather than trusting anything the workflow POSTs. This mirrors
how `mintGithubActionsActorIdentity` never trusts a client-supplied
`repository` field either.

## 5. Where this plugs into `atlasent-action`

Symmetric with the existing pattern:

- New module `src/supplyChainAssertion.ts`, exporting
  `mintGithubActionsSupplyChainAssertion()` — same OIDC-token-then-POST
  shape as `workloadIdentity.ts`, hitting a new broker route
  `POST /v1-idp-broker/mint/supply-chain-assertion`.
- `index.ts`: called alongside `mintGithubActionsActorIdentity` in
  `resolveProtectedActor` (or a sibling resolver), gated on the action type
  requiring it — likely widened past the current
  `args.actionType !== PRODUCTION_DEPLOY_ACTION` check to also cover
  `artifact.release`, since that's the one CAR that declares
  `required_assertion_classes: [supply_chain]` today.
- `EnforceConfig` (in `packages/enforce/src/index.ts`) needs a new field,
  e.g. `supplyChainAssertion?: Record<string, unknown>`, forwarded into the
  evaluate request the same way `actorIdentity` is today — this is a
  `@atlasent/enforce` change, not just `src/index.ts`.
- A new `artifact-digest`-shaped input already exists in this action
  (`artifact-digest`, used for `PAYLOAD_MISMATCH`/`MISSING_BINDING`
  re-presentation per README's execution-boundary pattern) — the new
  assertion mint should consume that same input as `subject.digest` rather
  than inventing a second digest input.

## 6. Server-side dependencies this repo cannot build or verify alone

This is why the task's own instructions call for a design doc rather than
code: every one of these lives outside `atlasent-action` and needs its own
review.

1. **New `atlasent-api` broker endpoint** (`v1-idp-broker/mint/supply-chain-assertion`
   or equivalent) that verifies the OIDC token, calls GitHub's Artifact
   Attestations API server-side, and signs the resulting assertion. No such
   endpoint exists today (only `mint/actor-identity` does).
2. **Wire type addition.** Per `atlasent`'s CLAUDE.md, any new wire shape
   goes through `contract/schemas/` first, then `atlasent-api/packages/types/`
   and `atlasent-sdk`'s drift detector — a `supply_chain.v1` assertion type
   needs to be added there before any repo can safely consume it.
3. **Evaluate-handler validation.** Whether `v1-evaluate/handler.ts`
   currently validates `required_assertion_classes` from the CAR against a
   posted assertion at all (vs. relying entirely on the seeded
   `constraint_bundle`'s own template rules) is **unverified** from this
   session — that needs to be confirmed in `atlasent-api` before assuming
   this broker-minted assertion would even be checked server-side once
   issued.
4. **Product/security decision on `provenance_verified_by`.** Whether GitHub
   Artifact Attestations alone is an acceptable provenance source, or
   whether cosign/in-toto signing should be required/preferred, is a
   judgment call that should get its own review rather than being decided
   inside a single PR.
5. **Org provisioning.** Per follow-up #1 in `atlasent-control-plane`'s
   CLAUDE.md (explicitly out of scope for this doc too), nobody has
   confirmed any org actually wants `artifact.release` provisioned yet —
   building the issuer before there's a seeded policy to satisfy would be
   premature.

## 7. Recommended next step

Not urgent (see §1) — no CI is blocked on this today. When picked up, start
with #3 above (confirm the evaluate handler's assertion-validation behavior
in `atlasent-api`) before writing any broker code, since it determines
whether steps 4–6 in this doc's plugin plan are even meaningful as designed.
