import { describe, expect, it } from "vitest";
import {
  COMMUNICATION_EXTERNAL_SEND_ACTION,
  GATE_PERMITTED_ACTIONS,
  INFRASTRUCTURE_CHANGE_ACTION,
  LEGACY_PRODUCTION_DEPLOY_ALIAS,
  MANDATORY_CHANGE_CONTROL_ACTIONS,
  OPTIONAL_VERIFIED_ACTOR_ACTIONS,
  PACKAGE_RELEASE_ACTION,
  PRODUCTION_DEPLOY_ACTION,
  PRODUCTION_ROLLBACK_ACTION,
  PROTECTED_ACTIONS_CATALOG,
  RECONCILIATION_CERTIFY_ACTION,
  SECRET_CONFIGURATION_CHANGE_ACTION,
  TRIAL_BLINDING_SETUP_ACTION,
  TRIAL_UNBLINDING_EMERGENCY_ACTION,
  TRIAL_UNBLINDING_EXECUTE_ACTION,
  TRUST_ROOT_PUBLISH_ACTION,
  assertProtectedAction,
  normalizeProtectedAction,
  ARTIFACT_RELEASE_ACTION,
  VERIFIED_ACTOR_REQUIRED_ACTIONS,
  SUPPLY_CHAIN_ASSERTION_ACTIONS,
} from "../canonicalAction";

