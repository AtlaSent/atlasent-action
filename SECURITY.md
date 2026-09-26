# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in this repository, **do not open a public GitHub issue**. Email [security@atlasent.io](mailto:security@atlasent.io) with:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept (if available)
- The version or commit SHA where you observed the issue
- Your contact information for follow-up

We acknowledge all reports within **2 business days**.

## Scope

| In scope | Out of scope |
|----------|--------------|
| `atlasent-action` (this repo) | The AtlaSent SaaS service itself |
| Action input validation and injection risks | GitHub Actions runner security (report to GitHub) |
| API key handling and masking in logs | Third-party actions used as dependencies |
| Fail-closed behavior when AtlaSent API is unreachable | Social engineering or phishing |
| `ATLASENT_API_KEY` exposure in logs or outputs | Theoretical vulnerabilities without a working PoC |

## Supported versions

| Version | Supported |
|---------|-----------|
| Latest release (`@latest` / `@v1`) | Yes |
| Previous minor release | Security fixes only |
| Older releases | No |

Pin to a specific SHA for maximum supply-chain safety: `uses: atlasent-systems-inc/atlasent-action@<sha>`.

## Disclosure policy

1. Reporter submits to security@atlasent.io
2. We acknowledge within 2 business days
3. We assess severity and open a private GitHub Security Advisory
4. We develop and test a fix
5. We coordinate a disclosure date with the reporter (typically 14–90 days depending on severity)
6. We release a patched action version and publish the advisory
7. Reporter is credited unless they request anonymity

We follow [responsible disclosure](https://cheatsheetseries.owasp.org/cheatsheets/Vulnerability_Disclosure_Cheat_Sheet.html) principles.

## Severity definitions

| Severity | Example | Target fix timeline |
|----------|---------|--------------------|
| Critical | Auth bypass, permit forgery, RCE in action runner | 24–48 hours |
| High | `ATLASENT_API_KEY` leaked to logs or outputs, SSRF | 7 days |
| Medium | Action output that silently permits a denied deployment | 30 days |
| Low | Misleading error messages, low-impact info disclosure | 90 days |

## Security architecture overview

- **API key handling**: `ATLASENT_API_KEY` is passed as a GitHub Actions secret and used as a Bearer token. It is never echoed to logs. The action calls `core.setSecret()` at startup to mask the key if it appears in any output.
- **Fail-closed**: If the AtlaSent API is unreachable or returns an error, the action exits with a non-zero exit code and fails the workflow step. It never silently defaults to `allow`.
- **Inputs**: All action inputs (`actor`, `action`, `target-id`, `context`, etc.) are validated before forwarding to the AtlaSent API. No shell interpolation is performed on input values.
- **Outputs**: The action sets `decision` (`allow`/`deny`/`hold`/`escalate`), `verified`, and `permit-token` as step outputs. These are not masked since they are not secrets, but callers should not use `permit-token` as a credential — gate execution on `verified`, not `decision`.
- **Supply chain**: The action bundles its compiled output in `dist/index.js`. The build is reproducible from source via `npm run build`. Pin to a specific commit SHA in production workflows.
- **Permissions**: The action requires no GitHub token by default. It only needs network access to the AtlaSent API endpoint.

## Recommended usage

```yaml
- uses: Atlasent/atlasent-action@v1  # pin to SHA in production
  env:
    ATLASENT_API_KEY: ${{ secrets.ATLASENT_API_KEY }}
    ATLASENT_BASE_URL: ${{ secrets.ATLASENT_BASE_URL }}
  with:
    action: production.deploy
    actor: ${{ github.actor }}
    target-id: ${{ github.repository }}
```

**Never** hardcode `ATLASENT_API_KEY` as a plain string in the workflow. Always reference it via `${{ secrets.YOUR_SECRET }}`.

## Security contact

- **Email**: security@atlasent.io
- **PGP**: Available on request
- **Response SLA**: 2 business days for acknowledgement
