import type { Root, Element } from "hast";
import GithubSlugger from "github-slugger";
import { visit } from "unist-util-visit";
import { extractText } from "./hast-utils";

/**
 * Rehype plugin that adds Docusaurus-style anchor links to headings (h2-h6).
 *
 * Generates heading IDs (via github-slugger) and appends:
 *   <a href="#id" class="hash-link" aria-label="Direct link to ..."></a>
 *
 * The "#" symbol is rendered via CSS ::after to avoid polluting
 * Astro's heading text extraction (used for TOC).
 *
 * Runs before Astro's built-in heading ID plugin, so it sets IDs itself.
 * Astro's plugin will skip headings that already have an ID.
 */

const headingTags = new Set(["h2", "h3", "h4", "h5", "h6"]);

export function rehypeHeadingLinks() {
  return (tree: Root) => {
    const slugger = new GithubSlugger();

    visit(tree, "element", (node: Element) => {
      if (!headingTags.has(node.tagName)) return;

      const text = node.children
        .map((c) => extractText(c))
        .join("");

      const id =
        (node.properties?.id as string | undefined) || slugger.slug(text);

      // Set the id if not already present
      if (!node.properties) node.properties = {};
      if (!node.properties.id) node.properties.id = id;

      const link: Element = {
        type: "element",
        tagName: "a",
        properties: {
          href: `#${id}`,
          className: ["hash-link"],
          "aria-label": `Direct link to ${text}`,
        },
        children: [],
      };

      node.children.push(link);
    });
  };
}
