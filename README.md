# AtlaSent Gate Action

GitHub Action that enforces execution-time AtlaSent authorization gates on deployments and other critical CI/CD actions.

It is the pipeline step behind AtlaSent **Production Change Protection**. Enterprise teams that need coverage across many pipelines and change paths can [schedule an Enterprise call](https://cal.com/atlasent/discovery); everyone else can start free with an API key.

AtlaSent evaluates an attempted action before it executes, issues a scoped permit
when the action is authorized, and verifies that permit before the protected step
runs. A deny, hold, escalation, invalid permit, infrastructure failure, or binding
mismatch fails closed.

```text
workflow attempts action
        │
        ▼
AtlaSent evaluates authorization under organizational authority
        │
   ┌────┴────┐
   │         │
 permit     deny / hold / escalate / error
   │         │
 verify      └──────────────► protected step does not run
   │
   ▼
protected step may run
```

## Release status

**v1.6.0 is published.** The floating `v1` tag points to the reviewed v1.6.0
release commit, which includes the security fix preventing caller-supplied
context from overriding verified GitHub-derived facts.

Use `Atlasent/atlasent-action@v1` for the normal floating-major
form. Organizations that require an immutable dependency pin can use
`Atlasent/atlasent-action@eaf6e17c50340f97a5a1cec53d9aea9b64c2a6f1`.

## Quick start

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    permissions:
      contents: read
      id-token: write
    steps:
      - name: Authorization gate
        id: gate
        uses: Atlasent/atlasent-action@v1
        env:
          ATLASENT_API_KEY: ${{ secrets.ATLASENT_API_KEY }}
          ATLASENT_BASE_URL: ${{ secrets.ATLASENT_BASE_URL }}
        with:
          action: production.deploy
          environment: production
          target-id: ${{ github.repository }}

      - name: Deploy
        if: steps.gate.outputs.verified == 'true'
        run: ./deploy.sh
```

**Gate on `verified`, not on `decision`.** `verified=true` means the action was
allowed and the server successfully verified the single-use permit.

## Verified GitHub workload actor

`production.deploy` never authorizes the caller-supplied `actor` string. The
Action requests the job's GitHub OIDC token (audience
`atlasent:actor_identity.v1`) and sends it to the runtime-owned identity broker.
The broker verifies GitHub's signature and exact enrolled repository, workflow,
ref, GitHub Environment, AtlaSent environment, tenant, and action before it
mints `actor_identity.v1`. Missing OIDC permission or any binding mismatch
blocks the step before evaluation.

Each production deploy job therefore needs:

- `permissions: id-token: write`
- a GitHub `environment:` matching its enrolled workload binding
- an `ATLASENT_API_KEY` carrying `evaluate:write`, `verify:execute`, and
  `idp_broker:mint`

The verified workload is the protected-action **Actor whose organizational
authority is evaluated**. Verifying the workload identity establishes who or
what is acting; it does **not** itself grant organizational authority or
authorize the deployment. The AtlaSent runtime separately determines whether
that exact action is authorized now under the organization's current authority,
policy, approvals, and request bindings. The human who dispatched the run is
retained separately as `context.triggering_actor` for provenance; it is not
allowed to impersonate the workload.

The same rule applies to the `evaluations` batch input. Every
`production.deploy` item must include its own non-empty `environment`; the
Action obtains an independent GitHub OIDC token and runtime-minted assertion
for each such item. Mixed batches retain their supplied actors for
non-production actions. Any caller-supplied `actor_identity` is discarded.

## Artifact release with verified provenance (`artifact.release`)

`artifact.release` (Canon CANON-000002) publishes a versioned artifact to a
registry. The runtime requires a verified workload actor **and** a
`supply_chain` assertion. For this action the gate mints both, and it fails
closed if either cannot be minted. There is no fallback to the caller-supplied
actor, unlike `package.release`.

```yaml
permissions:
  contents: read
  id-token: write        # two OIDC tokens: actor identity and provenance
  attestations: write    # for actions/attest-build-provenance
steps:
  - run: npm pack        # produces widget-1.2.3.tgz
  - id: attest
    uses: actions/attest-build-provenance@v2
    with:
      subject-path: widget-1.2.3.tgz
  - id: digest
    run: echo "digest=sha256:$(sha256sum widget-1.2.3.tgz | cut -d' ' -f1)" >> "$GITHUB_OUTPUT"
  - uses: AtlaSent-Systems-Inc/atlasent-action@v1
    env:
      ATLASENT_API_KEY: ${{ secrets.ATLASENT_API_KEY }}   # needs idp_broker:mint
      ATLASENT_BASE_URL: ${{ secrets.ATLASENT_BASE_URL }}
    with:
      action: artifact.release
      target-id: npm:@acme/widget
      artifact-digest: ${{ steps.digest.outputs.digest }}
```

The gate:

1. Mints the actor identity, as it does for `production.deploy`.
2. Requests a second OIDC token with audience `atlasent:supply_chain.v1` and
   sends it to `/v1-supply-chain-assertion`. The runtime reads the GitHub
   artifact attestation for that exact digest from the token's own repository,
   Sigstore-verifies it, and signs the assertion.
3. Sends the assertion in `assertions`, with `resource_id` set to `target-id`
   and `context.artifact_digest` set to the digest. Evaluate counts the
   assertion only when both fields match it. A digest in your `context` input
   cannot replace the one the assertion vouches for.

The step fails closed with `verify-error-code=ASSERTION_UNVERIFIED` when
`artifact-digest` is not `sha256:<64 hex>`, when `target-id` is missing, or when
the issuer refuses (for example, no attestation exists for the digest). The
runtime side, including signer and trust-root setup, is documented in
atlasent-api `docs/runbooks/SUPPLY_CHAIN_ASSERTION_ISSUER.md`.

## Azure DevOps Pipelines

This repo also publishes a real Azure Pipelines custom task,
[`AtlaSentGate`](./packages/azure-devops-task/), for teams running CI/CD on
Azure DevOps instead of GitHub Actions. It enforces the same evaluate →
verify → permit contract described in this README, is fully tested, and
supports the same pause-and-resume and execution-boundary (evaluate-only +
verify-permit) patterns as the GitHub Action's single-eval path. See
[`packages/azure-devops-task/README.md`](./packages/azure-devops-task/README.md)
for setup, the full input/output reference, and pipeline examples. It is a
new integration (single-eval mode only for this first release) — batch
evaluation, policy sync, and the other modes documented above remain
GitHub-Action-only for now.

## Customer integration starters

- [Salesforce change gate](./examples/salesforce-change-gate/) — a customer-owned, sandbox-first workflow that combines GitHub approvals, Gearset validation evidence, an artifact-bound AtlaSent permit, Salesforce CLI execution, independent observation, and AtlaSent execution closeout. It does not require access to any private AtlaSent source repository.

## Supported protected actions

The GitHub Action intentionally has a conservative client-side allowlist for its
single-evaluation path. Current values are:

- `production.deploy`
- `package.release`
- `trial.blinding.setup`
- `trial.unblinding.execute`
- `trial.unblinding.emergency`
- `trust_root.publish`

This allowlist is input validation, **not the authorization authority**. Passing
client-side validation does not authorize an action; the AtlaSent runtime policy
still decides whether the request is allowed, denied, held, or escalated.

Other action namespaces can be governed through AtlaSent SDK and MCP integration
surfaces. A new action type must be deliberately added to this GitHub Action
before the single-evaluation path will forward it.

## GitHub-derived facts cannot be overridden

The optional `context` input is useful for application-specific facts such as
service name, change-window state, or deployment metadata. Caller-supplied
context is applied first.

Facts derived or verified from the GitHub runtime are then applied last and win
on collision. These include repository, ref, SHA, workflow/run metadata, PR
number/run URL, and — when `approvals-from: pr-reviews` is enabled — approval
count and approving-reviewer identities.

That ordering is security-significant: a workflow cannot claim a different
repository or manufacture an approval count by placing those keys in `context`.
Non-colliding application context is preserved.

## PR-review approvals

By default, `approvals-from: pr-reviews` asks the GitHub API for the pull
request's current reviews and derives:

- `context.approvals`
- `context.approving_reviewers`

Provide `GITHUB_TOKEN` when the policy depends on review evidence:

```yaml
- name: Authorization gate
  id: gate
  uses: Atlasent/atlasent-action@v1
  env:
    ATLASENT_API_KEY: ${{ secrets.ATLASENT_API_KEY }}
    ATLASENT_BASE_URL: ${{ secrets.ATLASENT_BASE_URL }}
    GITHUB_TOKEN: ${{ github.token }}
  with:
    action: production.deploy
    environment: live
    context: '{"change_window": true}'
```

If review lookup fails, the derived approval count falls to zero. For an
approval-gated policy that is the fail-closed direction: the workflow does not
invent approval evidence.

Set `approvals-from: none` only when the selected policy does not depend on
GitHub-review-derived approval evidence or when a different, explicitly trusted
authority source is being used.

### Real signed approval artifacts

`context.approvals`/`context.approving_reviewers` above are a plain number and
a name list — enough for a policy template that counts, but not a
cryptographic proof a reviewer actually approved. `production.deploy`'s Canon
floor requires a real `requires_human_approval` gate, which only accepts a
signed `approval_artifact.v1` / `approval_quorum.v1` — not a self-reported
count.

By default (`approval-artifact-mint: true`), when an evaluate() call denies
with `INSUFFICIENT_APPROVALS` and asks for one of these artifacts, the action
automatically:

1. Calls `v1-github-approval-mint`, which independently re-reads the PR's
   reviews via the org's own GitHub App installation (never trusting what
   this action already reported) and mints one signed `approval_artifact.v1`
   per distinct reviewer whose latest review is `APPROVED`.
2. Packages them into an `approval_quorum.v1` bound to the server's exact
   `action_hash` for this request.
3. Retries the evaluate() call once with that quorum attached.

This requires the API key to also carry the `approval_artifact:mint` scope
(alongside `evaluate:write`/`verify:execute`) and `GITHUB_TOKEN` — the same
requirements `approvals-from: pr-reviews` already has, plus the one scope. A
minting failure (no qualifying reviewer, wrong scope, endpoint unreachable)
never escalates into a harder failure; it just leaves the original deny
standing. Set `approval-artifact-mint: "false"` to disable the retry entirely
and always see the original deny.

```yaml
- name: Authorization gate
  id: gate
  uses: Atlasent/atlasent-action@v1
  env:
    ATLASENT_API_KEY: ${{ secrets.ATLASENT_API_KEY }}
    ATLASENT_BASE_URL: ${{ secrets.ATLASENT_BASE_URL }}
    GITHUB_TOKEN: ${{ github.token }}
  with:
    action: production.deploy
    environment: live
```

This is a different mechanism from the solo-operator compensating control
below: that one is for a single-accountable-human org with no second
reviewer to derive an artifact from at all (e.g. a manually-dispatched
workflow with no associated pull request). This one is for the ordinary case
where a real second human DID leave an approving PR review — it turns that
fact into cryptographic evidence instead of working around its absence.

## Stronger execution-boundary pattern

The default one-step mode performs evaluate → permit → verify in the gate step.
For a stronger boundary across jobs, bind the built artifact into the permit,
issue without consuming it, then consume it immediately before execution.

**The digest binds the *identity* of the artifact into the authorization — it
does not by itself move the artifact's bytes between jobs, and AtlaSent verify
only checks that the DECLARED digest matches what was authorized; it never
sees the artifact's actual bytes.** GitHub Actions jobs run on separate,
isolated runners with no shared filesystem, so `deploy` needs its own way to
obtain the exact thing `digest` describes, with its own integrity check
independent of AtlaSent's: `actions/upload-artifact` in `build`,
`actions/download-artifact` in `deploy`, then re-hash the downloaded bytes
and compare against `digest` **before** calling AtlaSent verify (shown
below) — or, for a container image, push to a registry in `build` and pull
`image@sha256:<digest>` directly in `deploy`, where the registry pull itself
is the integrity check. Skipping both — running `deploy.sh` against
something never independently confirmed to match the verified digest —
silently defeats the binding this whole pattern exists to enforce.

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      digest: ${{ steps.digest.outputs.digest }}
    steps:
      - uses: actions/checkout@v4
      - run: ./build.sh out/
      - id: digest
        run: echo "digest=sha256:$(tar -cf - out | sha256sum | cut -d' ' -f1)" >> "$GITHUB_OUTPUT"
      - uses: actions/upload-artifact@v4
        with:
          name: build-output
          path: out/

  authorize:
    needs: build
    runs-on: ubuntu-latest
    environment: production
    permissions:
      contents: read
      id-token: write
    outputs:
      permit: ${{ steps.gate.outputs.permit-token }}
      execution_hash: ${{ steps.gate.outputs.execution-hash }}
    steps:
      - id: gate
        uses: Atlasent/atlasent-action@v1
        env:
          ATLASENT_API_KEY: ${{ secrets.ATLASENT_API_KEY }}
          ATLASENT_BASE_URL: ${{ secrets.ATLASENT_BASE_URL }}
        with:
          action: production.deploy
          environment: production
          artifact-digest: ${{ needs.build.outputs.digest }}
          mode: evaluate-only

  deploy:
    needs: [build, authorize]
    runs-on: ubuntu-latest
    environment: production
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: build-output
          path: out/

      - name: Verify the downloaded bytes match the authorized digest
        run: |
          set -euo pipefail
          actual="sha256:$(tar -cf - out | sha256sum | cut -d' ' -f1)"
          expected="${{ needs.build.outputs.digest }}"
          if [ "$actual" != "$expected" ]; then
            echo "::error::downloaded artifact ($actual) does not match the authorized digest ($expected)"
            exit 1
          fi

      - id: verify
        uses: Atlasent/atlasent-action@v1
        env:
          ATLASENT_API_KEY: ${{ secrets.ATLASENT_API_KEY }}
          ATLASENT_BASE_URL: ${{ secrets.ATLASENT_BASE_URL }}
        with:
          verify-permit: 'true'
          permit-token: ${{ needs.authorize.outputs.permit }}
          execution-hash: ${{ needs.authorize.outputs.execution_hash }}
          action: production.deploy
          environment: production

      - if: steps.verify.outputs.verified == 'true'
        run: ./deploy.sh out/
```

For `production.deploy`, `artifact-digest` becomes `change_plan.artifact_ref`
alongside the broker-verified GitHub revision. The runtime derives an opaque
execution hash from that complete plan. `mode: evaluate-only` exposes that
binding as `execution-hash`; pass it unchanged to the later verify step while
independently re-hashing the downloaded bytes against `artifact-digest`.

## Clinical example

The same execution contract can gate a provisioned clinical action:

```yaml
- name: Clinical unblinding gate
  id: gate
  uses: Atlasent/atlasent-action@v1
  env:
    ATLASENT_API_KEY: ${{ secrets.ATLASENT_API_KEY }}
    ATLASENT_BASE_URL: ${{ secrets.ATLASENT_BASE_URL }}
  with:
    action: trial.unblinding.execute
    target-id: trial:NCT12345678
    environment: production

- name: Perform unblinding
  if: steps.gate.outputs.verified == 'true'
  run: ./scripts/unblind.sh
```

The GitHub Action does not itself decide whether an unblinding is authorized.
The runtime evaluates the organization's policy, identity/approval evidence, and
required bindings for that action class.

## State snapshot

AtlaSent evaluations require a state snapshot so authorization is tied to known
execution state. The standard GitHub path injects a snapshot from the Actions
runtime automatically.

A custom snapshot can be supplied when a workflow needs to attach a pre-collected
state representation. Treat it as decision-bearing evidence: do not use a custom
snapshot merely to force a policy match.

## Core inputs

| Input | Purpose |
|---|---|
| `action` | Protected action type for the single-evaluation path. |
| `actor` | Actor identity; defaults to `github.actor`. |
| `target-id` | Resource or object being acted on. |
| `environment` | Execution environment. |
| `context` | Additional application context; verified/derived GitHub facts win on collision. |
| `approvals-from` | `pr-reviews` (default) or `none`. |
| `artifact-digest` | SHA-256 artifact identity; for production.deploy it becomes `change_plan.artifact_ref`. |
| `execution-hash` | Opaque runtime-derived binding passed from an evaluate-only production deploy to its verify boundary. |
| `mode` | `enforce` (default) or `evaluate-only`. |
| `wait-for-approval` | Wait for an authorized human decision after this single evaluation returns `hold` or `escalate`; default `false`. |
| `max-wait-minutes` | Approval-wait limit for `wait-for-approval`; default 30. |
| `verify-permit` | Run verify-only at the execution boundary. |
| `permit-token` | Permit to verify in boundary mode. |
| `api-url` | Runtime base URL override. |

`ATLASENT_API_KEY` authenticates the workflow to the AtlaSent runtime.
`ATLASENT_BASE_URL` should be set for pilot or self-hosted deployments.

For the complete machine-readable input/output surface, see [`action.yml`](./action.yml).

## Edge-function region

The hosted AtlaSent runtime runs on Supabase Edge Functions with its
database in `us-west-1`. Supabase runs a function in the region nearest
the caller, so an east-coast runner would otherwise execute the gate
across the continent from the database. Every database round trip then
pays that latency: evaluate measured p50 1.8–2.1 s in `us-west-1` and
5.2–7.3 s in `us-east-*`.

The action pins every call to the runtime with an `x-region` header:

| Setting | Behaviour |
|---|---|
| `function-region` input empty and `ATLASENT_FUNCTION_REGION` unset (default) | `us-west-1` for the hosted runtime; no pinning for any other host |
| `function-region: <region>` or `ATLASENT_FUNCTION_REGION=<region>` | That region for every runtime call (the input wins over the variable) |
| `auto` | No pinning: Supabase picks the region nearest the runner |

A self-hosted runtime is not pinned by default, because it may run in a
different region. Set `function-region` to its database region to get the
same benefit. An invalid value fails the step before any call is made.
The region changes only where the function executes, never the request
body or the decision.

## Core outputs

| Output | Meaning |
|---|---|
| `verified` | `true` only after successful permit verification. |
| `decision` | `allow`, `deny`, `hold`, or `escalate` on the single-eval path. |
| `waited-for-approval` | `true` when this action waited through a hold or escalation before its terminal decision. |
| `permit-token` | Permit token; consumed in normal mode, unconsumed in `evaluate-only`. |
| `permit-issued` | Whether a permit was minted. Do not use this to gate execution. |
| `evaluation-id` | Audit-lineage identifier. |
| `execution-hash` | Runtime-derived change-plan binding for boundary verification. |
| `proof-hash` | Cryptographic proof reference when returned by the runtime. |
| `verify-outcome` | Coarse permit-verification result. |
| `verify-error-code` | Precise runtime verification error code on failure. |

## Pause-and-resume: wait for a human decision

A `production.deploy` policy can require a human to review and approve
before a deploy proceeds — the runtime returns `hold` or `escalate` rather
than an immediate `allow`/`deny`. By default that fails the step
immediately (fail-closed, no waiting). Set `wait-for-approval: "true"` to
pause instead, and resume automatically once someone resolves it in
AtlaSent Console:

```yaml
      - name: AtlaSent gate
        id: gate
        uses: Atlasent/atlasent-action@v1
        env:
          ATLASENT_API_KEY: ${{ secrets.ATLASENT_API_KEY }}
          ATLASENT_BASE_URL: ${{ secrets.ATLASENT_BASE_URL }}
        with:
          action: production.deploy
          target-id: api-service
          environment: live
          artifact-digest: ${{ steps.digest.outputs.digest }}
          wait-for-approval: "true"
          max-wait-minutes: "30"

      - name: Deploy
        if: steps.gate.outputs.verified == 'true'
        run: ./scripts/deploy.sh
```

What actually happens, end to end:

1. `/v1-evaluate` returns `hold`/`escalate` with an `approval_request_id`.
   This step does **not** deploy yet — it polls
   `GET /v1/approvals/{approval_request_id}` on a 5-second interval, bounded
   by `max-wait-minutes` (default 30).
2. A human approves or rejects in AtlaSent Console, acting under their own
   identity. Their action causes the **runtime** to re-evaluate and, on
   approval, mint a **fresh, short-lived permit** — this is not a status
   flag flip on the console side.
3. The moment that resolution lands, the next poll observes it. The status
   poll itself never carries the fresh permit token — a broadly-readable
   status row must not hand out a live bearer off a plain GET. On
   `approved` (or `approved_awaiting_claim`), this step makes one further call,
   `POST /v1/approvals/{approval_request_id}/claim-permit`, an atomic
   one-time claim: the first caller to claim receives the token; any later
   claim (a retry, a second poller) gets nothing back. It then re-verifies
   that claimed permit against the **same** `action` / `target-id` /
   `environment` / `artifact-digest` this step originally evaluated with —
   exactly the same fail-closed re-verification every other allow goes
   through. `approved` alone is never sufficient; only a verified permit
   sets `verified: "true"`.
4. Denial, expiry, a timeout with no resolution, or a fresh permit that
   fails verification all fail the step closed — no deploy runs. The job
   summary and `decision` output reflect the real, final reason.

**Approval alone never authorizes execution — the executor claims and
consumes the permit.** For a mandatory change-control action
(`production.deploy`, `infrastructure.change`, `production.rollback`,
`secret.configuration.change`) the claim is made on `approved` or
`approved_awaiting_claim` with `{ actor_identity, change_plan }`: an
`actor_identity.v1` freshly re-minted for this job's own GitHub workload
identity at claim time (it must be the same actor that was evaluated, and the
same environment the approval is bound to), plus the exact `change_plan` sent
at evaluate. The runtime runs its claim-time reevaluation against that
executor; a changed plan is refused (`409 change_plan_mismatch`) and the step
fails closed. The claimed permit is then verified with `payload_hash` set to
the claim response's `execution_hash_expected` — a claim that does not carry
it fails closed rather than attempting an unbound verify, and a replayed
permit (`PERMIT_ALREADY_USED`) fails like any other. Other action types keep
the plain `{}` claim. Only the API key that created the approval can claim
it, and only the first claim wins.

Requires `approvals:read` on the `ATLASENT_API_KEY` scopes (in addition to
`evaluate:write` + `verify:execute`). With `mode: evaluate-only`, the step
waits and claims the same way but does **not** verify or consume the permit:
it outputs the claimed `permit-token` and `execution-hash` (with
`verified: "false"`) for the later `verify-permit: true` step at the
execution boundary, exactly like a direct allow in that mode.

## Fail-closed behavior

The protected step must not execute when:

- the authorization decision is `deny`, `hold`, or `escalate`;
- no permit is issued when one is required;
- permit verification fails;
- execution bindings differ;
- a permit is expired, revoked, invalid, or already consumed;
- the AtlaSent authority service is unavailable or authentication fails.

A governance control that silently bypasses itself when its authority source is
unreachable would create false assurance; this action therefore fails closed.

## Outbound notifications

Set `slack-webhook` and/or `teams-webhook` to get an informational,
outbound-only notification whenever the gate returns `deny`, `hold`, or
`escalate` (including a batch evaluation where any item is blocked, or an
`allow` whose permit failed verification). Neither is interactive — no
approval buttons — and both are best-effort: a webhook failure or non-200
response is logged as a `::warning::` and never blocks or alters the gate
decision.

| Input | Purpose |
|---|---|
| `slack-webhook` | Slack Incoming Webhook URL. Posts a Block Kit message. |
| `teams-webhook` | Microsoft Teams Incoming Webhook URL. Posts a MessageCard notification. |

```yaml
      - name: AtlaSent gate
        uses: Atlasent/atlasent-action@v1
        env:
          ATLASENT_API_KEY: ${{ secrets.ATLASENT_API_KEY }}
          ATLASENT_BASE_URL: ${{ secrets.ATLASENT_BASE_URL }}
        with:
          action: production.deploy
          target-id: api-service
          environment: live
          slack-webhook: ${{ secrets.SLACK_DEPLOY_WEBHOOK }}
          teams-webhook: ${{ secrets.TEAMS_DEPLOY_WEBHOOK }}
```

Both notifications carry the same substantive information: decision, action
type, actor, environment, the deny/hold reason, and a link to the workflow
run (plus the evaluation ID and a truncated audit hash when available). For
in-flow interactive approvals rather than a one-way notification, use the
AtlaSent Slack Approval Bot (configured in the AtlaSent console) instead.

`pr-comment-on-deny` (default `"true"`) is a separate, non-webhook
notification: it posts a comment directly on the triggering pull request
when the gate blocks and a PR number is detected. It fires independently of
either webhook input.

## Change Brief mode

Before a production change is authorized, a reviewer often wants to see what
is actually changing — not just whether the gate will allow it. Set
`change-brief: "true"` to gather this run's real GitHub/CI facts (base/head
SHA, changed files, check-run conclusions) and call AtlaSent's
`v1-change-brief`, instead of evaluating:

