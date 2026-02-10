#!/usr/bin/env node
/**
 * Generate doc-titles.json from docs/ markdown frontmatter
 * Maps docId -> title for use by DocsSitemap component
 */
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const DOCS_DIR = path.join(__dirname, "../docs");
const OUTPUT_FILE = path.join(__dirname, "../src/data/doc-titles.json");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Recursively find all .md/.mdx files
 */
function findMarkdownFiles(dir, base = "") {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const relativePath = base ? `${base}/${item}` : item;

    if (fs.statSync(fullPath).isDirectory()) {
      results.push(...findMarkdownFiles(fullPath, relativePath));
    } else if (/\.(md|mdx)$/.test(item)) {
      results.push({ fullPath, relativePath });
    }
  }
  return results;
}

/**
 * Extract title from frontmatter or first H1
 */
function extractTitle(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  try {
    const { data, content: body } = matter(content);
    if (data.title) return data.title;
    const h1Match = body.match(/^#\s+(.+)$/m);
    if (h1Match) return h1Match[1];
  } catch {
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match) return h1Match[1];
  }
  return null;
}

function main() {
  console.log("📖 Generating doc-titles.json...");

  const files = findMarkdownFiles(DOCS_DIR);
  const titles = {};

  for (const { fullPath, relativePath } of files) {
    // Convert file path to docId: remove extension, convert index to parent
    let docId = relativePath.replace(/\.(md|mdx)$/, "");
    if (docId.endsWith("/index")) {
      docId = docId.replace(/\/index$/, "");
    }

    const title = extractTitle(fullPath);
    if (title) {
      titles[docId] = title;
    }
  }

  ensureDir(path.dirname(OUTPUT_FILE));
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(titles, null, 2) + "\n");
  console.log(`  → ${Object.keys(titles).length} doc titles written to src/data/doc-titles.json`);
}

main();
