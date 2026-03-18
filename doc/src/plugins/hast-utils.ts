import type { Element, ElementContent, Text } from "hast";

/** Recursively extract plain text from a HAST node tree. */
export function extractText(node: Element | ElementContent | Text): string {
  if (node.type === "text") return node.value;
  if (node.type === "element") {
    return node.children.map((c) => extractText(c)).join("");
  }
  return "";
}
