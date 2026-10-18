# AtlaSent Gate — Azure Pipelines task

A real, working Azure DevOps Pipelines custom task (`AtlaSentGate`) that enforces
the same fail-closed AtlaSent authorization contract as this repo's GitHub
Action — evaluate → verify → permit — before a deployment or other critical
pipeline step runs.

This is the working implementation the draft in
[`examples/azure-devops-entra-gate/`](../../examples/azure-devops-entra-gate/)
pointed toward. That draft is a design sketch for a different (Entra
workload-identity) authentication shape and is intentionally non-functional
(CI/PR triggers disabled, no protected command). This package is a real,
installable, tested Azure Pipelines task using a plain API-key credential —
the same credential model the GitHub Action itself uses.

## Scope of this first slice

Single-evaluation mode only, mirroring the GitHub Action's default
`action:`-driven path. **Not implemented** in this task (all out of scope for
this slice — see the top-level [`README.md`](../../README.md) for what these
mean on the GitHub Action):

- Batch evaluation (`evaluations`)
- Policy sync
- Release mode
- Governance agents
- Change Brief
- Posture scan
- GitHub-OIDC-style verified-workload-actor minting, mandatory change-plan
  derivation, and approval-artifact minting (the GitHub Action's
  `production.deploy`-specific machinery — Azure Pipelines has its own,
  different workload-identity story that a future slice can wire in
  separately)
- Auto-derived approval counts from Azure Repos pull request reviews
  (`approvalsFrom: pr-reviews` is accepted for input-surface parity with the
  GitHub Action but is not yet implemented — see below)
- Artifact-digest binding (`artifact-digest` / `execution-hash` on the
  GitHub Action) — the execution-boundary pattern below re-presents
  `environment`/`targetId` but not yet an artifact digest

Everything else — evaluate, verify, permit consumption, fail-closed behavior
on deny/hold/escalate/network-error, and the pause-and-resume approval
protocol — is real and tested.

## What it does

```
evaluate() -> [optional pause-and-resume for hold/escalate] -> verify() -> verify-permit()
```

The task fails the pipeline step (`Failed` result) on anything other than
`decision: allow` **and** a verified, unreplayed permit. Gate downstream
steps on the `verified` output variable, not `decision` — the same rule the
GitHub Action documents.

## Setup

Install the extension in your Azure DevOps organization (once published —
see "Building and packaging locally" below), then add pipeline variables:

| Variable | Secret | Purpose |
|---|---:|---|
| `ATLASENT_API_KEY` | yes | API key scoped to at least `evaluate:write` + `verify:execute` |
| `ATLASENT_BASE_URL` | no | Supabase project URL, e.g. `https://<ref>.supabase.co/functions/v1` |

Map them into the task step's environment (Azure Pipelines does not
auto-inject pipeline variables as task-input secrets the way GitHub Actions
does with `secrets.*` — an explicit `env:` block on the step is required):

```yaml
- task: AtlaSentGate@1
  env:
    ATLASENT_API_KEY: $(AtlasentApiKey)
    ATLASENT_BASE_URL: $(AtlasentBaseUrl)
  inputs:
    action: production.deploy
    targetId: api-service
    environment: production
```

## Inputs

