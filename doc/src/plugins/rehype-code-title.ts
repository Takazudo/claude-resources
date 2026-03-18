import type { Root, Element } from "hast";
import { visit, SKIP } from "unist-util-visit";

/**
 * Rehype plugin that extracts title="..." from code block meta strings
 * and wraps the <pre> in a container with a title header.
 *
 * Usage in MDX:
 *   ```js title="config.js"
 *   const x = 1;
 *   ```
 */
export function rehypeCodeTitle() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "pre" || !parent || index === undefined) return;

      const codeEl = node.children.find(
        (child): child is Element =>
          child.type === "element" && child.tagName === "code",
      );
      if (!codeEl) return;

      const meta =
        String(codeEl.properties?.meta ?? "") ||
        String((codeEl.data as Record<string, unknown> | undefined)?.meta ?? "");
      const titleMatch = meta.match(/title="([^"]+)"/);
      if (!titleMatch) return;

      const title = titleMatch[1];

      const titleEl: Element = {
        type: "element",
        tagName: "div",
        properties: { className: ["code-block-title"] },
        children: [{ type: "text", value: title }],
      };

      const wrapper: Element = {
        type: "element",
        tagName: "div",
        properties: { className: ["code-block-container"] },
        children: [titleEl, { ...node }],
      };

      (parent as Element).children[index] = wrapper;
      return SKIP;
    });
  };
}