```yaml
      - name: AtlaSent Change Brief
        id: brief
        uses: Atlasent/atlasent-action@v1
        env:
          ATLASENT_API_KEY: ${{ secrets.ATLASENT_API_KEY }}
          ATLASENT_BASE_URL: ${{ secrets.ATLASENT_BASE_URL }}
          GITHUB_TOKEN: ${{ github.token }}
        with:
          change-brief: "true"
          target-id: account-service
          environment: production

      - name: AtlaSent gate
        id: gate
        uses: Atlasent/atlasent-action@v1
        env:
          ATLASENT_API_KEY: ${{ secrets.ATLASENT_API_KEY }}
          ATLASENT_BASE_URL: ${{ secrets.ATLASENT_BASE_URL }}
        with:
          action: production.deploy
          target-id: account-service
          environment: production
```

This mode **mints no permit and authorizes nothing** — it is a preparation
artifact, per `v1-change-brief`'s own contract. A separate evaluate/verify
step (the default `action:` mode, shown above) remains the actual
authorization gate; do not gate a deploy on `change-brief-recommendation`.

The job summary is rendered as a management decision brief rather than a raw
fact dump. It translates the runtime's rationale and impact analysis, states
the decision being requested, lists precise next actions, and shows the work
AtlaSent performed automatically (changed files compared, check runs
inspected, material differences found, and evidence gaps routed). Every brief
retains the exact repository/base/head/digest binding. A failed, capped, or
otherwise incomplete GitHub source read is `evidence_incomplete`; an empty
read is never presented as an observed zero.