| Input | Default | Description |
|---|---|---|
| `action` | — (required) | Protected action type (e.g. `production.deploy`, `package.release`). Also required in `verifyPermit: true` mode. |
| `actor` | `Build.RequestedFor` / `Release.RequestedFor` / `unknown` | Triggering identity. |
| `targetId` | — | Target resource identifier. |
| `environment` | auto | When blank: inferred from the `ATLASENT_API_KEY` prefix (`ask_test_`/`ask_live_`), else from `Build.SourceBranch` (`main`/`master` → `live`, otherwise `test`) — the same heuristic the GitHub Action applies to `github.ref`. |
| `azureSubscriptionId` | — | The Azure subscription this step will change. Give it together with `azureResourceGroup`. Bound into the evaluate context as `context.azure`, signed into the permit, and re-checked when the permit is verified — so give the **same values on the `verifyPermit: true` step**. |
| `azureResourceGroup` | — | The resource group this step will change. See [Protecting an Azure deployment](#protecting-an-azure-deployment). |
| `azureDeploymentName` | — | The ARM deployment name the deploy will use; requires the subscription and resource group. Required for `mode: admit-operation`: only that deployment can establish the decision's effect. |
| `context` | `{}` | JSON object of additional context passed to the evaluator. | The task also records this run's Azure DevOps metadata (`System.CollectionUri`, `System.TeamProject`, `Build.DefinitionName`, `Build.BuildId`, `Build.Repository.Name`, `Build.SourceVersion`) as `context.azure_devops`, unless `context` already sets that key. That metadata is the pipeline's own description of itself: it is recorded for audit and correlation and grants nothing.
| `approvalsFrom` | `none` | `none` or `pr-reviews`. **`pr-reviews` is accepted but not yet implemented** — Azure Repos pull request reviews are not auto-derived in this v1 task; a warning is logged and the call proceeds as `none`. Pass `context: '{"approvals": N}'` explicitly if your policy requires an approval count. |
| `waitForApproval` | `false` | Set `true` to pause on hold/escalate and resume once a human resolves it, instead of failing immediately. Ignored in `mode: evaluate-only`. |
| `maxWaitMinutes` | `30` | Bound on `waitForApproval`'s poll window; exceeding it fails closed. |
| `mode` | `enforce` | `enforce` (evaluate + verify + consume in one step), `evaluate-only` (issue a permit without consuming it — see the execution-boundary pattern below), or, for an Azure deployment, `admit-operation` / `establish-effect` (see [Protecting an Azure deployment](#protecting-an-azure-deployment)). An unrecognized value fails the step. `enforce` is refused for an Azure scope. Ignored when `verifyPermit: true`. |
| `verifyPermit` | `false` | Set `true` to run this task step as an execution-boundary re-verify instead of an evaluate. Requires `permitToken`. Refused for an Azure scope (use `mode: admit-operation`). |
| `executionHash` | — | `mode: admit-operation`: the `executionHash` output of the evaluate-only step, passed unchanged. |
| `operationId` / `attemptId` | — | `mode: establish-effect`: the outputs of the admit-operation step. |
| `evaluationId` | — | `mode: establish-effect`: the `evaluationId` output of the evaluate-only step. |
| `correlationId` | — | `mode: establish-effect`: the ARM deployment's correlation id. Required when the deployment succeeded. |
| `deploymentOutcome` | `succeeded` | `mode: establish-effect`: `succeeded`, `failed` or `unknown` (`Agent.JobStatus` values accepted). Anything but succeeded is recorded as failure/unknown and fails the step. |
| `effectWaitMinutes` | `15` | `mode: establish-effect`: how long to wait for the deployment to appear in Azure's Activity Log (max 120). |
| `permitToken` | — | Required when `verifyPermit: true` or `mode: admit-operation`: the `permitToken` output from an earlier `mode: evaluate-only` step. |
| `apiUrl` | — | Overrides `ATLASENT_BASE_URL`. |

## Outputs

Set as Azure Pipelines output variables (`isOutput: true`) and also emitted
as `##vso[task.setvariable]` logging lines. Reference from a later step in
the same job as `$(<stepName>.<output>)`, or as a job-to-job/stage-to-stage
output variable per Azure Pipelines' own
[output variable documentation](https://learn.microsoft.com/en-us/azure/devops/pipelines/process/variables?view=azure-devops&tabs=yaml%2Cbatch#set-a-multi-job-output-variable).

| Output | Description |
|---|---|
| `decision` | `allow` / `deny` / `hold` / `escalate`. |
| `verified` | `"true"` only when `decision=allow` **and** the permit was verified. Gate on this, not `decision`. |
| `permitToken` | The permit token. Already consumed in `enforce` mode (audit reference only); unconsumed in `evaluate-only` mode — pass it to a later `verifyPermit: true` step. |
| `proofHash` | Cryptographic proof hash. |
| `riskScore` | Numeric risk score 0–100; empty string when not assessed. |
| `evaluationId` | Unique evaluation ID for the audit trail. |
| `waitedForApproval` | `"true"` when a hold/escalate decision was paused and waited on for a human resolution. |
| `executionHash` | The payload binding the runtime put in the permit. Pass it to `mode: admit-operation`. |
| `operationId` / `attemptId` / `operationKey` | `mode: admit-operation`: the admitted operation (the key is a digest of the permit, never the permit). |
| `admissionOutcomeUnknown` | `"true"` when admission may have committed with the response lost. |
| `azureObservationId` / `effectState` | `mode: establish-effect`: the recorded Activity Log observation and the operation state the runtime reported. |
| `effectEstablished` | `"true"` only when the runtime established the deployment's effect. |

## Pause-and-resume: wait for a human decision

Set `waitForApproval: true` to poll for a human decision (bounded by
`maxWaitMinutes`) when the evaluator returns `hold` or `escalate`, instead of
failing the step immediately:

```yaml
- task: AtlaSentGate@1
  env:
    ATLASENT_API_KEY: $(AtlasentApiKey)
    ATLASENT_BASE_URL: $(AtlasentBaseUrl)
  inputs:
    action: production.deploy
    environment: production
    waitForApproval: true
    maxWaitMinutes: 30
```

A terminal `denied` / `denied_by_timeout` / `expired` resolution, or an
`approved` resolution whose fresh re-evaluation minted no permit, fails the
step closed — an "approved" status alone never authorizes execution; only a
freshly verified permit does.

## Execution-boundary pattern (evaluate in one stage, verify in a later one)

Mirrors the top-level [`README.md`](../../README.md)'s "Stronger
execution-boundary pattern": issue a permit without consuming it in one
stage, then re-verify (and consume) it immediately before the step that
actually deploys, in a later stage — so a stale or long-since-authorized
permit cannot silently be reused, and the re-verify happens at the actual
point of execution rather than minutes (or stages) earlier.

```yaml
stages:
  - stage: Authorize
    jobs:
      - job: Gate
        steps:
          - task: AtlaSentGate@1
            name: gate
            env:
              ATLASENT_API_KEY: $(AtlasentApiKey)
              ATLASENT_BASE_URL: $(AtlasentBaseUrl)
            inputs:
              action: production.deploy
              targetId: api-service
              environment: production
              mode: evaluate-only

  - stage: Deploy
    dependsOn: Authorize
    jobs:
      - job: DeployJob
        variables:
          permitToken: $[ stageDependencies.Authorize.Gate.outputs['gate.permitToken'] ]
        steps:
          - task: AtlaSentGate@1
            name: verify
            env:
              ATLASENT_API_KEY: $(AtlasentApiKey)
              ATLASENT_BASE_URL: $(AtlasentBaseUrl)
            inputs:
              action: production.deploy
              targetId: api-service
              environment: production
              verifyPermit: true
              permitToken: $(permitToken)

          - script: ./scripts/deploy.sh
            condition: eq(variables['verify.verified'], 'true')
```

Cross-stage output variables require `isOutput: true` (already set by this
task) and the `stageDependencies.<Stage>.<Job>.outputs['<step>.<name>']`
expression syntax shown above — see Azure Pipelines'
[stage-to-stage output variable documentation](https://learn.microsoft.com/en-us/azure/devops/pipelines/process/variables?view=azure-devops&tabs=yaml%2Cbatch#set-a-cross-stage-output-variable).

**Not yet implemented in this v1 task**: artifact-digest binding
(`change_plan.artifact_ref` on the GitHub Action's `production.deploy` path).
`targetId`/`environment` are re-presented and checked at the boundary (via
`requiredBindingsFor` in `@atlasent/enforce` — a binding present at evaluate
time must be present again at verify time, or verification fails closed with
`MISSING_BINDING`), but this task does not yet bind or re-hash a build
artifact's digest the way the GitHub Action's `artifact-digest` input does.
A pipeline that needs that guarantee today should independently re-hash its
downloaded build artifact and compare it before calling `verifyPermit`, the
same "the digest binds identity, but moving and re-checking the bytes is the
caller's job" pattern the top-level README documents for the GitHub Action.

## Protecting an Azure deployment

The Azure Production Change Gate
(the internal plan)
runs an Azure deployment as a **Consequential Operation**: AtlaSent records
that the permit was spent on exactly this deployment, then closes the
operation only from Azure's own Activity Log. Four steps, one pipeline:

1. **Before the change** — `mode: evaluate-only` with `azureSubscriptionId`,
   `azureResourceGroup` and `azureDeploymentName` (the ARM deployment name
   the deploy step will use). The Azure scope is signed into the permit and
   the deployment name is stored with the decision. Outputs `permitToken`,
   `executionHash` and `evaluationId`.
2. **Immediately before the change** — `mode: admit-operation` with the
   **same** Azure scope, `targetId`, `permitToken` and `executionHash`. This
   calls `v1-consequential-operations/consume-and-admit` with
   `provider: "azure"`: the runtime verifies the permit without consuming it,
   then consumes it **and** admits an operation and attempt in one
   transaction. A permit issued for another subscription or resource group
   is refused (`AZURE_LOCUS_MISMATCH`) and stays unspent. Outputs
   `operationId` / `attemptId`. Run the deployment only if this step
   succeeded (`admit.verified == 'true'`).
3. **The change** — the ARM deployment, under exactly `azureDeploymentName`,
   exporting its correlation id.
4. **After the change** — `mode: establish-effect` with `operationId`,
   `attemptId`, `evaluationId`, the deployment's `correlationId` and
   `deploymentOutcome`. AtlaSent reads Azure's Activity Log itself
   (`v1-azure-effect-verify`, polling while the event has not appeared, up to
   `effectWaitMinutes`) and records an observation; the task then calls
   `establish-effect` with that observation and the runtime decides. The step
   succeeds only when the runtime answers `succeeded` / `established`. A
   `mismatch`, an observation not bound to the named deployment, an
   `unknown` past the wait budget, or any refusal fails the step and leaves
   the operation open. A failed or cancelled deployment is recorded on the
   attempt as `failure` / `unknown` and the step fails.

`mode: enforce` and `verifyPermit: true` are **refused** for an Azure scope:
a plain consuming verify spends the permit with no operation for the
deployment's effect to close.

Requirements: the org's Azure connection for the subscription must be
`connected` with this resource group selected, and the pipeline's API key
needs `evaluate:write`, `verify:execute`, `consequential_operations:write`
and `azure_effect:verify`. Effect establishment for provider `azure` needs
atlasent-api's Azure effect close-out (`establish-effect` with
`azure_observation_id`, migration `20261680000000`) deployed on the runtime
the pipeline targets.

```yaml
variables:
  subscriptionId: 00000000-0000-0000-0000-000000000000
  resourceGroup: rg-prod-eastus
  # Named before the deploy runs, unique per run, and bound to the decision.
  deploymentName: web-$(Build.BuildId)

stages:
  - stage: Authorize
    jobs:
      - job: Gate
        steps:
          - task: AtlaSentGate@1
            name: gate
            env:
              ATLASENT_API_KEY: $(AtlasentApiKey)
              ATLASENT_BASE_URL: $(AtlasentBaseUrl)
            inputs:
              action: production.deploy
              targetId: web-app
              environment: production
              mode: evaluate-only
              azureSubscriptionId: $(subscriptionId)
              azureResourceGroup: $(resourceGroup)
              azureDeploymentName: $(deploymentName)

  - stage: Deploy
    dependsOn: Authorize
    jobs:
      - job: DeployJob
        variables:
          permitToken: $[ stageDependencies.Authorize.Gate.outputs['gate.permitToken'] ]
          executionHash: $[ stageDependencies.Authorize.Gate.outputs['gate.executionHash'] ]
          evaluationId: $[ stageDependencies.Authorize.Gate.outputs['gate.evaluationId'] ]
        steps:
          - task: AtlaSentGate@1
            name: admit
            env:
              ATLASENT_API_KEY: $(AtlasentApiKey)
              ATLASENT_BASE_URL: $(AtlasentBaseUrl)
            inputs:
              action: production.deploy
              targetId: web-app
              environment: production
              mode: admit-operation
              permitToken: $(permitToken)
              executionHash: $(executionHash)
              azureSubscriptionId: $(subscriptionId)
              azureResourceGroup: $(resourceGroup)
              azureDeploymentName: $(deploymentName)

          - task: AzureCLI@2
            name: deploy
            condition: and(succeeded(), eq(variables['admit.verified'], 'true'))
            inputs:
              azureSubscription: prod-service-connection
              scriptType: bash
              scriptLocation: inlineScript
              inlineScript: |
                set -euo pipefail
                corr=$(az deployment group create -g "$(resourceGroup)" \
                  --name "$(deploymentName)" --template-file main.bicep --query properties.correlationId -o tsv)
                echo "##vso[task.setvariable variable=correlationId;isOutput=true]$corr"

          # Runs whenever an operation was admitted, including after a failed
          # deploy, so the attempt is always reported. Agent.JobStatus is
          # Failed if the deploy step failed.
          - task: AtlaSentGate@1
            name: effect
            condition: and(always(), ne(variables['admit.operationId'], ''))
            env:
              ATLASENT_API_KEY: $(AtlasentApiKey)
              ATLASENT_BASE_URL: $(AtlasentBaseUrl)
            inputs:
              action: production.deploy
              environment: production
              mode: establish-effect
              operationId: $(admit.operationId)
              attemptId: $(admit.attemptId)
              evaluationId: $(evaluationId)
              correlationId: $(deploy.correlationId)
              deploymentOutcome: $(Agent.JobStatus)
```

If `admit-operation` fails with `admissionOutcomeUnknown: true`, the
admission may have committed with the response lost: do not deploy and do not
mint a fresh permit until the operation has been looked up by its
`operationKey`.

The effect check is evidence, recorded after the fact. It does not undo a
change; what stops an unauthorized change is steps 1–2.

## Building and packaging locally

```bash
npm install                       # from the repo root (npm workspaces)
npm run typecheck -w @atlasent/azure-devops-task
npm run build -w @atlasent/azure-devops-task   # esbuild -> AtlaSentGate/dist/index.js
npm test -w @atlasent/azure-devops-task        # vitest
```

`AtlaSentGate/dist/index.js` is the committed runtime artifact Azure
Pipelines runs directly (an ADO task gets no `npm install` step, the same
"commit the runtime artifact" contract this repo already uses for the
GitHub Action's own `dist/index.js`). Rebuild and commit it whenever
`packages/azure-devops-task/src/**` changes; CI checks it is current.

To package the extension for the Marketplace, install
[`tfx-cli`](https://github.com/microsoft/tfs-cli) and run, from this
directory:

```bash
npm install -g tfx-cli
tfx extension create --manifest-globs vss-extension.json
```

This produces a `.vsix` file. **This task does not, and cannot, publish
that `.vsix` to the Azure DevOps Marketplace** — `vss-extension.json`'s
`publisher` field is the placeholder `REPLACE_WITH_PUBLISHER_ID`.
Publishing requires a real
[Microsoft Partner Center publisher account](https://marketplace.visualstudio.com/manage/createpublisher),
which is a business/account step outside the scope of this task. Once a
real publisher account exists, replace the placeholder and run
`tfx extension publish` (or upload the `.vsix` manually via
[marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage)).

An organization can also install the task without the Marketplace at all,
by sideloading the `.vsix` directly
([Azure DevOps organization settings → Extensions → Browse marketplace →
Manage extensions → Upload extension](https://learn.microsoft.com/en-us/azure/devops/marketplace/get-started?view=azure-devops#install-an-extension-from-the-marketplace)),
which is the recommended path for testing this task against a real
organization before any Marketplace publication decision is made.

## Fail-closed behavior

Every non-`allow` decision, every network/infrastructure error from the
AtlaSent API, a missing `ATLASENT_API_KEY`, and a failed permit
verification (replay, mismatch, expiry) all fail the task step — never a
partial or "advisory" result. See `src/gate.ts`'s test suite
(`src/__tests__/gate.test.ts`) for the exhaustive set of fail-closed paths
this is verified against, including the network-error path.

## License

Apache-2.0, same as the rest of this repository.
