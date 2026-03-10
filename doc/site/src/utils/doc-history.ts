import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import type { DocHistoryEntry, DocHistoryData } from "@/types/doc-history";

const claudeHome = path.join(homedir(), ".claude");

/** Shared options to suppress git stderr noise */
function gitOpts(cwd?: string) {
  return {
    encoding: "utf-8" as const,
    stdio: ["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"],
    ...(cwd ? { cwd } : {}),
  };
}

/** Cache the repo root to avoid repeated git calls */
let repoRootCache: string | null = null;

function getRepoRoot(): string {
  if (repoRootCache) return repoRootCache;
  repoRootCache = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf-8",
    cwd: claudeHome,
  }).trim();
  return repoRootCache;
}

/** Convert an absolute path to a repo-relative path for git commands */
function toRepoRelative(absolutePath: string): string {
  return path.relative(getRepoRoot(), absolutePath);
}

/**
 * Get the list of commit hashes that touched a file, newest first.
 * Uses --follow to track renames.
 * Limits to maxEntries commits (default 50).
 */
export function getFileCommits(
  filePath: string,
  maxEntries = 50,
): string[] {
  try {
    const output = execFileSync(
      "git",
      [
        "log",
        "--follow",
        "--format=%H",
        "-n",
        String(maxEntries),
        "--",
        filePath,
      ],
      gitOpts(getRepoRoot()),
    ).trim();
    return output ? [...new Set(output.split("\n"))] : [];
  } catch {
    return [];
  }
}

/**
 * Get metadata for a specific commit on a file.
 * Returns { hash, date, author, message } with full hash for unique identification.
 */
export function getCommitInfo(
  hash: string,
  filePath: string,
): Omit<DocHistoryEntry, "content"> {
  try {
    const output = execFileSync(
      "git",
      ["log", "-1", "--format=%H%n%aI%n%aN%n%s", hash, "--", filePath],
      gitOpts(getRepoRoot()),
    ).trim();
    const lines = output.split("\n");
    return {
      hash: lines[0] ?? hash,
      date: lines[1] ?? "",
      author: lines[2] ?? "",
      message: lines[3] ?? "",
    };
  } catch {
    return { hash, date: "", author: "", message: "" };
  }
}

/**
 * Get the file content at a specific commit.
 * Accepts absolute paths and converts to repo-relative for git show.
 * Handles renamed files by falling back to the old path via git log --follow.
 */
export function getFileAtCommit(hash: string, filePath: string): string {
  const relPath = path.isAbsolute(filePath)
    ? toRepoRelative(filePath)
    : filePath;

  try {
    return execFileSync("git", ["show", `${hash}:${relPath}`], gitOpts(getRepoRoot()));
  } catch {
    // File may have been renamed — find the old path at this commit
    try {
      const oldPath = execFileSync(
        "git",
        [
          "log",
          "-1",
          "--follow",
          "--diff-filter=R",
          "--format=",
          "--name-only",
          hash,
          "--",
          relPath,
        ],
        gitOpts(getRepoRoot()),
      ).trim();
      if (oldPath) {
        return execFileSync("git", ["show", `${hash}:${oldPath}`], gitOpts(getRepoRoot()));
      }
    } catch {
      // ignore
    }

    // Last resort: use git log --follow to find the path at this revision
    try {
      const followOutput = execFileSync(
        "git",
        [
          "log",
          "--follow",
          "--format=%H",
          "--name-only",
          "--diff-filter=AMRC",
          "--",
          relPath,
        ],
        gitOpts(getRepoRoot()),
      ).trim();
      const lines = followOutput.split("\n").filter(Boolean);
      // Lines alternate: hash, filename, hash, filename...
      for (let i = 0; i < lines.length - 1; i += 2) {
        if (lines[i] === hash && lines[i + 1]) {
          return execFileSync(
            "git",
            ["show", `${hash}:${lines[i + 1]}`],
            gitOpts(getRepoRoot()),
          );
        }
      }
    } catch {
      // ignore
    }

    return "";
  }
}

/**
 * Get the complete history for a document file.
 * Returns DocHistoryData with all entries populated.
 */
export function getDocHistory(
  filePath: string,
  slug: string,
  maxEntries = 50,
): DocHistoryData {
  const commits = getFileCommits(filePath, maxEntries);
  const entries: DocHistoryEntry[] = commits.map((hash) => {
    const info = getCommitInfo(hash, filePath);
    const content = getFileAtCommit(hash, filePath);
    return { ...info, content };
  });
  return { slug, filePath, entries };
}

/** Content file descriptor for history generation */
interface ContentFile {
  /** Absolute path to the content file */
  filePath: string;
  /** Route-based slug (e.g. "commands/commit", "skills/lazy-dev") */
  slug: string;
}

/**
 * Collect all content files from ccdoc's 4 collections.
 * Returns array of { filePath, slug } pairs.
 */
export function collectAllContentFiles(): ContentFile[] {
  const results: ContentFile[] = [];

  // Commands: ~/.claude/commands/*.md
  const commandsDir = path.join(claudeHome, "commands");
  if (fs.existsSync(commandsDir)) {
    for (const file of fs.readdirSync(commandsDir)) {
      if (/\.md$/.test(file)) {
        const id = file.replace(/\.md$/, "");
        results.push({
          filePath: path.join(commandsDir, file),
          slug: `commands/${id}`,
        });
      }
    }
  }

  // Agents: ~/.claude/agents/*.md
  const agentsDir = path.join(claudeHome, "agents");
  if (fs.existsSync(agentsDir)) {
    for (const file of fs.readdirSync(agentsDir)) {
      if (/\.md$/.test(file)) {
        const id = file.replace(/\.md$/, "");
        results.push({
          filePath: path.join(agentsDir, file),
          slug: `agents/${id}`,
        });
      }
    }
  }

  // Skills: ~/.claude/skills/*/SKILL.md
  const skillsDir = path.join(claudeHome, "skills");
  if (fs.existsSync(skillsDir)) {
    for (const dir of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const skillPath = path.join(skillsDir, dir.name, "SKILL.md");
      if (fs.existsSync(skillPath)) {
        results.push({
          filePath: skillPath,
          slug: `skills/${dir.name}`,
        });
      }
    }
  }

  // CLAUDE.md files: ~/.claude/**/CLAUDE.md
  const excludePatterns = [
    "node_modules",
    ".git",
    "worktrees",
    "build",
    "dist",
    ".astro",
  ];

  function walkForClaudeMd(dir: string): void {
    if (!fs.existsSync(dir)) return;
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (excludePatterns.some((p) => item.name === p)) continue;
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          walkForClaudeMd(fullPath);
        } else if (item.name === "CLAUDE.md") {
          const relPath = fullPath.replace(claudeHome + "/", "");
          const dirPart = relPath.replace("/CLAUDE.md", "");
          const id =
            dirPart === "CLAUDE.md"
              ? "root"
              : dirPart.replace(/\//g, "--");
          results.push({
            filePath: fullPath,
            slug: `claudemd/${id}`,
          });
        }
      }
    } catch {
      // Permission errors etc.
    }
  }

  walkForClaudeMd(claudeHome);

  return results;
}
