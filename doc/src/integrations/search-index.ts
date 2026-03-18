import type { AstroIntegration } from "astro";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { settings } from "../config/settings";
import { stripMarkdown, collectMdFiles, slugToUrl, parseMarkdownFile, isExcluded } from "../utils/content-files";

/** Maximum body text stored per entry (for display excerpts) */
const MAX_BODY_LENGTH = 300;

/** A single document entry in the search index */
export interface SearchIndexEntry {
  id: string;
  title: string;
  body: string;
  url: string;
  description: string;
}

/** Truncate text to max length for the search index */
function truncateBody(text: string): string {
  return text.length > MAX_BODY_LENGTH
    ? text.substring(0, MAX_BODY_LENGTH)
    : text;
}

/** Build search index entries for a content directory */
function buildEntries(
  contentDir: string,
  locale: string | null,
): SearchIndexEntry[] {
  const absDir = resolve(contentDir);
  const files = collectMdFiles(absDir);
  const entries: SearchIndexEntry[] = [];

  for (const { filePath, slug } of files) {
    const parsed = parseMarkdownFile(filePath);
    if (!parsed) continue;
    const { data, content } = parsed;

    // Skip excluded/draft/unlisted pages
    if (isExcluded(data)) continue;

    const id = locale ? `${locale}/${slug}` : slug;
    entries.push({
      id,
      title: data.title ?? slug,
      body: truncateBody(stripMarkdown(content)),
      url: slugToUrl(slug, locale),
      description: data.description ?? "",
    });
  }

  return entries;
}

/** Collect all search index entries from all configured content directories */
export function collectSearchEntries(): SearchIndexEntry[] {
  const entries: SearchIndexEntry[] = [];

  // Default locale docs
  entries.push(...buildEntries(settings.docsDir, null));

  // Locale docs
  if (settings.locales) {
    for (const [code, config] of Object.entries(settings.locales)) {
      entries.push(...buildEntries(config.dir, code));
    }
  }

  return entries;
}

export function searchIndexIntegration(): AstroIntegration {
  return {
    name: "search-index",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const outDir = fileURLToPath(dir);
        const entries = collectSearchEntries();
        const jsonPath = join(outDir, "search-index.json");
        mkdirSync(outDir, { recursive: true });
        writeFileSync(jsonPath, JSON.stringify(entries));
        logger.info(
          `Generated search index with ${entries.length} entries`,
        );
      },

      "astro:config:setup": ({ updateConfig, command }) => {
        if (command !== "dev") return;

        updateConfig({
          vite: {
            plugins: [
              {
                name: "search-index-dev",
                configureServer(server) {
                  server.middlewares.use((req, res, next) => {
                    const match =
                      req.url === "/search-index.json" ||
                      req.url?.endsWith("/search-index.json");
                    if (!match) {
                      next();
                      return;
                    }

                    try {
                      const entries = collectSearchEntries();
                      res.setHeader("Content-Type", "application/json");
                      res.end(JSON.stringify(entries));
                    } catch (err) {
                      res.statusCode = 500;
                      res.setHeader("Content-Type", "application/json");
                      res.end(
                        JSON.stringify({
                          error:
                            err instanceof Error
                              ? err.message
                              : "Internal error",
                        }),
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
