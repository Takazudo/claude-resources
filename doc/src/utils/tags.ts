import type { DocsEntry } from "@/types/docs-entry";

export interface TagInfo {
  tag: string;
  count: number;
  docs: { slug: string; title: string; description?: string }[];
}

export function collectTags(
  entries: DocsEntry[],
  slugFn: (id: string, data: { slug?: string }) => string,
): Map<string, TagInfo> {
  const tagMap = new Map<string, TagInfo>();

  for (const entry of entries) {
    const tags = entry.data.tags ?? [];
    const slug = slugFn(entry.id, entry.data);

    for (const tag of tags) {
      if (!tagMap.has(tag)) {
        tagMap.set(tag, { tag, count: 0, docs: [] });
      }
      const info = tagMap.get(tag)!;
      info.count++;
      info.docs.push({
        slug,
        title: entry.data.title,
        description: entry.data.description,
      });
    }
  }

  return tagMap;
}
