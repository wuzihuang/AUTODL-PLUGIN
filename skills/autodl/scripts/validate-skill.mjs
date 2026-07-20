#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mcpRoot = process.env.AUTODL_MCP_DIR
  ? path.resolve(process.env.AUTODL_MCP_DIR)
  : path.resolve(skillRoot, "../autodl-mcp");

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

const skill = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
assert(skill.startsWith("---\n"), "SKILL.md 缺少 YAML frontmatter");
assert(/\nname: autodl\n/.test(skill), "SKILL.md name 必须为 autodl");
assert(/\ndescription: .+\n/.test(skill), "SKILL.md 缺少 description");

const manifest = JSON.parse(
  await readFile(path.join(skillRoot, "references/docs-manifest.json"), "utf8"),
);
assert(manifest.indexed_entries >= 463, `搜索索引条目数异常：${manifest.indexed_entries}`);
assert(manifest.unique_pages >= 103, `官方页面数异常：${manifest.unique_pages}`);
assert(manifest.reachable_pages === manifest.unique_pages, `存在不可访问页面：${manifest.unreachable_pages}`);
for (const requiredPage of ["/", "common_api", "instance_pro_api", "esd_api_doc", "anti_mining", "price", "instance_data"]) {
  assert(manifest.pages.some((page) => page.page === requiredPage), `文档清单缺少 ${requiredPage}`);
}

const apiReference = await readFile(path.join(skillRoot, "references/api-reference.md"), "utf8");
let toolNames = [];
let mcpAvailable = true;
try {
  const serverSource = await readFile(path.join(mcpRoot, "src/server.mjs"), "utf8");
  toolNames = [...new Set(serverSource.match(/"autodl_[a-z0-9_]+"/g) ?? [])].map((name) => name.slice(1, -1));
  assert(toolNames.length === 26, `MCP 工具数量异常：${toolNames.length}`);
  for (const toolName of toolNames) {
    assert(apiReference.includes(`\`${toolName}\``), `API 参考缺少工具 ${toolName}`);
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  mcpAvailable = false;
}

const files = [
  ...(await collectFiles(skillRoot)),
  ...(mcpAvailable ? await collectFiles(mcpRoot) : []),
];
for (const file of files) {
  if (!/\.(?:md|mjs|json|toml|example|gitignore)$/.test(file)) continue;
  const content = await readFile(file, "utf8");
  assert(
    !/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(content),
    `检测到疑似 JWT 被写入交付物：${file}`,
  );
}

process.stdout.write(`PASS Skill frontmatter\n`);
process.stdout.write(`PASS AutoDL 文档覆盖 ${manifest.reachable_pages}/${manifest.unique_pages} 页，搜索条目 ${manifest.indexed_entries}\n`);
process.stdout.write(
  mcpAvailable
    ? `PASS MCP 工具与 Skill 参考覆盖 ${toolNames.length}/${toolNames.length}\n`
    : `SKIP 未找到配套 MCP；设置 AUTODL_MCP_DIR 后可验证工具覆盖\n`,
);
process.stdout.write(`PASS 交付物未包含 JWT 形式的 Token\n`);
