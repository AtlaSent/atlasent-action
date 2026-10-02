/**
 * Edge-function region pinning for calls to the AtlaSent runtime.
 *
 * Supabase runs an edge function in the region nearest the CALLER, not the
 * database. The hosted runtime's database is in us-west-1, so a call from an
 * east-coast CI runner executes in us-east-* and each of the handler's
 * sequential database round trips crosses the continent. Measured on
 * 2026-10-02, v1-evaluate p50 was 1.8-2.1 s executing in us-west-1 against
 * 5.2-7.3 s in us-east-*. Supabase supports pinning only per request, through
 * the `x-region` header.
 *
 * This module is the only place that decides whether a request carries that
 * header and with what value. Callers spread `functionRegionHeaders(url)` into
 * the headers of every request to the runtime, and never write `x-region`
 * themselves.
 *
 * Resolution, first match wins:
 *   1. an explicit value passed by the caller (config / action input)
 *   2. the ATLASENT_FUNCTION_REGION environment variable
 *   3. us-west-1, but only when the URL is AtlaSent's hosted runtime
 *   4. nothing (Supabase picks the region, the pre-existing behavior)
 *
 * Step 3 is scoped to the hosted runtime on purpose. A self-hosted runtime
 * on a Supabase project in another region would be made slower, not faster,
 * by a blanket us-west-1 default.
 *
 * "auto" at step 1 or 2 means "send no header". Any other value must be a
 * region id. A malformed value throws, because a silently ignored typo would
 * put every call back on the slow path.
 */
export declare const FUNCTION_REGION_HEADER = "x-region";
export declare const FUNCTION_REGION_ENV = "ATLASENT_FUNCTION_REGION";
/** Region of the hosted runtime's database. Change only if the database moves. */
export declare const DEFAULT_FUNCTION_REGION = "us-west-1";
/** Hosts that serve AtlaSent's hosted runtime (production and staging). */
export declare const HOSTED_RUNTIME_HOSTS: ReadonlySet<string>;
/**
 * Regions Supabase accepts for `x-region`, from
 * https://supabase.com/docs/guides/functions/regional-invocation (2026-10-02).
 * An allowlist, not a pattern: a well-formed typo such as "us-wset-1" must be
 * rejected here, because the platform may not reject it for us.
 */
export declare const SUPPORTED_FUNCTION_REGIONS: ReadonlySet<string>;
export declare class FunctionRegionConfigError extends Error {
    constructor(value: string);
}
/** Parse a configured value: a region id, or null for "auto". Throws otherwise. */
export declare function parseFunctionRegion(value: string): string | null;
/**
 * The region a request to `url` should run in, or null for no pinning.
 * `explicit`: undefined or "" defers to the environment and default; "auto"
 * or null means unpinned; a region id pins.
 */
export declare function resolveFunctionRegion(url: string, explicit?: string | null, env?: Record<string, string | undefined>): string | null;
/** Headers to spread into a request to the runtime at `url`. Empty when unpinned. */
export declare function functionRegionHeaders(url: string, explicit?: string | null, env?: Record<string, string | undefined>): Record<string, string>;
