import type { Root, Element } from "hast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

/**
 * Rehype plugin that extracts title from code block meta and adds a
 * title element before the code block.
 *
 * Usage in markdown:
 * ```js title="example.js"
 * console.log("hello");
 * ```
 */
export const rehypeCodeTitle: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "pre" || !parent || index == null) return;

      const code = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
      );
      if (!code) return;

      const meta = (code.properties?.["data-meta"] as string) ?? "";
      const titleMatch = meta.match(/title="([^"]+)"/);
      if (!titleMatch) return;

      const title = titleMatch[1];
      const titleNode: Element = {
        type: "element",
        tagName: "div",
        properties: { "data-code-title": title },
        children: [{ type: "text", value: title }],
      };

      parent.children.splice(index, 0, titleNode);
    });
  };
};
