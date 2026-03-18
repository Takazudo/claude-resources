import type { AstroIntegration } from "astro";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { settings } from "../config/settings";
import { collectContentFiles, getDocHistory } from "../utils/doc-history";

/** Build list of [localeKey | null, absoluteDir] pairs from settings */
function getContentDirEntries(): Array<[string | null, string]> {
  const entries: Array<[string | null, string]> = [
    [null, resolve(settings.docsDir)],
  ];
  if (settings.locales) {
    for (const [key, locale] of Object.entries(settings.locales)) {
      entries.push([key, resolve(locale.dir)]);
    }
  }
  return entries;
}

export function docHistoryIntegration(): AstroIntegration {
  return {
    name: "doc-history",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        if (process.env.SKIP_DOC_HISTORY === "1") {
          logger.info("Skipping doc history generation (SKIP_DOC_HISTORY=1)");
          return;
        }

        const outDir = fileURLToPath(dir);
        const historyDir = join(outDir, "doc-history");
        mkdirSync(historyDir, { recursive: true });

        const dirEntries = getContentDirEntries();
        let totalFiles = 0;

        for (const [localeKey, contentDir] of dirEntries) {
          const files = collectContentFiles(contentDir);
          for (const { filePath, slug } of files) {
            try {
              const history = getDocHistory(filePath, slug);
              const prefixedSlug = localeKey ? `${localeKey}/${slug}` : slug;
              const jsonPath = join(historyDir, `${prefixedSlug}.json`);
              mkdirSync(dirname(jsonPath), { recursive: true });
              writeFileSync(jsonPath, JSON.stringify(history));
              totalFiles++;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              logger.warn(`Skipped history for ${slug}: ${msg}`);
            }
          }
        }

        logger.info(
          `Generated doc history for ${totalFiles} files in doc-history/`,
        );
      },

      "astro:config:setup": ({ updateConfig, command }) => {
        if (command !== "dev") return;

        updateConfig({
          vite: {
            plugins: [
              {
                name: "doc-history-dev",
                configureServer(server) {
                  server.middlewares.use((req, res, next) => {
                    const url = req.url ?? "";
                    const basePrefix = settings.base.replace(/\/+$/, "");
                    const stripped = basePrefix && url.startsWith(basePrefix) ? url.slice(basePrefix.length) : url;
                    const match = stripped.match(/^\/doc-history\/(.+)\.json$/);
                    if (!match) {
                      next();
                      return;
                    }

                    try {
                      const requestedSlug = decodeURIComponent(match[1]);

                      // Parse locale prefix from requested slug
                      // Check locale-prefixed entries first, then default (empty prefix)
                      const dirEntries = getContentDirEntries();
                      const sorted = [...dirEntries].sort(
                        ([a], [b]) => (a ? 0 : 1) - (b ? 0 : 1),
                      );
                      const hasLocalePrefix = sorted.some(
                        ([k]) => k && requestedSlug.startsWith(`${k}/`),
                      );
                      for (const [localeKey, contentDir] of sorted) {
                        const prefix = localeKey ? `${localeKey}/` : "";
                        if (
                          (prefix && requestedSlug.startsWith(prefix)) ||
                          (!prefix && !hasLocalePrefix)
                        ) {
                          const slug = prefix
                            ? requestedSlug.slice(prefix.length)
                            : requestedSlug;
                          const files = collectContentFiles(contentDir);
                          const found = files.find(
                            (f) => f.slug === slug,
                          );
                          if (found) {
                            const history = getDocHistory(
                              found.filePath,
                              found.slug,
                            );
                            res.setHeader("Content-Type", "application/json");
                            res.end(JSON.stringify(history));
                            return;
                          }
                        }
                      }

                      res.statusCode = 404;
                      res.setHeader("Content-Type", "application/json");
                      res.end(
                        JSON.stringify({
                          error: `No doc found for slug: ${requestedSlug}`,
                        }),
                      );
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
