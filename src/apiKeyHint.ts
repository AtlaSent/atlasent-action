/**
 * Where a workflow author without an API key gets one. Appended to the
 * missing-key failure, which is the first run most new adopters see. Tagged
 * so a signup that follows is attributed to this Action.
 */
export const API_KEY_SIGNUP_URL =
  "https://console.atlasent.io/auth/sign-up?utm_source=github-action&utm_medium=error";

export const MISSING_API_KEY_HINT =
  `Add it as a repository or organization secret. Get a free API key at ${API_KEY_SIGNUP_URL}`;
