import { describe, expect, it } from "vitest";
import { parseInputs } from "../inputs";

describe("parseInputs", () => {
  // ── v2.0 single-eval path ───────────────────────────────────────────────

  it("parses v2.0 single-input path", () => {
    const out = parseInputs({
      ATLASENT_API_KEY: "ask_test",
      INPUT_ACTION: "production.deploy",
      GITHUB_ACTOR: "alice",
    });
    expect(out.evaluations).toBeUndefined();
    expect(out.policySync).toBeUndefined();
    expect(out.single?.action).toBe("production.deploy");
    expect(out.single?.actor).toBe("alice");
  });

  // ── v2.1 batch path ─────────────────────────────────────────────────

  it("parses v2.1 list-input path", () => {
    const out = parseInputs({
      ATLASENT_API_KEY: "ask_test",
      INPUT_EVALUATIONS: JSON.stringify([
        { action: "production.deploy", actor: "alice" },
        { action: "production.deploy", actor: "alice" },
      ]),
    });
    expect(out.evaluations).toHaveLength(2);
    expect(out.evaluations?.[1].action).toBe("production.deploy");
    expect(out.policySync).toBeUndefined();
  });

  it("prefers list when both action and evaluations are set", () => {
    const out = parseInputs({
      ATLASENT_API_KEY: "ask_test",
      INPUT_ACTION: "ignored",
      INPUT_EVALUATIONS: JSON.stringify([{ action: "production.deploy", actor: "alice" }]),
    });
    expect(out.evaluations).toHaveLength(1);
    expect(out.single).toBeUndefined();
  });

  it("throws on empty list", () => {
    expect(() =>
      parseInputs({
        ATLASENT_API_KEY: "ask_test",
        INPUT_EVALUATIONS: "[]",
      }),
    ).toThrow(/non-empty/);
  });

  it("throws a clear error on invalid JSON in evaluations", () => {
    expect(() =>
      parseInputs({
        ATLASENT_API_KEY: "ask_test",
        INPUT_EVALUATIONS: "not-json",
      }),
    ).toThrow(/not valid JSON/);
  });

  it("throws a clear error on invalid JSON in context", () => {
    expect(() =>
      parseInputs({
        ATLASENT_API_KEY: "ask_test",
        INPUT_ACTION: "production.deploy",
        INPUT_CONTEXT: "{bad json}",
      }),
    ).toThrow(/not valid JSON/);
  });

  it("throws when neither single nor list is set", () => {
    expect(() => parseInputs({ ATLASENT_API_KEY: "ask_test" })).toThrow(
      /Missing required input: action/,
    );
  });

  it("accepts ATLASENT_API_KEY as the required secret", () => {
    const out = parseInputs({
      ATLASENT_API_KEY: "ask_test_env",
      INPUT_ACTION: "production.deploy",
      GITHUB_ACTOR: "alice",
    });
    expect(out.apiKey).toBe("ask_test_env");
  });

  it("throws on malformed action type", () => {
    expect(() =>
      parseInputs({
        ATLASENT_API_KEY: "ask_test_env",
        INPUT_ACTION: "INVALID_ACTION_FORMAT",
      }),
    ).toThrow(/Invalid action type/);
  });

  // ── V1 alias-window tolerance ───────────────────────────────────────

  it("accepts the legacy deployment.production alias and normalizes single-eval to canonical", () => {
    const out = parseInputs({
      ATLASENT_API_KEY: "ask_test",
      INPUT_ACTION: "deployment.production",
      GITHUB_ACTOR: "alice",
    });
    expect(out.single?.action).toBe("production.deploy");
  });

  it("accepts the legacy alias inside batch evaluations and rewrites every item to canonical", () => {
    const out = parseInputs({
      ATLASENT_API_KEY: "ask_test",
      INPUT_EVALUATIONS: JSON.stringify([
        { action: "deployment.production", actor: "alice" },
        { action: "production.deploy", actor: "bob" },
      ]),
    });
    expect(out.evaluations).toHaveLength(2);
    expect(out.evaluations?.[0].action).toBe("production.deploy");
    expect(out.evaluations?.[1].action).toBe("production.deploy");
  });

  // ── Policy sync path ─────────────────────────────────────────────────

  it("parses policy sync mode with defaults", () => {
    const out = parseInputs({
      ATLASENT_API_KEY: "ask_test",
      "INPUT_POLICY-SYNC": "true",
      "INPUT_POLICY-BUNDLE": "policies/bundle.json",
    });
    expect(out.policySync).toBeDefined();
    expect(out.policySync?.bundlePath).toBe("policies/bundle.json");
    expect(out.policySync?.dryRun).toBe(true); // default
    expect(out.policySync?.source).toBeUndefined();
    expect(out.evaluations).toBeUndefined();
    expect(out.single).toBeUndefined();
  });

  it("parses policy-dry-run=false", () => {
    const out = parseInputs({
      ATLASENT_API_KEY: "ask_test",
      "INPUT_POLICY-SYNC": "true",
      "INPUT_POLICY-BUNDLE": "policies/bundle.json",
      "INPUT_POLICY-DRY-RUN": "false",
    });
    expect(out.policySync?.dryRun).toBe(false);
  });

  it("parses policy-dry-run=true explicitly", () => {
    const out = parseInputs({
      ATLASENT_API_KEY: "ask_test",
      "INPUT_POLICY-SYNC": "true",
      "INPUT_POLICY-BUNDLE": "policies/bundle.json",
      "INPUT_POLICY-DRY-RUN": "true",
    });
    expect(out.policySync?.dryRun).toBe(true);
  });

  it("parses policy-source", () => {
    const out = parseInputs({
      ATLASENT_API_KEY: "ask_test",
      "INPUT_POLICY-SYNC": "true",
      "INPUT_POLICY-BUNDLE": "policies/bundle.json",
      "INPUT_POLICY-SOURCE": "ci-pipeline",
    });
    expect(out.policySync?.source).toBe("ci-pipeline");
  });

  it("throws when policy-sync=true but policy-bundle is missing", () => {
    expect(() =>
      parseInputs({
        ATLASENT_API_KEY: "ask_test",
        "INPUT_POLICY-SYNC": "true",
      }),
    ).toThrow(/policy-bundle.*required/);
  });

  it("policy-sync=true takes priority over evaluations", () => {
    const out = parseInputs({
      ATLASENT_API_KEY: "ask_test",
      "INPUT_POLICY-SYNC": "true",
      "INPUT_POLICY-BUNDLE": "policies/bundle.json",
      INPUT_EVALUATIONS: JSON.stringify([{ action: "deploy", actor: "alice" }]),
    });
    expect(out.policySync).toBeDefined();
    expect(out.evaluations).toBeUndefined();
  });

  it("policy-sync=true takes priority over single action", () => {
    const out = parseInputs({
      ATLASENT_API_KEY: "ask_test",
      "INPUT_POLICY-SYNC": "true",
      "INPUT_POLICY-BUNDLE": "policies/bundle.json",
      INPUT_ACTION: "production.deploy",
    });
    expect(out.policySync).toBeDefined();
    expect(out.single).toBeUndefined();
  });

  it("policy-sync=false falls through to normal routing", () => {
    const out = parseInputs({
      ATLASENT_API_KEY: "ask_test",
      "INPUT_POLICY-SYNC": "false",
      INPUT_ACTION: "production.deploy",
      GITHUB_ACTOR: "alice",
    });
    expect(out.policySync).toBeUndefined();
    expect(out.single?.action).toBe("production.deploy");
  });
});

describe("missing ATLASENT_API_KEY", () => {
  it("names the secret and links to sign-up, attributed to this Action", () => {
    expect(() => parseInputs({ "INPUT_ACTION": "production.deploy" })).toThrow(
      /^Missing required secret: ATLASENT_API_KEY\. Add it as a repository or organization secret\. Get a free API key at https:\/\/console\.atlasent\.io\/auth\/sign-up\?utm_source=github-action&utm_medium=error$/,
    );
  });
});
