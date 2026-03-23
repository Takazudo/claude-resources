import type { Root } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

const ADMONITION_TYPES = ["note", "tip", "info", "warning", "danger"];

/**
 * Remark plugin that transforms container directives (:::note, :::tip, etc.)
 * into Astro admonition components via MDX.
 *
 * Requires remark-directive to be loaded before this plugin.
 */
export const remarkAdmonitions: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, (node: any) => {
      if (node.type !== "containerDirective") return;
      if (!ADMONITION_TYPES.includes(node.name)) return;

      const data = node.data || (node.data = {});
      const title = node.attributes?.title;

      data.hName = "div";
      data.hProperties = {
        "data-admonition": node.name,
        ...(title ? { "data-admonition-title": title } : {}),
      };
    });
  };
};
