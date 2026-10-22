# GitHub Gate: one governed production deploy, end to end

This is the complete shape of a GitHub Gate workflow: a change is held until
an authorized person approves it, the exact approved change gets a single-use
permit, the permit is spent at the execution boundary, and AtlaSent decides
from GitHub's own records whether the authorized deploy actually happened.

Every step below is this action. There is no curl and no hand-written
evidence. `admit-operation`, `establish-effect` and the Change Brief evaluate
inputs need atlasent-action **v1.10.0 or later** (what `@v1` resolves to once
that release is tagged).

```
change brief ─▶ evaluate (HOLD) ─▶ human approves in AtlaSent ─▶ claim + reevaluate ─▶ permit
     │                                                                                   │
     └──────────────── binds the exact base/head/ref ──────────────┐                     ▼
                                                                    │   admit-operation (consume + admit, commit this run)
                                                                    │                     │
                                                                    │                     ▼
                                                                    │   deploy job (environment: production)
                                                                    │                     │
                                                                    └─▶ establish-effect (runtime reads GitHub, decides)
```

## Prerequisites

These are set up once per organization. Each one is a real control; none can
be skipped by the workflow.

| Prerequisite | Why |
|---|---|
| An AtlaSent API key with `evaluate:write`, `verify:execute`, `idp_broker:mint`, `approvals:read`, `change_brief:read`, `consequential_operations:write` (plus `approval_artifact:mint` if the action class requires human approval) | evaluate, claim, admission and establishment each check their own scope. `change_brief:create` is not enough: it is for agent-bound keys only, and a CI key is not one |
| The AtlaSent GitHub App installed on the repository and the repository bound in AtlaSent | the runtime reads the run, deployment and status itself through the App; without it the effect can only be `unknown` |
| A workload binding for this workflow file and a GitHub Environment (GitHub OIDC) | `production.deploy` refuses a caller-asserted actor. The workload identity is admitted only when the OIDC token's `environment` claim equals the binding's GitHub Environment, so the gate job (and the deploy job) declare that `environment:`. The establish job does not: it mints no workload identity |
| An approval policy on `production.deploy` naming who may approve | AtlaSent holds until a qualified, independent approver resolves it |

## The workflow

```yaml
name: governed-deploy

on:
  push:
    branches: [main]

permissions:
  contents: read
  pull-requests: read
  id-token: write   # verified workload actor for production.deploy

jobs:
  gate:
    runs-on: ubuntu-latest
    # The GitHub Environment the workload binding names. Without it the OIDC
    # token carries no matching environment claim and the actor is unverified.
    environment: production
    # A job-level block replaces the workflow-level one, so it restates them.
    permissions:
      contents: read
      pull-requests: read
      id-token: write
      statuses: write   # the gate result as an "AtlaSent Policy Gate" commit status
    outputs:
      admitted: ${{ steps.admit.outputs.admitted }}
      operation-id: ${{ steps.admit.outputs.operation-id }}
      attempt-id: ${{ steps.admit.outputs.attempt-id }}
      permit-hash: ${{ steps.admit.outputs.permit-hash }}
      evaluation-id: ${{ steps.evaluate.outputs.evaluation-id }}
      base-sha: ${{ steps.brief.outputs.change-brief-plan-base-sha }}
      head-sha: ${{ steps.brief.outputs.change-brief-plan-head-sha }}
      plan-ref: ${{ steps.brief.outputs.change-brief-plan-ref }}
    env:
      ATLASENT_API_KEY: ${{ secrets.ATLASENT_API_KEY }}
      ATLASENT_BASE_URL: ${{ secrets.ATLASENT_BASE_URL }}
      GITHUB_TOKEN: ${{ github.token }}
    steps:
      - uses: actions/checkout@v4

      # 1. What exactly is changing. Mints nothing, authorizes nothing.
      - id: brief
        uses: Atlasent/atlasent-action@v1
        with:
          change-brief: "true"
          action: production.deploy
          target-id: service:payments
          environment: production

      # 2. Ask for authorization, bound to that exact plan. A HOLD waits here
      #    for a human decision in AtlaSent (bounded by max-wait-minutes;
      #    the runner is busy for that time). Approval alone authorizes
      #    nothing: the claim reevaluates and only then mints a permit.
      - id: evaluate
        uses: Atlasent/atlasent-action@v1
        with:
          action: production.deploy
          target-id: service:payments
          environment: production
          mode: evaluate-only
          wait-for-approval: "true"
          max-wait-minutes: "30"
          change-brief-id: ${{ steps.brief.outputs.change-brief-id }}
          canonical-plan-digest: ${{ steps.brief.outputs.change-brief-canonical-plan-digest }}

      # 3. The execution boundary. Verifies the permit, then consumes it AND
      #    records the operation in one transaction, committing THIS run.
      #    A replayed, expired, revoked or rebound permit is refused here and
      #    stays unspent.
      - id: admit
        uses: Atlasent/atlasent-action@v1
        with:
          admit-operation: "true"
          permit-token: ${{ steps.evaluate.outputs.permit-token }}
          execution-hash: ${{ steps.evaluate.outputs.execution-hash }}
          action: production.deploy
          target-id: service:payments
          environment: production

  # 4. The deploy itself, in a LATER job. GitHub creates this job's
  #    deployment when it starts, i.e. after admission; a deployment that
  #    predates admission can never establish the effect.
  deploy:
    needs: gate
    if: needs.gate.outputs.admitted == 'true'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/deploy.sh

  # 5. Did the authorized change actually happen? The runtime reads GitHub's
  #    run, deployment and status itself. A failed or cancelled deploy is
  #    recorded as such; success is never self-reported.
  establish:
    needs: [gate, deploy]
    if: always() && needs.gate.outputs.operation-id != ''
    runs-on: ubuntu-latest
    # No `environment:` here. This job mints no workload identity (it uses the
    # API key and GITHUB_TOKEN), and declaring a protected environment would
    # wait for a second approval after the deploy and create a second
    # deployment record. deploy-environment names the deploy job's environment.
    permissions:
      contents: read
      actions: read
      deployments: read
    steps:
      - uses: Atlasent/atlasent-action@v1
        env:
          ATLASENT_API_KEY: ${{ secrets.ATLASENT_API_KEY }}
          ATLASENT_BASE_URL: ${{ secrets.ATLASENT_BASE_URL }}
          GITHUB_TOKEN: ${{ github.token }}
        with:
          establish-effect: "true"
          operation-id: ${{ needs.gate.outputs.operation-id }}
          attempt-id: ${{ needs.gate.outputs.attempt-id }}
          deploy-job: deploy
          deploy-result: ${{ needs.deploy.result }}
          deploy-environment: production
          base-sha: ${{ needs.gate.outputs.base-sha }}
          head-sha: ${{ needs.gate.outputs.head-sha }}
          plan-ref: ${{ needs.gate.outputs.plan-ref }}
          # Cross-checked against the evaluation and permit the runtime's
          # sealed observation names. A disagreement is a mismatch.
          expected-evaluation-id: ${{ needs.gate.outputs.evaluation-id }}
          expected-permit-hash: ${{ needs.gate.outputs.permit-hash }}
```

