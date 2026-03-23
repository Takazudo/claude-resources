import type { Root, Element } from "hast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

/**
 * Rehype plugin that strips .md and .mdx extensions from internal links.
 * Converts `./guide.md` → `./guide` and `../reference.mdx` → `../reference`.
 */
export const rehypeStripMdExtension: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "a") return;

      const href = node.properties?.href;
      if (typeof href !== "string") return;

      // Only process relative links (not http://, https://, #, etc.)
      if (/^[a-z]+:/i.test(href) || href.startsWith("#")) return;

      // Strip .md or .mdx extension
      if (href.endsWith(".md") || href.endsWith(".mdx")) {
        node.properties!.href = href.replace(/\.mdx?$/, "");
      }
    });
  };
};
