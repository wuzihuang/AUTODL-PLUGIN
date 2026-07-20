#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const docsBase = "https://www.autodl.com/docs/";
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencesDir = path.join(skillRoot, "references");
const fetchedAt = new Date().toISOString();

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stripHtml(value) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function pageFromLocation(location) {
  const withoutAnchor = location.split("#", 1)[0].replace(/\/$/, "");
  return withoutAnchor || "/";
}

async function fetchText(url) {
  let lastResult;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: { "User-Agent": "autodl-skill-doc-audit/1.0" },
      redirect: "follow",
    });
    const text = await response.text();
    lastResult = { status: response.status, ok: response.ok, text };
    if (response.ok || ![429, 502, 503, 504].includes(response.status)) return lastResult;
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  return lastResult;
}

async function readCachedHtml(cacheDir, page) {
  if (!cacheDir) return null;
  const relative = page === "/" ? "__root__/index.html" : `${page}/index.html`;
  try {
    return await readFile(path.join(cacheDir, relative), "utf8");
  } catch {
    return null;
  }
}

const searchResponse = await fetchText(new URL("search/search_index.json", docsBase));
if (!searchResponse.ok) {
  throw new Error(`无法下载 AutoDL 搜索索引：HTTP ${searchResponse.status}`);
}
const searchIndex = JSON.parse(searchResponse.text);
const grouped = new Map();
for (const entry of searchIndex.docs) {
  const page = pageFromLocation(entry.location);
  if (!grouped.has(page)) grouped.set(page, []);
  grouped.get(page).push(entry);
}

const pages = [...grouped.entries()]
  .map(([page, entries]) => ({
    page,
    url: page === "/" ? docsBase : new URL(`${page}/`, docsBase).href,
    title: entries[0]?.title || page,
    headings: [...new Set(entries.map((entry) => entry.title).filter(Boolean))],
    indexedText: stripHtml(entries.map((entry) => entry.text || "").join(" ")),
  }))
  .sort((a, b) => a.page.localeCompare(b.page));

const results = [];
const cacheDir = process.env.AUTODL_DOCS_CACHE_DIR;
for (const page of pages) {
  try {
    const cached = await readCachedHtml(cacheDir, page.page);
    const response = cached === null ? await fetchText(page.url) : { status: 200, ok: true, text: cached };
    results.push({
      ...page,
      http_status: response.status,
      reachable: response.ok,
      source: cached === null ? "network" : "cache",
      html_bytes: Buffer.byteLength(response.text),
      html_sha256: sha256(response.text),
      indexed_text_chars: page.indexedText.length,
      indexed_text_sha256: sha256(page.indexedText),
    });
  } catch (error) {
    results.push({
      ...page,
      http_status: null,
      reachable: false,
      source: "network",
      error: error instanceof Error ? error.message : String(error),
      html_bytes: 0,
      html_sha256: null,
      indexed_text_chars: page.indexedText.length,
      indexed_text_sha256: sha256(page.indexedText),
    });
  }
}

const manifest = {
  generated_at: fetchedAt,
  source: docsBase,
  search_index_sha256: sha256(searchResponse.text),
  indexed_entries: searchIndex.docs.length,
  unique_pages: results.length,
  reachable_pages: results.filter((item) => item.reachable).length,
  unreachable_pages: results.filter((item) => !item.reachable).length,
  pages: results.map(({ indexedText, ...item }) => item),
};

const lines = [
  "# AutoDL 官方文档索引",
  "",
  `生成时间：${fetchedAt}`,
  "",
  `来源：${docsBase}`,
  "",
  `搜索索引共 ${manifest.indexed_entries} 个条目，归并为 ${manifest.unique_pages} 个页面；${manifest.reachable_pages} 个可访问，${manifest.unreachable_pages} 个不可访问。`,
  "",
  "此索引用于帮助 Skill 在回答和操作前路由到正确的官方页面。页面内容可能更新；涉及价格、认证、配额、库存或规则时，应重新查看对应官方页面。",
  "",
  "| 页面 | 标题 | 主要章节 | 状态 |",
  "|---|---|---|---:|",
];
for (const item of results) {
  const pageLabel = item.page === "/" ? "首页" : item.page;
  const sectionPreview = item.headings.slice(0, 8).join("；") + (item.headings.length > 8 ? `；…（共 ${item.headings.length} 节）` : "");
  lines.push(
    `| [${escapeCell(pageLabel)}](${item.url}) | ${escapeCell(item.title)} | ${escapeCell(sectionPreview)} | HTTP ${item.http_status ?? "ERR"} |`,
  );
}

await mkdir(referencesDir, { recursive: true });
await writeFile(path.join(referencesDir, "docs-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(path.join(referencesDir, "docs-index.md"), `${lines.join("\n")}\n`);

process.stdout.write(
  `AutoDL 文档索引已刷新：${manifest.reachable_pages}/${manifest.unique_pages} 页面可访问。\n`,
);
if (manifest.unreachable_pages > 0) {
  for (const page of results.filter((item) => !item.reachable)) {
    process.stdout.write(`不可访问：${page.url} HTTP ${page.http_status ?? "ERR"}\n`);
  }
}
