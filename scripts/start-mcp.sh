#!/usr/bin/env bash
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -d "$PLUGIN_ROOT/node_modules/@modelcontextprotocol/sdk" ]]; then
  printf 'AutoDL MCP dependencies are missing. Run `npm install` in %s first.\n' "$PLUGIN_ROOT" >&2
  exit 1
fi

exec node "$PLUGIN_ROOT/mcp/src/index.mjs"