The machine-readable `change-brief-decision-brief` output carries the same
`management_decision_brief.v1` projection. Supporting routing outputs are
`change-brief-decision-readiness` (`ready_for_review` or
`evidence_incomplete`), `change-brief-source-collection` (`complete` or
`partial`), and `change-brief-blocking-evidence-count`. All are advisory:
they help populate a management queue, but they must never be used to gate a
deployment. Only the separate evaluate/permit/verify path can authorize
execution.

The summary remains the complete, sourced record of what was found (detected
DB migrations, dependency/workflow changes, CI check status — explicitly
never conflated with "tests passed", rollback readiness). The
`change-brief-console-url` output links into the AtlaSent console review
screen, but that page does not yet carry this run's GitHub-sourced facts (a
known gap in the console's request shape) — treat the job summary as
authoritative until that's closed.

Key inputs: `change-brief-action` / `change-brief-target-system` /
`change-brief-target-id` (default to `action` / `"github"` / `target-id`),
`change-brief-base-sha` / `change-brief-head-sha` (required for events other
than `pull_request`/`push`), `change-request`, `rollback-previous-sha` /
`rollback-workflow` / `rollback-reference`, `console-base-url`,
`pr-comment-on-change-brief` (default `"false"` — opt in, since a comment on
every push would be noisy). Full reference in [`action.yml`](./action.yml).