describe("canonicalAction", () => {
  describe("normalizeProtectedAction", () => {
    it("passes the canonical through unchanged", () => {
      const out = normalizeProtectedAction(PRODUCTION_DEPLOY_ACTION);
      expect(out.canonical).toBe(PRODUCTION_DEPLOY_ACTION);
      expect(out.wasLegacyAlias).toBe(false);
    });

    it("rewrites the legacy alias to the canonical and flags it", () => {
      const out = normalizeProtectedAction(LEGACY_PRODUCTION_DEPLOY_ALIAS);
      expect(out.canonical).toBe(PRODUCTION_DEPLOY_ACTION);
      expect(out.wasLegacyAlias).toBe(true);
    });

    it("leaves unrelated strings unchanged (assert step rejects them separately)", () => {
      const out = normalizeProtectedAction("deploy.staging");
      expect(out.canonical).toBe("deploy.staging");
      expect(out.wasLegacyAlias).toBe(false);
    });
  });

  describe("assertProtectedAction", () => {
    it("accepts the canonical", () => {
      expect(() => assertProtectedAction(PRODUCTION_DEPLOY_ACTION)).not.toThrow();
    });

    it("accepts the legacy alias", () => {
      expect(() => assertProtectedAction(LEGACY_PRODUCTION_DEPLOY_ALIAS)).not.toThrow();
    });

    it("rejects malformed action strings", () => {
      // Uppercase is not a valid format
      expect(() => assertProtectedAction("DEPLOY.STAGING")).toThrow(
        /Invalid action type/,
      );
    });

    it("error message describes format requirements", () => {
      expect(() => assertProtectedAction("BAD_FORMAT")).toThrow(
        /dot-separated lowercase/,
      );
    });

    it("accepts any well-formed action type (format-only validation)", () => {
      // These are valid dot-separated lowercase strings — format passes regardless of catalog
      expect(() => assertProtectedAction("deploy.staging")).not.toThrow();
      expect(() => assertProtectedAction("custom.action.type")).not.toThrow();
    });

    it("accepts representative Phase 4–6 catalog actions", () => {
      // Phase 6 — database
      expect(() => assertProtectedAction("database.migration.apply")).not.toThrow();
      // Phase 4 — HR
      expect(() => assertProtectedAction("hr.employee.offboard")).not.toThrow();
      // Phase 5 — security
      expect(() => assertProtectedAction("security.incident.escalate")).not.toThrow();
      // Phase 5 — access
      expect(() => assertProtectedAction("access.cert.revoke")).not.toThrow();
    });

    it("PROTECTED_ACTIONS_CATALOG contains exactly 22 entries", () => {
      expect(PROTECTED_ACTIONS_CATALOG.size).toBe(22);
    });
  });

  describe("GATE_PERMITTED_ACTIONS", () => {
    it("permits production.deploy and package.release", () => {
      expect(GATE_PERMITTED_ACTIONS.has(PRODUCTION_DEPLOY_ACTION)).toBe(true);
      expect(GATE_PERMITTED_ACTIONS.has(PACKAGE_RELEASE_ACTION)).toBe(true);
    });

    it("permits the three GxP clinical trial action types", () => {
      expect(GATE_PERMITTED_ACTIONS.has(TRIAL_BLINDING_SETUP_ACTION)).toBe(true);
      expect(GATE_PERMITTED_ACTIONS.has(TRIAL_UNBLINDING_EXECUTE_ACTION)).toBe(true);
      expect(GATE_PERMITTED_ACTIONS.has(TRIAL_UNBLINDING_EMERGENCY_ACTION)).toBe(true);
    });

    it("permits trust_root.publish", () => {
      expect(GATE_PERMITTED_ACTIONS.has(TRUST_ROOT_PUBLISH_ACTION)).toBe(true);
    });

    it("permits the other three mandatory-change-control action types", () => {
      expect(GATE_PERMITTED_ACTIONS.has(INFRASTRUCTURE_CHANGE_ACTION)).toBe(true);
      expect(GATE_PERMITTED_ACTIONS.has(PRODUCTION_ROLLBACK_ACTION)).toBe(true);
      expect(GATE_PERMITTED_ACTIONS.has(SECRET_CONFIGURATION_CHANGE_ACTION)).toBe(true);
    });

    it("permits reconciliation.certify (SOX hold/human-approval demonstration path)", () => {
      // Added 2026-09-07: found via a real dispatch of
      // AtlaSent-Reference/pilot-deploy-gate's hold-approval-demo.yml, which
      // failed with "unsupported protected action" before this type was
      // added to the allow-list — the gate rejected the request before it
      // ever reached the AtlaSent API.
      expect(GATE_PERMITTED_ACTIONS.has(RECONCILIATION_CERTIFY_ACTION)).toBe(true);
    });

    it("permits communication.external.send (ACT-0050, license-renewal-sweep)", () => {
      // Added 2026-09-07 (atlasent-console#2147): found via a real scheduled
      // run of atlasent-console's license-renewal-sweep.yml, which failed
      // with "unsupported protected action" — the gate rejected the request
      // before it ever reached the AtlaSent API, even though ACT-0050 is
      // already provisioned as a real runtime-owning seeder in atlasent-api.
      expect(GATE_PERMITTED_ACTIONS.has(COMMUNICATION_EXTERNAL_SEND_ACTION)).toBe(true);
    });

    it("is a conservative explicit allow-list (not open to arbitrary types)", () => {
      expect(GATE_PERMITTED_ACTIONS.size).toBe(12);
      expect(GATE_PERMITTED_ACTIONS.has(ARTIFACT_RELEASE_ACTION)).toBe(true);
      // A well-formed but unlisted action is NOT gate-permitted, even though
      // its format is valid — the runtime policy is the authority, but the
      // gate's client-side guard stays explicit.
      expect(GATE_PERMITTED_ACTIONS.has("database.migration.apply")).toBe(false);
    });
  });

  describe("artifact.release", () => {
    it("requires a verified actor and a supply_chain assertion, but is not a change-control action", () => {
      expect(VERIFIED_ACTOR_REQUIRED_ACTIONS.has(ARTIFACT_RELEASE_ACTION)).toBe(true);
      expect(SUPPLY_CHAIN_ASSERTION_ACTIONS.has(ARTIFACT_RELEASE_ACTION)).toBe(true);
      expect(MANDATORY_CHANGE_CONTROL_ACTIONS.has(ARTIFACT_RELEASE_ACTION)).toBe(false);
      expect(OPTIONAL_VERIFIED_ACTOR_ACTIONS.has(ARTIFACT_RELEASE_ACTION)).toBe(false);
      // package.release keeps its opportunistic, non-mandatory actor and no assertion.
      expect(VERIFIED_ACTOR_REQUIRED_ACTIONS.has(PACKAGE_RELEASE_ACTION)).toBe(false);
      expect(SUPPLY_CHAIN_ASSERTION_ACTIONS.has(PACKAGE_RELEASE_ACTION)).toBe(false);
    });
  });

  describe("MANDATORY_CHANGE_CONTROL_ACTIONS", () => {
    it("contains exactly the four action types atlasent-api mandatorily requires a verified actor + change_plan for", () => {
      expect(MANDATORY_CHANGE_CONTROL_ACTIONS.size).toBe(4);
      expect(MANDATORY_CHANGE_CONTROL_ACTIONS.has(PRODUCTION_DEPLOY_ACTION)).toBe(true);
      expect(MANDATORY_CHANGE_CONTROL_ACTIONS.has(INFRASTRUCTURE_CHANGE_ACTION)).toBe(true);
      expect(MANDATORY_CHANGE_CONTROL_ACTIONS.has(PRODUCTION_ROLLBACK_ACTION)).toBe(true);
      expect(MANDATORY_CHANGE_CONTROL_ACTIONS.has(SECRET_CONFIGURATION_CHANGE_ACTION)).toBe(true);
    });

    it("is a strict subset of GATE_PERMITTED_ACTIONS (every mandatory-change-control type is also gate-permitted)", () => {
      for (const action of MANDATORY_CHANGE_CONTROL_ACTIONS) {
        expect(GATE_PERMITTED_ACTIONS.has(action)).toBe(true);
      }
    });

    it("does not include package.release or trust_root.publish (workload-identity-optional action types)", () => {
      expect(MANDATORY_CHANGE_CONTROL_ACTIONS.has(PACKAGE_RELEASE_ACTION)).toBe(false);
      expect(MANDATORY_CHANGE_CONTROL_ACTIONS.has(TRUST_ROOT_PUBLISH_ACTION)).toBe(false);
    });

    it("does not include communication.external.send (self-asserted actor, no change_plan)", () => {
      expect(MANDATORY_CHANGE_CONTROL_ACTIONS.has(COMMUNICATION_EXTERNAL_SEND_ACTION)).toBe(false);
    });

    it("package.release is distinct from production.deploy", () => {
      expect(PACKAGE_RELEASE_ACTION).toBe("package.release");
      expect(PACKAGE_RELEASE_ACTION).not.toBe(PRODUCTION_DEPLOY_ACTION);
    });
  });

  describe("OPTIONAL_VERIFIED_ACTOR_ACTIONS", () => {
    it("contains exactly package.release", () => {
      expect(OPTIONAL_VERIFIED_ACTOR_ACTIONS.size).toBe(1);
      expect(OPTIONAL_VERIFIED_ACTOR_ACTIONS.has(PACKAGE_RELEASE_ACTION)).toBe(true);
    });

    it("is disjoint from MANDATORY_CHANGE_CONTROL_ACTIONS (opportunistic-vs-required identity resolution are mutually exclusive)", () => {
      for (const action of OPTIONAL_VERIFIED_ACTOR_ACTIONS) {
        expect(MANDATORY_CHANGE_CONTROL_ACTIONS.has(action)).toBe(false);
      }
    });

    it("trust_root.publish is well-formed and distinct from production.deploy", () => {
      expect(TRUST_ROOT_PUBLISH_ACTION).toBe("trust_root.publish");
      expect(TRUST_ROOT_PUBLISH_ACTION).not.toBe(PRODUCTION_DEPLOY_ACTION);
    });
  });
});
