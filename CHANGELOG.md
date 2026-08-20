# Changelog

## 1.0.1 - 2026-08-20

- Refreshed the official documentation snapshot (still 103 pages / 463 search entries). Search-index SHA and `gpu_perf` HTML hashes updated; no new developer API endpoints.
- Flagged stale help pages in the docs index: `latest_price` (2022), `spring_festival`, `tmp` (Caffe scratch), `suqian` (old beta), and `proxy_in_instance` (still describes one port).
- Expanded Skill core operational facts: disk paths, Hugging Face cache, SSH/scp/tunnel, cardless boot, extra data-disk calendar billing, Docker-in-container, discontinued multi-node / intranet IP, academic acceleration, long-job shutdown, and tidal 7-day / no-NAS retention.
- Updated the operations guide with cardless boot, NAS vs file storage vs public netdisk, 200k inode limit, WeChat host `www.autodl.com`, ESD reuse leftovers (up to 7 days), and conda interpreter path for ESD `cmd`.
- Updated the API reference: ESD env vars `AutoDLContainerUUID` / `AutoDLDeploymentUUID` / `AutoDLDataCenter`; incomplete public-image UUID table; Pro `start_command` does not fail boot; do not treat common_api “保存镜像” as a working endpoint.
- No MCP tools added.

## 1.0.0 - 2026-07-20

- Added a Codex plugin manifest and local MCP configuration.
- Added 26 typed AutoDL MCP tools.
- Added confirmation gates for billable, state-changing, destructive, and messaging operations.
- Added credential redaction and Token-isolation checks.
- Added an AutoDL Skill with API, lifecycle, billing, storage, networking, environment, and troubleshooting guidance.
- Indexed 103 official AutoDL documentation pages from 463 search entries.
- Added contract tests, live read-only tests, plugin validation, and GitHub Actions CI.
