import type { Root, Element } from "hast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

/**
 * Rehype plugin that converts code blocks with language "mermaid" into
 * div containers with class "mermaid" for client-side rendering.
 */
export const rehypeMermaid: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "pre") return;

      const code = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
      );
      if (!code) return;

      const lang = code.properties?.className;
      const isMermaid =
        Array.isArray(lang) && lang.some((c) => String(c).includes("mermaid"));
      if (!isMermaid) return;

      // Replace <pre><code> with <div class="mermaid">
      node.tagName = "div";
      node.properties = { class: "mermaid" };
      // Unwrap code element — keep its text children directly
      node.children = code.children;
    });
  };
};
