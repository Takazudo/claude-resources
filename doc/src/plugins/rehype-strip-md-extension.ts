import type { Root, Element } from 'hast';
import { visit } from 'unist-util-visit';

/**
 * Rehype plugin that strips .md and .mdx extensions from relative link hrefs.
 *
 * Markdown authors often write links like `[Other doc](./other-doc.md)`.
 * In Astro's static output, the correct URL is `/docs/other-doc/` (no extension).
 * This plugin removes the extension at build time so links work correctly.
 */
export function rehypeStripMdExtension() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'a') return;
      const href = node.properties?.href;
      if (typeof href !== 'string') return;

      // Only process relative links (not http://, https://, mailto:, #, etc.)
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')) return;

      // Strip .md or .mdx extension (with optional hash fragment)
      const replaced = href.replace(
        /\.mdx?(#.*)?$/,
        (_match, hash) => hash ?? '',
      );
      if (replaced !== href) {
        node.properties.href = replaced;
      }
    });
  };
}