## Solo-operator compensating control (attest mode)

Independent-approval action classes (`requires_independent_approval: true`)
normally need a distinct second human's review before an `allow` — the
`approving_reviewers` derived from `approvals-from: pr-reviews` above. A
single-accountable-human org has no second reviewer to derive that from, so
this branch would deny unconditionally without a different evidence path.

The AtlaSent runtime's solo-operator compensating control substitutes a
server-verified evidence chain (a fresh attestation from the org's own
`solo_operator_attested_identity`, green CI on the commit, the PR's real
merge timestamp past a cooling-off window, and a passing staging-acceptance
run) for the missing second reviewer. This action's
`solo-operator-attest: "true"` mode records the ONE fact only the real solo
operator can supply: mint a verified actor identity from THIS job's GitHub
OIDC token (bound to `solo_operator.attest`, distinct from the identity
minted for the protected action itself) and POST it plus this change's
evidence to `/v1-solo-operator-attest`. It authorizes nothing by itself —
the later evaluate step still independently re-verifies everything else.

```yaml
jobs:
  attest:
    runs-on: ubuntu-latest
    permissions:
      id-token: write   # GitHub workload identity for the solo_operator.attest mint
    steps:
      - uses: Atlasent/atlasent-action@v1
        id: attest
        env:
          ATLASENT_API_KEY: ${{ secrets.ATLASENT_API_KEY }}
          ATLASENT_BASE_URL: ${{ secrets.ATLASENT_BASE_URL }}
        with:
          solo-operator-attest: "true"
          action: production.deploy
          solo-operator-action-class-id: ${{ vars.PRODUCTION_DEPLOY_ACTION_CLASS_ID }}
          solo-operator-attestation-reason: "Single-maintainer deploy; CI green and staging accepted before promoting."
          target-id: api-service
          environment: live
          artifact-digest: ${{ needs.build.outputs.digest }}

  deploy:
    needs: [build, attest]
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      pull-requests: write
    steps:
      - uses: Atlasent/atlasent-action@v1
        env:
          ATLASENT_API_KEY: ${{ secrets.ATLASENT_API_KEY }}
          ATLASENT_BASE_URL: ${{ secrets.ATLASENT_BASE_URL }}
        with:
          action: production.deploy
          target-id: api-service
          environment: live
          artifact-digest: ${{ needs.build.outputs.digest }}
          solo-operator-context: "true"
      - run: ./scripts/deploy.sh
```

