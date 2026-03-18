import type { AstroIntegration } from "astro";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { settings } from "../config/settings";
import { stripMarkdown, collectMdFiles, slugToUrl, parseMarkdownFile, isExcluded } from "../utils/content-files";

/** Strip imports, exports, and HTML/JSX tags from markdown content (keep structure for LLM consumption) */
function stripImportsAndJsx(content: string): string {
  return (
    content
      // Remove import statements
      .replace(/^import\s+.*$/gm, "")
      // Remove export statements
      .replace(/^export\s+.*$/gm, "")
      // Remove all HTML/JSX tags (both uppercase components and lowercase elements)
      .replace(/<\/?[a-zA-Z][a-zA-Z0-9]*[^>]*>/g, "")
      // Collapse excessive blank lines
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

interface DocEntry {
  title: string;
  description: string;
  url: string;
  content: string;
  sidebarPosition: number | undefined;
}

/** Build doc entries for a content directory */
function buildDocEntries(
  contentDir: string,
  locale: string | null,
): DocEntry[] {
  const absDir = resolve(contentDir);
  const files = collectMdFiles(absDir);
  const entries: DocEntry[] = [];

  for (const { filePath, slug } of files) {
    const parsed = parseMarkdownFile(filePath);
    if (!parsed) continue;
    const { data, content } = parsed;

    // Skip excluded/draft/unlisted pages
    if (isExcluded(data)) continue;

    let description = data.description ?? "";
    if (!description) {
      const stripped = stripMarkdown(content);
      description = stripped.split("\n").find((l) => l.trim().length > 0) ?? "";
    }

    entries.push({
      title: data.title ?? slug,
      description,
      url: slugToUrl(slug, locale, true),
      content: stripImportsAndJsx(content),
      sidebarPosition: data.sidebar_position,
    });
  }

  // Sort by sidebar_position (entries without position go last)
  entries.sort((a, b) => {
    const posA = a.sidebarPosition ?? Number.MAX_SAFE_INTEGER;
    const posB = b.sidebarPosition ?? Number.MAX_SAFE_INTEGER;
    return posA - posB;
  });

  return entries;
}

/** Generate llms.txt content */
function generateLlmsTxt(entries: DocEntry[]): string {
  const lines: string[] = [];
  lines.push(`# ${settings.siteName}`);
  lines.push("");
  lines.push(`> ${settings.siteDescription}`);
  lines.push("");
  lines.push("## Docs");
  lines.push("");

  for (const entry of entries) {
    lines.push(`- [${entry.title}](${entry.url}): ${entry.description}`);
  }

  lines.push("");
  return lines.join("\n");
}

/** Generate llms-full.txt content */
function generateLlmsFullTxt(entries: DocEntry[]): string {
  const lines: string[] = [];
  lines.push(`# ${settings.siteName}`);
  lines.push("");
  lines.push(`> ${settings.siteDescription}`);

  for (const entry of entries) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(`# ${entry.title}`);
    lines.push("");
    lines.push(`> Source: ${entry.url}`);
    lines.push("");
    lines.push(entry.content);
  }

  lines.push("");
  return lines.join("\n");
}

interface DevResponse {
  setHeader: (k: string, v: string) => void;
  end: (s: string) => void;
  statusCode: number;
}

/** Send generated llms content as a text response */
function sendLlmsResponse(
  res: DevResponse,
  entries: DocEntry[],
  isFull: boolean,
): void {
  const content = isFull
    ? generateLlmsFullTxt(entries)
    : generateLlmsTxt(entries);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(content);
}

/** Serve llms.txt files in dev middleware */
function serveLlmsTxt(url: string | undefined, res: DevResponse): boolean {
  const base = settings.base.replace(/\/$/, "");

  // Match locale-prefixed paths: /{locale}/llms.txt, /{locale}/llms-full.txt
  if (settings.locales) {
    for (const code of Object.keys(settings.locales)) {
      const config = settings.locales[code as keyof typeof settings.locales];
      if (
        url === `${base}/${code}/llms.txt` ||
        url === `${base}/${code}/llms-full.txt`
      ) {
        const entries = buildDocEntries(config.dir, code);
        sendLlmsResponse(res, entries, url.endsWith("llms-full.txt"));
        return true;
      }
    }
  }

  // Match default locale paths: /llms.txt, /llms-full.txt
  if (url === `${base}/llms.txt` || url === `${base}/llms-full.txt`) {
    const entries = buildDocEntries(settings.docsDir, null);
    sendLlmsResponse(res, entries, url.endsWith("llms-full.txt"));
    return true;
  }

  return false;
}

export function llmsTxtIntegration(): AstroIntegration {
  return {
    name: "llms-txt",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const outDir = fileURLToPath(dir);

        // Default locale
        const defaultEntries = buildDocEntries(settings.docsDir, null);
        writeFileSync(join(outDir, "llms.txt"), generateLlmsTxt(defaultEntries));
        writeFileSync(
          join(outDir, "llms-full.txt"),
          generateLlmsFullTxt(defaultEntries),
        );
        logger.info(
          `Generated llms.txt and llms-full.txt (${defaultEntries.length} pages)`,
        );

        // Locale docs
        if (settings.locales) {
          for (const [code, config] of Object.entries(settings.locales)) {
            const localeEntries = buildDocEntries(config.dir, code);
            const localeDir = join(outDir, code);
            mkdirSync(localeDir, { recursive: true });
            writeFileSync(
              join(localeDir, "llms.txt"),
              generateLlmsTxt(localeEntries),
            );
            writeFileSync(
              join(localeDir, "llms-full.txt"),
              generateLlmsFullTxt(localeEntries),
            );
            logger.info(
              `Generated ${code}/llms.txt and ${code}/llms-full.txt (${localeEntries.length} pages)`,
            );
          }
        }
      },

      "astro:config:setup": ({ updateConfig, command }) => {
        if (command !== "dev") return;

        updateConfig({
          vite: {
            plugins: [
              {
                name: "llms-txt-dev",
                configureServer(server) {
                  server.middlewares.use((req, res, next) => {
                    try {
                      const served = serveLlmsTxt(req.url, res);
                      if (!served) {
                        next();
                      }
                    } catch (err) {
                      res.statusCode = 500;
                      res.setHeader("Content-Type", "text/plain");
                      res.end(
                        err instanceof Error
                          ? err.message
                          : "Internal error",
                      );
                    }
                  });
                },
              },
            ],
          },
        });
      },
    },
  };
}
