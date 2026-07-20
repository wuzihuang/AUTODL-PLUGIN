#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function collectFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", ".git"].includes(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await collectFiles(fullPath)));
    else result.push(fullPath);
  }
  return result;
}

const plugin = JSON.parse(
  await readFile(path.join(pluginRoot, ".codex-plugin/plugin.json"), "utf8"),
);
assert(plugin.name === "autodl", "plugin name 必须为 autodl");
assert(plugin.version === "1.0.0", "plugin version 必须为 1.0.0");
assert(plugin.skills === "./skills/", "skills 路径异常");
assert(plugin.mcpServers === "./.mcp.json", "MCP 配置路径异常");
assert(plugin.repository === "https://github.com/wuzihuang/AUTODL-PLUGIN", "repository 地址异常");

const mcpConfig = JSON.parse(await readFile(path.join(pluginRoot, ".mcp.json"), "utf8"));
assert(mcpConfig.mcpServers?.autodl?.command === "bash", "MCP 启动命令异常");
assert(
  mcpConfig.mcpServers.autodl.args?.[0] === "./scripts/start-mcp.sh",
  "MCP 启动脚本路径异常",
);

const serverSource = await readFile(path.join(pluginRoot, "mcp/src/server.mjs"), "utf8");
const tools = [...new Set(serverSource.match(/"autodl_[a-z0-9_]+"/g) ?? [])];
assert(tools.length === 26, `MCP 工具数量异常：${tools.length}`);

const manifest = JSON.parse(
  await readFile(path.join(pluginRoot, "skills/autodl/references/docs-manifest.json"), "utf8"),
);
assert(manifest.unique_pages >= 103, `文档页面数量异常：${manifest.unique_pages}`);
assert(manifest.reachable_pages === manifest.unique_pages, "文档清单存在不可访问页面");

const gitignore = await readFile(path.join(pluginRoot, ".gitignore"), "utf8");
assert(/^\.env$/m.test(gitignore), ".gitignore 必须忽略 .env");

for (const file of await collectFiles(pluginRoot)) {
  if (!/\.(?:md|mjs|js|json|toml|yml|yaml|sh|example|gitignore|svg)$/.test(file)) continue;
  const content = await readFile(file, "utf8");
  assert(
    !/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(content),
    `检测到疑似 JWT：${path.relative(pluginRoot, file)}`,
  );
}

process.stdout.write("PASS Codex plugin manifest\n");
process.stdout.write("PASS local MCP configuration\n");
process.stdout.write(`PASS typed MCP tools ${tools.length}/${tools.length}\n`);
process.stdout.write(`PASS official docs coverage ${manifest.reachable_pages}/${manifest.unique_pages}\n`);
process.stdout.write("PASS no JWT-like token in repository files\n");