`solo-operator-action-class-id` is a UUID — find it via the AtlaSent console
or API, not derivable from the action_type string alone; store it as a repo
or org variable. `solo-operator-context: "true"` on the `deploy` job's gate
step is what tells the evaluate call to try the compensating control if the
ordinary `approving_reviewers` path is unprovable (as it always is for a
true solo operator) — it grants no authority by itself, and still requires a
fresh, matching attestation to have been recorded.

For a **non-`production.deploy`** action type (e.g. `control.override`,
`access.grant`), the runtime has no generic "change plan" concept — pass a
typed `evidence-profile` JSON object to BOTH steps instead (the SAME object
each time, or the attestation and the evaluate call derive different hashes
and the control denies):

```yaml
      - uses: Atlasent/atlasent-action@v1
        with:
          solo-operator-attest: "true"
          action: control.override
          solo-operator-action-class-id: ${{ vars.CONTROL_OVERRIDE_ACTION_CLASS_ID }}
          solo-operator-attestation-reason: "Single maintainer disabling a WAF rule during an active incident."
          evidence-profile: |
            {"kind":"control_override","control_id":"waf-rule-442","override_scope":"inbound traffic only, api.example.com","reason":"Active incident INC-1029.","expires_at":"2026-08-30T13:00:00Z"}
```

