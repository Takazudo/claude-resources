import type { AstroIntegration } from "astro";
import {
  readFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import matter from "gray-matter";

const claudeHome = join(homedir(), ".claude");

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

/** Strip markdown formatting to produce plain text for indexing */
function stripMarkdown(md: string): string {
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

/** Truncate text to max length for the search index */
function truncateBody(text: string): string {
  return text.length > MAX_BODY_LENGTH
    ? text.substring(0, MAX_BODY_LENGTH)
    : text;
}

const excludePatterns = [
  "node_modules",
  ".git",
  "worktrees",
  "build",
  "dist",
  ".astro",
];

function findClaudeMdFiles(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  try {
    const items = readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (excludePatterns.some((p) => item.name === p)) continue;
      const fullPath = join(dir, item.name);
      if (item.isDirectory()) {
        results.push(...findClaudeMdFiles(fullPath));
      } else if (item.name === "CLAUDE.md") {
        results.push(fullPath);
      }
    }
  } catch {
    // Permission errors etc.
  }
  return results;
}

/** Collect all search index entries from ~/.claude/ content */
export function collectSearchEntries(): SearchIndexEntry[] {
  const entries: SearchIndexEntry[] = [];

  // Commands: ~/.claude/commands/*.md
  const commandsDir = join(claudeHome, "commands");
  if (existsSync(commandsDir)) {
    const files = readdirSync(commandsDir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      try {
        const raw = readFileSync(join(commandsDir, file), "utf-8");
        const { data, content } = matter(raw);
        const id = file.replace(/\.md$/, "");
        entries.push({
          id: `commands/${id}`,
          title: `/${data.name || id}`,
          body: truncateBody(stripMarkdown(content)),
          url: `/commands/${id}`,
          description: data.description ?? "",
        });
      } catch {
        // Skip unparseable files
      }
    }
  }

  // Agents: ~/.claude/agents/*.md
  const agentsDir = join(claudeHome, "agents");
  if (existsSync(agentsDir)) {
    const files = readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      try {
        const raw = readFileSync(join(agentsDir, file), "utf-8");
        const { data, content } = matter(raw);
        const id = file.replace(/\.md$/, "");
        entries.push({
          id: `agents/${id}`,
          title: data.name || id,
          body: truncateBody(stripMarkdown(content)),
          url: `/agents/${id}`,
          description: data.description ?? "",
        });
      } catch {
        // Skip unparseable files
      }
    }
  }

  // Skills: ~/.claude/skills/*/SKILL.md
  const skillsDir = join(claudeHome, "skills");
  if (existsSync(skillsDir)) {
    const dirs = readdirSync(skillsDir, { withFileTypes: true }).filter((d) =>
      d.isDirectory(),
    );
    for (const dir of dirs) {
      const skillPath = join(skillsDir, dir.name, "SKILL.md");
      if (!existsSync(skillPath)) continue;
      try {
        const raw = readFileSync(skillPath, "utf-8");
        const { data, content } = matter(raw);
        entries.push({
          id: `skills/${dir.name}`,
          title: data.name || dir.name,
          body: truncateBody(stripMarkdown(content)),
          url: `/skills/${dir.name}`,
          description: data.description ?? "",
        });
      } catch {
        // Skip unparseable files
      }
    }
  }

  // CLAUDE.md files
  const claudeMdFiles = findClaudeMdFiles(claudeHome);
  for (const filePath of claudeMdFiles) {
    try {
      const relPath = filePath.replace(claudeHome + "/", "");
      const dirPart = relPath.replace("/CLAUDE.md", "");
      const id =
        relPath === "CLAUDE.md" ? "root" : dirPart.replace(/\//g, "--");
      const content = readFileSync(filePath, "utf-8");
      entries.push({
        id: `claudemd/${id}`,
        title: `/${relPath}`,
        body: stripMarkdown(content),
        url: `/claudemd/${id}`,
        description: "",
      });
    } catch {
      // Skip unreadable files
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
