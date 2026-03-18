import type { RenderedContent } from "astro:content";

/**
 * Concrete entry type for docs collections.
 *
 * Astro generates collection-specific types (CollectionEntry<"docs">,
 * CollectionEntry<"docs-ja">, etc.) that are incompatible with dynamic
 * collection names like `docs-${code}`. This interface captures the
 * shared shape so utility functions can accept entries from any docs
 * collection without fighting the generic constraint.
 */
export interface DocsEntry {
  id: string;
  body?: string;
  collection: string;
  data: {
    title: string;
    description?: string;
    category?: string;
    sidebar_position?: number;
    sidebar_label?: string;
    tags?: string[];
    search_exclude?: boolean;
    pagination_next?: string | null;
    pagination_prev?: string | null;
    draft?: boolean;
    unlisted?: boolean;
    hide_sidebar?: boolean;
    hide_toc?: boolean;
    standalone?: boolean;
    slug?: string;
  };
  rendered?: RenderedContent;
  filePath?: string;
}
