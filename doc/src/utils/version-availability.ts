import { settings } from "@/config/settings";
import type { CollectionKey } from "astro:content";
import { getDocsCollection } from "@/utils/get-docs-collection";
import { toRouteSlug } from "@/utils/slug";

/** version slug → Set of available doc slugs */
export type VersionAvailability = Record<string, Set<string>>;

let cached: VersionAvailability | null = null;

/**
 * Scan each version's content directory and return a map of
 * version slug → Set of available doc slugs.
 * Results are cached for the build lifecycle.
 *
 * Scans both default-locale and per-locale collections so that
 * availability is correct regardless of which locale the page is in.
 */
export async function getVersionAvailability(): Promise<VersionAvailability> {
  if (cached) return cached;

  const result: VersionAvailability = {};

  if (!settings.versions) {
    cached = result;
    return result;
  }

  await Promise.all(
    settings.versions.map(async (version) => {
      const slugs = new Set<string>();

      // Scan all collections for this version in parallel
      const collectionNames: string[] = [`docs-v-${version.slug}`];
      if (version.locales) {
        for (const code of Object.keys(version.locales)) {
          collectionNames.push(`docs-v-${version.slug}-${code}`);
        }
      }

      const results = await Promise.all(
        collectionNames.map(async (name) => {
          try {
            return await getDocsCollection(name as CollectionKey);
          } catch {
            return [];
          }
        }),
      );

      for (const docs of results) {
        for (const doc of docs) {
          slugs.add(doc.data.slug ?? toRouteSlug(doc.id));
        }
      }

      result[version.slug] = slugs;
    }),
  );

  cached = result;
  return result;
}
