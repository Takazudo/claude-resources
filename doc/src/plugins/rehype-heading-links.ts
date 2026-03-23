import type { Root, Element } from "hast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

/**
 * Rehype plugin that wraps heading content in an anchor link using the
 * heading's id attribute, enabling clickable heading permalinks.
 */
export const rehypeHeadingLinks: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, "element", (node: Element) => {
      if (!HEADING_TAGS.has(node.tagName)) return;

      const id = node.properties?.id as string | undefined;
      if (!id) return;

      const link: Element = {
        type: "element",
        tagName: "a",
        properties: {
          href: `#${id}`,
          class: "heading-link",
        },
        children: [...node.children],
      };

      node.children = [link];
    });
  };
};