The AtlaSent API reference documents the full evidence-profile field set per
`kind` (`control_override`, `access_grant`).

## Posture scan mode

An advisory report on the **calling repo's own** GitHub security posture —
branch protection, CODEOWNERS, Dependabot, CodeQL, secret scanning, org 2FA
enforcement. Useful signal for evaluating a repo's baseline hygiene. It calls
no AtlaSent API (no `ATLASENT_API_KEY` required), never gates, and never
fails the step — it is pure GitHub-facing signal, in the same
never-authorizes-anything spirit as governance-agent findings (see below).

```yaml
      - uses: Atlasent/atlasent-action@v1
        env:
          GITHUB_TOKEN: ${{ github.token }}
        with:
          posture-scan: "true"
```

**Every signal is either genuinely observed or an honest `unknown` — never a
guess, never a synthetic risk score.** Three of the signals (CODEOWNERS
presence, a `.github/dependabot.yml` file, a CodeQL workflow) are plain
file-existence checks against the checked-out tree — they need a preceding
`actions/checkout` step (detected via a `.git` directory; without one they
report `unknown`/`workspace_not_checked_out` rather than guessing "absent").
The rest call the GitHub REST API and depend on what the token can actually
see — **empirically verified against the live API and GitHub's own
published schemas**, not assumed:

