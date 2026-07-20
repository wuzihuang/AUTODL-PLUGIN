# Security policy

## Secrets

Never commit an AutoDL developer Token. Configure it through the local `.env` file or the parent process environment as `AUTODL_TOKEN`. The repository ignores `.env` and the validation script rejects JWT-shaped values in repository files.

If a Token was committed or published, revoke it in the AutoDL console immediately, generate a new Token, remove the secret from Git history, and rotate any dependent credentials.

## Resource-changing operations

The MCP server requires `confirm=true` for billable, state-changing, destructive, or external-message tools. This is a technical guardrail, not a replacement for reviewing the target identifier, price, backup status, and data impact.

Instance release and deployment deletion are marked destructive. Instance credentials returned by snapshot APIs are redacted unless `include_credentials=true` is explicitly requested.

## Reporting a vulnerability

Please open a GitHub security advisory for the repository instead of publishing sensitive details in a public issue.

This is a community integration and not an official AutoDL product. AutoDL account, service, privacy, and acceptable-use rules still apply.
