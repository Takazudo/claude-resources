import { getCollection, type CollectionKey } from "astro:content";
import type { DocsEntry } from "@/types/docs-entry";

/**
 * Typed wrapper around getCollection() for docs collections.
 *
 * Astro's generated types don't support dynamic collection names like
 * `docs-${locale}`, so a double cast is needed. This wrapper confines
 * the unsafe boundary to a single location.
 */
export async function getDocsCollection(name: CollectionKey | string): Promise<DocsEntry[]> {
  return await getCollection(name as CollectionKey) as unknown as DocsEntry[];
}
