import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import type { Loader } from "astro/loaders";

import { homedir } from "node:os";

const claudeHome = join(homedir(), ".claude");

// Commands: ~/.claude/commands/*.md
const claudeCommands = defineCollection({
  loader: glob({ pattern: "*.md", base: `${claudeHome}/commands` }),
  schema: z
    .object({
      name: z.string().optional(),
      description: z.string().optional(),
    })
    .passthrough(),
});

// Agents: ~/.claude/agents/*.md
const claudeAgents = defineCollection({
  loader: glob({ pattern: "*.md", base: `${claudeHome}/agents` }),
  schema: z
    .object({
      name: z.string().optional(),
      description: z.string().optional(),
      model: z.string().optional(),
      color: z.string().optional(),
    })
    .passthrough(),
});

// Skills: custom loader to handle YAML errors gracefully
function claudeSkillsLoader(): Loader {
  const skillsDir = `${claudeHome}/skills`;
  return {
    name: "claude-skills-loader",
    load: async ({ store, logger }) => {
      store.clear();
      if (!existsSync(skillsDir)) return;
      const dirs = readdirSync(skillsDir, { withFileTypes: true }).filter(
        (d) => d.isDirectory(),
      );
      for (const dir of dirs) {
        const skillPath = join(skillsDir, dir.name, "SKILL.md");
        if (!existsSync(skillPath)) continue;
        try {
          const raw = readFileSync(skillPath, "utf8");
          const { data, content } = matter(raw);
          store.set({
            id: dir.name,
            data: {
              name: data.name || dir.name,
              description: data.description || "",
            },
            body: content,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          logger.warn(`Skipping skill ${dir.name}: ${message}`);
        }
      }
    },
  };
}

const claudeSkills = defineCollection({
  loader: claudeSkillsLoader(),
  schema: z
    .object({
      name: z.string().optional(),
      description: z.string().optional(),
    })
    .passthrough(),
});

// CLAUDE.md files: custom loader (no frontmatter)
function claudeMdLoader(): Loader {
  const baseDir = claudeHome;
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

  return {
    name: "claude-md-loader",
    load: async ({ store }) => {
      store.clear();
      const files = findClaudeMdFiles(baseDir);
      for (const filePath of files) {
        const relPath = filePath.replace(baseDir + "/", "");
        const dirPart = relPath.replace("/CLAUDE.md", "");
        const id = dirPart === "CLAUDE.md" ? "root" : dirPart.replace(/\//g, "--");
        const displayPath = `/${relPath}`;
        const content = readFileSync(filePath, "utf8");
        store.set({
          id,
          data: {
            title: displayPath,
            relPath,
            displayPath,
          },
          body: content,
        });
      }
    },
  };
}

const claudeMd = defineCollection({
  loader: claudeMdLoader(),
  schema: z.object({
    title: z.string(),
    relPath: z.string(),
    displayPath: z.string(),
  }),
});

export const collections = {
  claudeCommands,
  claudeAgents,
  claudeSkills,
  claudeMd,
};
