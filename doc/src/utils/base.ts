import { settings } from "@/config/settings";
import { defaultLocale, type Locale } from "@/config/i18n";

/** Normalized base path with no trailing slash (empty string when "/"). */
export const normalizedBase = settings.base.replace(/\/+$/, "");

/**
 * Append a trailing slash to page URLs when `settings.trailingSlash` is true.
 * Skips paths that already end with `/`, contain a file extension, or have a
 * query string / fragment before the slash would be inserted.
 */
export function applyTrailingSlash(url: string): string {
  if (!settings.trailingSlash) return url;
  if (url.endsWith("/")) return url;
  // Split off query string and fragment
  const suffixIdx = url.search(/[?#]/);
  const pathPart = suffixIdx >= 0 ? url.slice(0, suffixIdx) : url;
  const suffix = suffixIdx >= 0 ? url.slice(suffixIdx) : "";
  if (pathPart.endsWith("/")) return url;
  // Check file extension on the last path segment only, requiring the extension
  // to start with a letter to avoid false positives on version-like paths (e.g. /docs/v2.0)
  const lastSegment = pathPart.split("/").pop() ?? "";
  if (/\.[a-zA-Z]\w*$/.test(lastSegment)) return url;
  return pathPart + "/" + suffix;
}

/** Prefix a path with the configured base directory. */
export function withBase(path: string): string {
  const raw =
    normalizedBase === ""
      ? path
      : `${normalizedBase}${path.startsWith("/") ? path : `/${path}`}`;
  return applyTrailingSlash(raw);
}

/** Strip the base prefix from a URL pathname. */
export function stripBase(path: string): string {
  if (normalizedBase === "") return path;
  return path.startsWith(normalizedBase)
    ? path.slice(normalizedBase.length) || "/"
    : path;
}

/** Build a docs URL for the given slug and lang. */
export function docsUrl(slug: string, lang: Locale = defaultLocale): string {
  const path = lang === defaultLocale ? `/docs/${slug}` : `/${lang}/docs/${slug}`;
  return withBase(path);
}

/** Check if a URL is external (starts with http:// or https://). */
export function isExternal(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

/** Resolve a href: external URLs pass through, internal ones get the base prefix. */
export function resolveHref(href: string): string {
  return isExternal(href) ? href : withBase(href);
}

/** Build a versioned docs URL for the given slug, version, and lang. */
export function versionedDocsUrl(slug: string, versionSlug: string, lang: Locale = defaultLocale): string {
  const path = lang === defaultLocale
    ? `/v/${versionSlug}/docs/${slug}`
    : `/v/${versionSlug}/${lang}/docs/${slug}`;
  return withBase(path);
}
