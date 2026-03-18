import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

export interface GitInfo {
  createdAt: string | null;
  updatedAt: string | null;
  author: string | null;
}

const gitInfoCache = new Map<string, GitInfo>();

/** Resolve file path, trying .mdx/.md extensions if the path has no extension */
function resolveFilePath(filePath: string): string {
  if (existsSync(filePath)) return filePath;
  for (const ext of [".mdx", ".md"]) {
    const withExt = filePath + ext;
    if (existsSync(withExt)) return withExt;
  }
  return filePath;
}

export function getGitInfo(filePath: string): GitInfo {
  if (gitInfoCache.has(filePath)) {
    return gitInfoCache.get(filePath)!;
  }

  const resolved = resolveFilePath(filePath);

  try {
    // Get all commit dates for this file (oldest last)
    const allDates = execFileSync(
      "git",
      ["log", "--follow", "--format=%aI", "--", resolved],
      { encoding: "utf-8" },
    ).trim();

    const dates = allDates ? allDates.split("\n") : [];
    const createdAt = dates.length > 0 ? dates[dates.length - 1] : null;
    const updatedAt = dates.length > 0 ? dates[0] : null;

    const author = execFileSync(
      "git",
      ["log", "-1", "--format=%aN", "--", resolved],
      { encoding: "utf-8" },
    ).trim() || null;

    const result = { createdAt, updatedAt, author };
    gitInfoCache.set(filePath, result);
    return result;
  } catch {
    const result = { createdAt: null, updatedAt: null, author: null };
    gitInfoCache.set(filePath, result);
    return result;
  }
}

/** Format ISO date to human-readable, respecting locale */
export function formatDate(isoDate: string, locale = "en"): string {
  const d = new Date(isoDate);
  const localeMap: Record<string, string> = {
    en: "en-US",
    ja: "ja-JP",
    de: "de-DE",
  };
  return d.toLocaleDateString(localeMap[locale] ?? "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