| Signal | Needs beyond default `GITHUB_TOKEN`? |
|---|---|
| CODEOWNERS file presence | No — checked-out tree only |
| Dependabot config file presence | No — checked-out tree only |
| CodeQL workflow presence (an actual `uses: github/codeql-action/...` step, not a bare "codeql" text match) | No — checked-out tree only |
| Branch protection rules | **Yes, and not fixable by editing the workflow's `permissions:` block.** Verified against GitHub's own workflow-syntax JSON schema: `administration` is not a grantable `permissions:` key at all, so the default GITHUB_TOKEN can never hold repository Administration rights no matter what a workflow requests. Without it, GitHub returns `403 Resource not accessible by integration`, reported as `status: "unknown", reason: "insufficient_permission"` — never guessed as "unprotected". Pass a fine-grained PAT or GitHub App installation token with Administration access via `posture-scan-token` to observe this |
| Required status checks | Same as branch protection (read from the same response) |
| Secret scanning / push protection / Dependabot security updates | Same credential requirement as branch protection. Note: GitHub does not even error here; it returns `200` with the `security_and_analysis` field **silently omitted**. This mode treats that omission as `unknown`, never as "disabled" |
| Dependabot alerts enabled | Same credential requirement (distinct from the config-file check above, which only checks that a file exists). A `404` here is only read as "disabled" once this mode has independently confirmed via `GET /repos/{owner}/{repo}` that the same credential can see the repository at all — GitHub also 404s this endpoint for an invisible/inaccessible repo, so an unconfirmed 404 is reported `unknown`, never guessed "disabled" |
| Org-level 2FA enforcement | **Cannot ever be seen by a repository-scoped token**, no matter what credential is supplied — this is a GitHub platform limitation, reported as `reason: "not_observable_by_repo_token"`. Reported as `not_applicable` for a user-owned repo instead, since the setting doesn't exist there |
| Org-level SSO/SAML enforcement | Reported as its **own, independent** finding — an org can require 2FA without enforcing SSO, or vice versa, so this is never inferred from the 2FA result. Confirmed against GitHub's published REST OpenAPI spec: there is no SSO/SAML field anywhere in the public REST API at all (it exists only in the Enterprise GraphQL API, gated on enterprise-owner credentials), so this always reports `not_observable_by_repo_token` |

