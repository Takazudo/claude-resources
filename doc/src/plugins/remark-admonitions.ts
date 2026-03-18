import type { Root, Node as MdastNode } from "mdast";
import { visit, SKIP } from "unist-util-visit";

/**
 * Remark plugin that transforms container directives (`:::note`, `:::info`,
 * etc., parsed by remark-directive) into JSX component nodes (`<Note>`,
 * `<Info>`, etc.) that Astro MDX resolves via the `components` prop.
 *
 * Requires remark-directive to run before this plugin.
 *
 * Usage in MDX:
 *   :::note[Custom Title]
 *   Content here.
 *   :::
 *
 *   :::note
 *   Content without custom title.
 *   :::
 */

/** A container directive node produced by remark-directive */
interface ContainerDirective extends MdastNode {
  type: "containerDirective";
  name: string;
  children: DirectiveChild[];
  data?: Record<string, unknown>;
  attributes?: MdxJsxAttribute[];
}

interface DirectiveChild {
  type: string;
  value?: string;
  children?: DirectiveChild[];
  data?: { directiveLabel?: boolean; [key: string]: unknown };
}

interface MdxJsxAttribute {
  type: "mdxJsxAttribute";
  name: string;
  value: string;
}

const ADMONITION_TYPES = new Set(["note", "tip", "info", "warning", "danger"]);

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Recursively extract plain text from an mdast node tree. */
function extractText(node: DirectiveChild): string {
  if (typeof node.value === "string") return node.value;
  if (Array.isArray(node.children)) {
    return node.children.map(extractText).join("");
  }
  return "";
}

export function remarkAdmonitions() {
  return (tree: Root) => {
    visit(tree, (node: MdastNode) => {
      if (
        node.type === "containerDirective" &&
        "name" in node &&
        ADMONITION_TYPES.has((node as ContainerDirective).name)
      ) {
        const directive = node as ContainerDirective;
        const componentName = capitalize(directive.name);

        // Extract title from the directive label
        const label = directive.children?.[0];
        const isLabel = label?.data?.directiveLabel === true;
        const title = isLabel ? extractText(label) : "";

        // Build JSX attributes
        const attributes: MdxJsxAttribute[] = [];
        if (title) {
          attributes.push({
            type: "mdxJsxAttribute",
            name: "title",
            value: title,
          });
        }

        // Replace the node in-place with an mdxJsxFlowElement
        (directive as unknown as Record<string, unknown>).type = "mdxJsxFlowElement";
        (directive as unknown as Record<string, unknown>).name = componentName;
        directive.attributes = attributes;
        delete directive.data;

        // Remove the label paragraph from children if consumed as title
        if (isLabel) {
          directive.children = directive.children.slice(1);
        }

        return SKIP;
      }
    });
  };
}
