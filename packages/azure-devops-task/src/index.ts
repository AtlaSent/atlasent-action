// AtlaSentGate — Azure Pipelines task entrypoint.
//
// Thin adapter: read task inputs / predefined variables via
// azure-pipelines-task-lib, hand them to the platform-agnostic gate logic in
// ./gate, and report the result back via azure-pipelines-task-lib. Bundled
// (esbuild, single file, dependencies inlined) to
// ../AtlaSentGate/dist/index.js — the committed runtime artifact
// AtlaSentGate/task.json's execution handlers point at, since Azure
// Pipelines tasks do not get an `npm install` step, the same
// "commit the runtime artifact" contract this repo's own dist/index.js
// already follows for the GitHub Action.

import * as tl from "azure-pipelines-task-lib/task";
import { GateInputError, emptyOutputs, parseInputs, runGate, type GateOutputs, type RawGateEnv, type TaskLogger } from "./gate";

const logger: TaskLogger = {
  debug: (message) => tl.debug(message),
  info: (message) => console.log(message),
  warning: (message) => tl.warning(message),
  error: (message) => tl.error(message),
};

function setOutputs(outputs: GateOutputs): void {
  // `isOutput=true` so a later step in the same job (or, via job output
  // variables, a later stage) can reference these as
  // `$(<taskRefName>.decision)` etc. — the same "reusable across the
  // pipeline" role atlasent-action's GitHub Action outputs play.
  tl.setVariable("decision", outputs.decision, false, true);
  tl.setVariable("verified", outputs.verified, false, true);
  tl.setVariable("permitToken", outputs.permitToken, true, true);
  tl.setVariable("proofHash", outputs.proofHash, false, true);
  tl.setVariable("riskScore", outputs.riskScore, false, true);
  tl.setVariable("evaluationId", outputs.evaluationId, false, true);
  tl.setVariable("waitedForApproval", outputs.waitedForApproval, false, true);

  // Also emit ##vso[task.setvariable] logging lines directly — belt and
  // braces alongside tl.setVariable (which already emits them under the
  // hood), matching the task description's explicit "declared outputs via
  // task.setVariable/##vso[task] logging lines" contract and giving anyone
  // reading raw task logs a human-visible record even without inspecting
  // pipeline variables afterward.
  console.log(`##vso[task.setvariable variable=decision;isOutput=true]${outputs.decision}`);
  console.log(`##vso[task.setvariable variable=verified;isOutput=true]${outputs.verified}`);
  console.log(
    `##vso[task.setvariable variable=permitToken;isOutput=true;issecret=true]${outputs.permitToken}`,
  );
  console.log(`##vso[task.setvariable variable=proofHash;isOutput=true]${outputs.proofHash}`);
  console.log(`##vso[task.setvariable variable=riskScore;isOutput=true]${outputs.riskScore}`);
  console.log(`##vso[task.setvariable variable=evaluationId;isOutput=true]${outputs.evaluationId}`);
  console.log(
    `##vso[task.setvariable variable=waitedForApproval;isOutput=true]${outputs.waitedForApproval}`,
  );

  // Azure Consequential Operation outputs (admit-operation / establish-effect).
  // None is secret: operation_key is a digest of the permit, never the permit.
  const plain: Array<keyof GateOutputs> = [
    "executionHash",
    "operationId",
    "attemptId",
    "operationKey",
    "admissionOutcomeUnknown",
    "azureObservationId",
    "effectState",
    "effectEstablished",
  ];
  for (const name of plain) {
    tl.setVariable(name, outputs[name], false, true);
    console.log(`##vso[task.setvariable variable=${name};isOutput=true]${outputs[name]}`);
  }
}

async function main(): Promise<void> {
  const rawApiKey = process.env["ATLASENT_API_KEY"];
  if (rawApiKey) {
    // Mask before anything else can log it — mirrors the GitHub Action's
    // maskValue(apiKey) call at the very top of run().
    tl.setSecret(rawApiKey);
  }
  const rawPermitToken = tl.getInput("permitToken", false);
  if (rawPermitToken) {
    tl.setSecret(rawPermitToken);
  }

  const env: RawGateEnv = {
    apiKey: rawApiKey,
    apiUrl: tl.getInput("apiUrl", false) || process.env["ATLASENT_BASE_URL"],
    action: tl.getInput("action", false),
    actor: tl.getInput("actor", false),
    targetId: tl.getInput("targetId", false),
    environment: tl.getInput("environment", false),
    contextRaw: tl.getInput("context", false),
    approvalsFromRaw: tl.getInput("approvalsFrom", false),
    waitForApprovalRaw: tl.getInput("waitForApproval", false),
    maxWaitMinutesRaw: tl.getInput("maxWaitMinutes", false),
    modeRaw: tl.getInput("mode", false),
    verifyPermitRaw: tl.getInput("verifyPermit", false),
    permitTokenRaw: tl.getInput("permitToken", false),
    // Predefined variables — present on classic/YAML build pipelines and
    // classic release pipelines respectively. tl.getVariable translates the
    // dotted name to the underlying env var (BUILD_REQUESTEDFOR /
    // RELEASE_REQUESTEDFOR) for us.
    buildRequestedFor: tl.getVariable("Build.RequestedFor"),
    releaseRequestedFor: tl.getVariable("Release.RequestedFor"),
    sourceBranch: tl.getVariable("Build.SourceBranch"),
    azureSubscriptionIdRaw: tl.getInput("azureSubscriptionId", false),
    azureResourceGroupRaw: tl.getInput("azureResourceGroup", false),
    azureDeploymentNameRaw: tl.getInput("azureDeploymentName", false),
    executionHashRaw: tl.getInput("executionHash", false),
    operationIdRaw: tl.getInput("operationId", false),
    attemptIdRaw: tl.getInput("attemptId", false),
    evaluationIdRaw: tl.getInput("evaluationId", false),
    correlationIdRaw: tl.getInput("correlationId", false),
    deploymentOutcomeRaw: tl.getInput("deploymentOutcome", false),
    effectWaitMinutesRaw: tl.getInput("effectWaitMinutes", false),
    run: {
      organization_url: tl.getVariable("System.CollectionUri"),
      project: tl.getVariable("System.TeamProject"),
      pipeline: tl.getVariable("Build.DefinitionName"),
      run_id: tl.getVariable("Build.BuildId"),
      repository: tl.getVariable("Build.Repository.Name"),
      commit: tl.getVariable("Build.SourceVersion"),
    },
  };

  let inputs;
  try {
    inputs = parseInputs(env);
  } catch (err) {
    setOutputs(emptyOutputs());
    const message =
      err instanceof GateInputError
        ? `AtlaSent Gate: ${err.message}`
        : `AtlaSent Gate: unexpected input error: ${err instanceof Error ? err.message : String(err)}`;
    tl.setResult(tl.TaskResult.Failed, message);
    return;
  }

  const result = await runGate(inputs, logger);
  setOutputs(result.outputs);
  tl.setResult(result.ok ? tl.TaskResult.Succeeded : tl.TaskResult.Failed, result.message);
}

main().catch((err) => {
  // Fail closed on anything unexpected reaching the top level — never let an
  // unhandled rejection surface as a green/neutral task result.
  tl.setResult(
    tl.TaskResult.Failed,
    `AtlaSent Gate: unexpected error: ${err instanceof Error ? err.message : String(err)}. Deploy blocked (fail-closed).`,
  );
});
