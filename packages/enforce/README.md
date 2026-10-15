# @atlasent/enforce

Fail-closed execution wrapper for [AtlaSent](https://www.atlasent.io): a
consequential action (a deploy, a data export, a secret rotation) runs only
after AtlaSent authorizes it and the permit is verified, immediately before
execution.

```sh
npm install @atlasent/enforce
```

You need an AtlaSent API key. [Create a free account](https://console.atlasent.io/auth/sign-up?utm_source=enforce&utm_medium=npm-readme)
and copy a key from the console.

## Usage

```ts
import { enforce, EnforceError, isBlockedBeforeExecution } from "@atlasent/enforce";

try {
  const { result, decision } = await enforce(
    {
      apiKey: process.env.ATLASENT_API_KEY!,
      action: "production.deploy",
      actor: "github:octocat",
      targetId: "api-service",
      environment: "live",
    },
    async () => deploy(), // runs only after an allow AND a verified permit
  );
  console.log("deployed", decision.evaluationId);
} catch (err) {
  if (isBlockedBeforeExecution(err)) {
    // enforce() raised this at its gate: your function never ran.
    // err.phase: "evaluate" | "verify" | "verify-permit"
    console.error(`blocked before your function ran, at ${err.phase}: ${err.message}`);
  } else if (err instanceof EnforceError) {
    // Your function ran and threw an EnforceError of its own (for example
    // from a nested enforce() call). Its effects may already have begun.
    console.error(`your function ran, then failed: ${err.message}`);
  }
  // Anything else also came from your own function, which throws unchanged.
  throw err;
}
```

`enforce()` runs three steps in order, and your function runs only if all of them pass:

1. **`evaluate(config)`** calls `/v1-evaluate`. A network error, timeout, or
   malformed response throws. It never returns a default allow.
2. **`verify(decision)`** throws on anything other than `allow`: `deny`,
   `hold` and `escalate` all block.
3. **`verifyPermit(config, decision)`** calls `/v1-verify-permit`. An expired,
   replayed, revoked or mismatched permit throws.

There is no fail-open path. When AtlaSent cannot be reached, the action does
not run.

`err instanceof EnforceError` alone does not prove your function was blocked.
Your function can throw an `EnforceError` itself, and `enforce()` passes it
through unchanged. Use `isBlockedBeforeExecution(err)` (or
`err.blockedBeforeExecution`): it is `true` only for an error `enforce()`
raised in one of the three steps above, before calling your function. An
`EnforceError` that escapes from your function, including one a nested
`enforce()` raised at its own gate, reports `false`.

## Lower-level building blocks

Each step is also exported on its own, so a caller can evaluate in one job and
verify at the execution boundary in another: `evaluate`, `verify`,
`verifyPermit`, `reverifyPermit`, `waitForApprovalResolution` (pause on
`hold` until a person decides in the console), and `requiredBindingsFor`.

## Related

- [AtlaSent GitHub Action](https://github.com/AtlaSent/atlasent-action): the
  same gate, as a workflow step.
- [`@atlasent/sdk`](https://www.npmjs.com/package/@atlasent/sdk): the full
  TypeScript client.

## License

Apache-2.0
