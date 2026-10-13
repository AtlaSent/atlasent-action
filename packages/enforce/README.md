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
import { enforce, EnforceError } from "@atlasent/enforce";

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
  if (err instanceof EnforceError) {
    // err.phase: "evaluate" | "verify" | "verify-permit" | "execute"
    console.error(`blocked at ${err.phase}: ${err.message}`);
  }
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
