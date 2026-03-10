import type { AstroIntegration } from "astro";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectAllContentFiles, getDocHistory } from "../utils/doc-history";

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

        const files = collectAllContentFiles();
        let totalFiles = 0;

        for (const { filePath, slug } of files) {
          try {
            const history = getDocHistory(filePath, slug);
            const jsonPath = join(historyDir, `${slug}.json`);
            mkdirSync(dirname(jsonPath), { recursive: true });
            writeFileSync(jsonPath, JSON.stringify(history));
            totalFiles++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.warn(`Skipped history for ${slug}: ${msg}`);
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
                    const match = url.match(/^\/doc-history\/(.+)\.json$/);
                    if (!match) {
                      next();
                      return;
                    }

                    try {
                      const requestedSlug = decodeURIComponent(match[1]);
                      const files = collectAllContentFiles();
                      const found = files.find((f) => f.slug === requestedSlug);

                      if (found) {
                        const history = getDocHistory(
                          found.filePath,
                          found.slug,
                        );
                        res.setHeader("Content-Type", "application/json");
                        res.end(JSON.stringify(history));
                        return;
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