### The deploy readback

The establish step writes one record, `deploy-readback`
(`atlasent.deploy_readback.v1`), to its outputs and to the job summary. Every
field comes from the runtime's sealed observation, which the runtime built from
GitHub's own records (`github_causal_continuity.v1`):

- the workflow run id;
- the deployment id, status id and state;
- head and base SHA, and the environment;
- the evaluation, decision and permit hash, the change brief, and the
  operation the runtime names.

The operation and attempt this workflow asked about are reported separately
as `requested_operation_id` and `requested_attempt_id`: they are inputs, not
evidence.

`readback-verdict` is deterministic:

| Verdict | When |
|---|---|
| `verified` | The runtime established the effect, and its evidence includes the observed revision and an artifact-currentness record that matches the plan. That evidence names this run, a `success` deployment status, the requested environment and operation, the expected head/base, and the expected evaluation and permit |
| `mismatch` | The runtime classified the observation as not the authorized effect, or its evidence disagrees with any of those |
| `failed` | The deploy job failed or was cancelled, and the runtime recorded that |
| `incomplete` | Anything else: no response, an unknown result, or established without the causal-continuity, revision or currentness evidence to correlate |

The workflow's own claims are used only to cross-check. They can make a verdict
`mismatch` or `incomplete`, never `verified`. The step fails unless the verdict
is `verified`.

## What each refusal looks like

| Situation | Where it stops | Outcome |
|---|---|---|
| No approval yet | `evaluate` | waits, then fails closed at `max-wait-minutes`; no permit |
| Approver denies, or the approval expires | `evaluate` | fails closed; no permit |
| The plan changed between approval and claim | `evaluate` | claim refused (`change_plan_mismatch`); no permit |
| Workflow file or repository is not the enrolled one | `evaluate` / `admit` | actor unverified; no permit, or permit not spent |
| Permit replayed (a re-run of the same permit) | `admit` | refused, `PERMIT_ALREADY_USED`; deploy job skipped |
| Permit expired or revoked | `admit` | refused (`PERMIT_EXPIRED` / `PERMIT_REVOKED`); deploy job skipped |
| A tampered plan (different execution hash) | `admit` | refused `PAYLOAD_MISMATCH`; permit stays unspent |
| A different target | `admit` | refused `PERMIT_BINDING_MISMATCH`; permit stays unspent |
| A different environment | `admit` | refused `ENVIRONMENT_MISMATCH`; permit stays unspent |
| Admission response lost in transit | `admit` | `admission-outcome-unknown: true`; deploy job skipped; look up `operation-key` before retrying |
| Deploy job fails or is cancelled | `establish` | recorded `failed` / `unknown`; never `succeeded` |
| Deployed a different revision, or GitHub shows no matching deployment | `establish` | not established; step fails |

`admit-operation` outputs the runtime's code as `verify-error-code`, so a
workflow (or a refusal test) can tell why a permit was refused, not only that
it was.

## What this does not prove

- That nothing else can deploy the same service. The gate protects the path
  that runs through it. A second workflow, a manual deploy or a cloud console
  change bypasses it unless those paths are closed separately.
- That the deployed code is correct. AtlaSent verifies the authorized
  revision reached the authorized environment, not that the revision works.
