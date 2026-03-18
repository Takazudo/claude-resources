import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import matter from "gray-matter";
import { settings } from "../config/settings";

/** Strip markdown formatting to produce plain text */
export function stripMarkdown(md: string): string {
  return (
    md
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`]+`/g, "")
      // Remove HTML tags
      .replace(/<[^>]+>/g, "")
      // Remove headings markers
      .replace(/^#{1,6}\s+/gm, "")
      // Remove emphasis/bold markers
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
      .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
      // Remove images (must run before link removal)
      .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
      // Remove links but keep text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Remove blockquote markers
      .replace(/^>\s+/gm, "")
      // Remove horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, "")
      // Remove list markers
      .replace(/^[\s]*[-*+]\s+/gm, "")
      .replace(/^[\s]*\d+\.\s+/gm, "")
      // Remove import statements
      .replace(/^import\s+.*$/gm, "")
      // Remove export statements
      .replace(/^export\s+.*$/gm, "")
      // Collapse whitespace
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** Walk a directory and collect all .md/.mdx files */
export function collectMdFiles(
  dir: string,
): Array<{ filePath: string; slug: string }> {
  const results: Array<{ filePath: string; slug: string }> = [];

  function walk(currentDir: string, baseDir: string): void {
    let entries;
    try {
      entries = readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, baseDir);
      } else if (/\.mdx?$/.test(entry.name) && !entry.name.startsWith("_")) {
        const rel = relative(baseDir, fullPath)
          .replace(/\.mdx?$/, "")
          .replace(/\/index$/, "");
        results.push({ filePath: fullPath, slug: rel });
      }
    }
  }

  walk(dir, dir);
  return results;
}

/** Compute a URL from a slug and locale. When absolute is true and siteUrl is configured, returns a full URL. */
export function slugToUrl(slug: string, locale: string | null, absolute = false): string {
  const base = settings.base.replace(/\/$/, "");
  const path = locale ? `${base}/${locale}/docs/${slug}` : `${base}/docs/${slug}`;
  if (absolute && settings.siteUrl) {
    return `${settings.siteUrl.replace(/\/$/, "")}${path}`;
  }
  return path;
}

/** Frontmatter fields used across the project */
export interface DocFrontmatter {
  title?: string;
  description?: string;
  sidebar_position?: number;
  category?: string;
  draft?: boolean;
  unlisted?: boolean;
  search_exclude?: boolean;
  [key: string]: unknown;
}

/** Parse a markdown file and return frontmatter + content */
export function parseMarkdownFile(filePath: string): { data: DocFrontmatter; content: string } | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    return matter(raw);
  } catch {
    return null;
  }
}

/** Check if a document should be excluded from indexing */
export function isExcluded(data: DocFrontmatter): boolean {
  return !!(data.search_exclude || data.draft || data.unlisted);
}