Outputs: `posture-findings` (JSON array, one entry per signal — see
`src/postureScan.ts` for the full `PostureFinding` shape), `posture-summary`
(one-line human summary), `posture-observed-count`,
`posture-not-observable-count` (findings with status `unknown` specifically),
`posture-not-applicable-count` (findings with status `not_applicable` — a
distinct bucket, never folded into "not observable"). A job summary table is
also written.

## Other modes

The repository also contains additional CI-oriented surfaces such as batch
evaluation, policy sync, release-candidate verification, governance-agent
findings, VQP re-derivation, posture scan (above), and evidence-bundle
output. Their machine-readable configuration is in
[`action.yml`](./action.yml).
They do not change the core rule: a protected execution path should proceed only
when its required authorization and verification checks have actually passed.

For agent-tool interception rather than GitHub CI, use the public
[`atlasent-mcp-server`](https://github.com/Atlasent/atlasent-mcp-server)
or the public [`atlasent-sdk`](https://github.com/Atlasent/atlasent-sdk).
For independent audit-chain verification, use
[`atlasent-verify`](https://github.com/Atlasent/atlasent-verify).

## Security

Do not put API keys, private signing material, or customer secrets in workflow
source or the `context` input. Use GitHub Actions secrets for credentials.

The `actor` field is authorization context; the API key authenticates the caller.
Do not treat a caller-supplied actor string by itself as proof of a human's
identity unless the applicable runtime policy explicitly binds it to trusted
identity evidence.

## License

Licensed under the [Apache License, Version 2.0](./LICENSE).

Copyright (c) AtlaSent IP Holdings LLC
