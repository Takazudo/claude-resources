import type { DocsEntry } from "@/types/docs-entry";
import type { CategoryMeta } from "@/utils/docs";
import { loadCategoryMeta } from "@/utils/docs";
import { getDocsCollection } from "@/utils/get-docs-collection";
import { defaultLocale, getCollectionName, getContentDir, type Locale } from "@/config/i18n";
import { toRouteSlug } from "@/utils/slug";
import { settings } from "@/config/settings";

export interface LocaleDocsResult {
  /** All docs: locale-first, then base fallbacks (includes unlisted — filter as needed). */
  allDocs: DocsEntry[];
  /** Slugs that come from the base (EN) collection, not the locale. */
  fallbackSlugs: Set<string>;
  /** Merged category metadata: base first, locale overrides. */
  categoryMeta: Map<string, CategoryMeta>;
}

/** Filter drafts in production builds. */
const filterDrafts = (docs: DocsEntry[]) =>
  import.meta.env.PROD ? docs.filter((doc) => !doc.data.draft) : docs;

// Module-level cache keyed by locale — result is stable within a single build.
const cache = new Map<string, Promise<LocaleDocsResult>>();

/**
 * Load and merge docs for a given locale.
 * Results are memoized by locale for the duration of the build.
 *
 * For the default locale (EN), returns the base collection directly.
 * For other locales, merges locale docs with base (EN) fallbacks:
 *   - Locale docs take priority (matched by slug)
 *   - Base docs fill in for missing translations
 *   - Category metadata is merged (locale overrides base)
 *   - Draft filtering applied in production
 */
export function loadLocaleDocs(lang: Locale): Promise<LocaleDocsResult> {
  const cached = cache.get(lang);
  if (cached) return cached;
  const promise = loadLocaleDocsImpl(lang);
  cache.set(lang, promise);
  return promise;
}

async function loadLocaleDocsImpl(lang: Locale): Promise<LocaleDocsResult> {
  if (lang === defaultLocale) {
    const docs = filterDrafts(await getDocsCollection("docs"));
    const categoryMeta = loadCategoryMeta(settings.docsDir);
    return { allDocs: docs, fallbackSlugs: new Set<string>(), categoryMeta };
  }

  const localeDocs = filterDrafts(await getDocsCollection(getCollectionName(lang)));
  const baseDocs = filterDrafts(await getDocsCollection("docs"));

  const localeSlugSet = new Set<string>(
    localeDocs.map((d) => d.data.slug ?? toRouteSlug(d.id)),
  );

  const fallbackDocs = baseDocs.filter(
    (d) => !localeSlugSet.has(d.data.slug ?? toRouteSlug(d.id)),
  );

  const allDocs = [...localeDocs, ...fallbackDocs];

  const fallbackSlugs = new Set<string>(
    fallbackDocs.map((d) => d.data.slug ?? toRouteSlug(d.id)),
  );

  const baseCategoryMeta = loadCategoryMeta(settings.docsDir);
  const localeCategoryMeta = loadCategoryMeta(getContentDir(lang));
  const categoryMeta = new Map([...baseCategoryMeta, ...localeCategoryMeta]);

  return { allDocs, fallbackSlugs, categoryMeta };
}
