# Contributing

Contributions are welcome, especially documentation drift fixes, additional response fixtures, better validation, and newly documented AutoDL developer APIs.

## Development

```bash
npm install
npm test
```

To refresh the official documentation index:

```bash
npm run docs:refresh
npm test
```

Do not include a real AutoDL Token in fixtures, screenshots, issues, commits, or pull requests. State-changing API tests must use the local mock server unless a dedicated disposable test account and explicit cost/data limits are available.

Keep each MCP tool typed and endpoint-specific. New mutation tools must return a preview when `confirm` is false and must document billing, interruption, or deletion impact.
