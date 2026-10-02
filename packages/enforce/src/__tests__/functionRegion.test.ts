import { describe, expect, it } from "vitest";
import {
  DEFAULT_FUNCTION_REGION,
  FUNCTION_REGION_ENV,
  FunctionRegionConfigError,
  functionRegionHeaders,
  parseFunctionRegion,
  resolveFunctionRegion,
} from "../functionRegion";

const HOSTED = "https://kttccumlnmdtupgbyfue.supabase.co/functions/v1";
const HOSTED_STAGING = "https://lwnqpmnxpeyhpxvastku.supabase.co/functions/v1";
const HOSTED_APEX = "https://api.atlasent.io/functions/v1";
const SELF_HOSTED = "https://abcdefghijklmnopqrst.supabase.co/functions/v1";
const NO_ENV = {};

describe("resolveFunctionRegion", () => {
  it.each([HOSTED, HOSTED_STAGING, HOSTED_APEX])("defaults the hosted runtime %s to us-west-1", (url) => {
    expect(resolveFunctionRegion(url, undefined, NO_ENV)).toBe(DEFAULT_FUNCTION_REGION);
    expect(DEFAULT_FUNCTION_REGION).toBe("us-west-1");
  });

  it("matches the hosted host case-insensitively and with a trailing path", () => {
    expect(resolveFunctionRegion("https://API.AtlaSent.io/functions/v1/v1-evaluate", undefined, NO_ENV)).toBe(
      "us-west-1",
    );
  });

  it("does not pin a self-hosted runtime by default (it may live in another region)", () => {
    expect(resolveFunctionRegion(SELF_HOSTED, undefined, NO_ENV)).toBeNull();
    expect(resolveFunctionRegion("http://localhost:54321/functions/v1", undefined, NO_ENV)).toBeNull();
  });

  it("does not pin when the URL cannot be parsed", () => {
    expect(resolveFunctionRegion("not a url", undefined, NO_ENV)).toBeNull();
  });

  it("does not treat a lookalike host as hosted", () => {
    expect(resolveFunctionRegion("https://api.atlasent.io.evil.example/functions/v1", undefined, NO_ENV)).toBeNull();
    expect(resolveFunctionRegion("https://evil-kttccumlnmdtupgbyfue.supabase.co", undefined, NO_ENV)).toBeNull();
  });

  it("uses the environment variable over the default, for any host", () => {
    const env = { [FUNCTION_REGION_ENV]: "us-east-1" };
    expect(resolveFunctionRegion(HOSTED, undefined, env)).toBe("us-east-1");
    expect(resolveFunctionRegion(SELF_HOSTED, undefined, env)).toBe("us-east-1");
  });

  it("uses an explicit value over the environment variable", () => {
    const env = { [FUNCTION_REGION_ENV]: "us-east-1" };
    expect(resolveFunctionRegion(HOSTED, "eu-west-1", env)).toBe("eu-west-1");
  });

  it("treats an empty explicit value as unset", () => {
    expect(resolveFunctionRegion(HOSTED, "", NO_ENV)).toBe("us-west-1");
    expect(resolveFunctionRegion(HOSTED, "  ", { [FUNCTION_REGION_ENV]: "us-east-2" })).toBe("us-east-2");
    expect(resolveFunctionRegion(HOSTED, undefined, { [FUNCTION_REGION_ENV]: "" })).toBe("us-west-1");
  });

  it('"auto" or null means unpinned, even for the hosted runtime', () => {
    expect(resolveFunctionRegion(HOSTED, "auto", NO_ENV)).toBeNull();
    expect(resolveFunctionRegion(HOSTED, null, { [FUNCTION_REGION_ENV]: "us-east-1" })).toBeNull();
    expect(resolveFunctionRegion(HOSTED, undefined, { [FUNCTION_REGION_ENV]: "auto" })).toBeNull();
  });

  it("throws on a malformed value instead of silently dropping it", () => {
    for (const bad of ["US-WEST-1", "us-west", "uswest1", "us-west-1\nx-evil: 1", "us-west-1 ", "west"]) {
      if (bad === "us-west-1 ") continue; // surrounding whitespace is trimmed, see below
      expect(() => resolveFunctionRegion(HOSTED, bad, NO_ENV)).toThrow(FunctionRegionConfigError);
    }
    expect(() => resolveFunctionRegion(HOSTED, undefined, { [FUNCTION_REGION_ENV]: "nope" })).toThrow(
      FunctionRegionConfigError,
    );
  });

  it("trims surrounding whitespace", () => {
    expect(parseFunctionRegion(" us-east-1 ")).toBe("us-east-1");
  });
});

describe("functionRegionHeaders", () => {
  it("returns the x-region header when pinned", () => {
    expect(functionRegionHeaders(HOSTED, undefined, NO_ENV)).toEqual({ "x-region": "us-west-1" });
  });

  it("returns no headers at all when unpinned, so existing requests are byte-identical", () => {
    expect(functionRegionHeaders(SELF_HOSTED, undefined, NO_ENV)).toEqual({});
    expect(functionRegionHeaders(HOSTED, "auto", NO_ENV)).toEqual({});
  });
});
