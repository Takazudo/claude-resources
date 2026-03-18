import type { AstroIntegration } from "astro";
import { writeFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { settings } from "../config/settings";

function collectHtmlFiles(dir: string, rootDir: string): string[] {
  const urls: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      urls.push(...collectHtmlFiles(fullPath, rootDir));
    } else if (entry.name.endsWith(".html") && entry.name !== "404.html") {
      const rel = relative(rootDir, fullPath);
      let urlPath: string;

      if (rel.endsWith("/index.html")) {
        // dist/docs/getting-started/index.html → /docs/getting-started/
        urlPath = "/" + rel.replace(/\/index\.html$/, "/");
      } else if (rel === "index.html") {
        urlPath = "/";
      } else {
        // dist/docs/foo.html → /docs/foo
        urlPath = "/" + rel.replace(/\.html$/, "");
      }

      // Prepend base path
      const base = settings.base.replace(/\/$/, "");
      if (base && base !== "/") {
        urlPath = base + urlPath;
      }

      urls.push(urlPath);
    }
  }

  return urls;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function generateSitemap(urls: string[], siteUrl: string): string {
  const today = new Date().toISOString().split("T")[0];
  const base = siteUrl.replace(/\/$/, "");
  const urlEntries = urls
    .sort()
    .map(
      (url) => `  <url>
    <loc>${escapeXml(base + url)}</loc>
    <lastmod>${today}</lastmod>
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>
`;
}

export function sitemapIntegration(): AstroIntegration {
  return {
    name: "sitemap",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const outDir = fileURLToPath(dir);
        const urls = collectHtmlFiles(outDir, outDir);
        const siteUrl = settings.siteUrl || "";
        if (!siteUrl) {
          logger.info("settings.siteUrl is empty — sitemap will use relative URLs.");
        }
        const sitemapContent = generateSitemap(urls, siteUrl);
        writeFileSync(join(outDir, "sitemap.xml"), sitemapContent);
        logger.info(`Sitemap generated with ${urls.length} URLs`);
      },
    },
  };
}
