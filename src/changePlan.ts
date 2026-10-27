// change_plan construction for the four mandatory change-control actions.
//
// atlasent-api requires a top-level `change_plan` on evaluate for every
// MANDATORY_CHANGE_CONTROL_ACTIONS type and derives the permit's execution
// binding from it (_shared/mandatory-execution-binding.ts). The single-eval
// path and the rehearsal mode build it here so the two can never drift.

import { MANDATORY_CHANGE_CONTROL_ACTIONS } from "./canonicalAction";

export interface MandatoryChangePlan {
  operation: string;
  revision: string;
  artifact_ref?: string;
}

/**
 * The change plan for `actionType`, or undefined when the action is not a
 * mandatory change-control action.
 *
 * `operation` just needs to be a non-empty string identifying what kind of
 * mutation this is (isCompleteChangePlan has no fixed vocabulary), so it is
 * the action type's trailing segment. `revision` must be the commit SHA from
 * the broker-verified workload identity; callers fail closed when it is
 * empty. `artifactDigest` is passed through unchanged as `artifact_ref`.
 */
export function buildMandatoryChangePlan(
  actionType: string,
  revision: string,
  artifactDigest: string | undefined,
): MandatoryChangePlan | undefined {
  if (!MANDATORY_CHANGE_CONTROL_ACTIONS.has(actionType)) return undefined;
  const operation = actionType.split(".").pop() || actionType;
  return {
    operation,
    revision,
    ...(artifactDigest ? { artifact_ref: artifactDigest } : {}),
  };
}
