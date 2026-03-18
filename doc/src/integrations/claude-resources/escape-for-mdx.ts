const htmlTags = new Set([
  "div", "span", "p", "a", "img", "br", "hr", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6", "code", "pre", "blockquote",
  "table", "tr", "td", "th", "thead", "tbody", "tfoot", "colgroup", "col",
  "strong", "em", "b", "i", "u", "s", "del", "ins", "sub", "sup",
  "details", "summary", "figure", "figcaption", "mark", "small",
  "cite", "q", "abbr", "dfn", "time", "var", "samp", "kbd",
  "section", "article", "aside", "header", "footer", "nav", "main",
  "form", "input", "button", "select", "option", "textarea", "label",
  "fieldset", "legend", "dl", "dt", "dd", "caption",
]);

/**
 * Escape angle brackets and curly braces in content for MDX compatibility.
 * Preserves content inside code blocks (``` ... ```) and inline code (` ... `).
 * Handles 3+ backtick fenced blocks correctly.
 */
export function escapeForMdx(content: string): string {
  // Extract code blocks (supports 3+ backtick fences via backreference)
  const codeBlocks: string[] = [];
  const placeholder = "\x00CODEBLOCK_";
  const codeBlockRegex = /(`{3,})[^\n]*\n[\s\S]*?\1/g;
  const withPlaceholders = content.replace(codeBlockRegex, (match) => {
    const idx = codeBlocks.length;
    codeBlocks.push(match);
    return `${placeholder}${idx}\x00`;
  });
  const parts = withPlaceholders.split(
    new RegExp(`(${placeholder}\\d+\x00)`, "g"),
  );

  return parts
    .map((part) => {
      const placeholderMatch = part.match(
        new RegExp(`^${placeholder}(\\d+)\x00$`),
      );
      if (placeholderMatch) return codeBlocks[Number(placeholderMatch[1])];

      // For non-code-block text, split on inline code to preserve it.
      // Supports multi-backtick inline code (`` `code` ``, ``` ``code`` ```).
      const inlineCodeRegex = /(`{1,3})(?!`)([\s\S]*?[^`])\1(?!`)/g;
      const inlineCodes: string[] = [];
      const inlinePlaceholder = "\x00INLINE_";
      const withInlinePlaceholders = part.replace(
        inlineCodeRegex,
        (match) => {
          const idx = inlineCodes.length;
          inlineCodes.push(match);
          return `${inlinePlaceholder}${idx}\x00`;
        },
      );

      let escaped = withInlinePlaceholders
        // Escape opening tags: <Name>, <Name attr="val">
        .replace(
          /<([A-Za-z][A-Za-z0-9_-]*)(\s[^>]*)?>(?!\/)/g,
          (match, name: string) => {
            if (htmlTags.has(name.toLowerCase())) return match;
            return match.replace(/</g, "&lt;").replace(/>/g, "&gt;");
          },
        )
        // Escape closing tags: </Name>
        .replace(
          /<\/([A-Za-z][A-Za-z0-9_-]*)>/g,
          (match, name: string) => {
            if (htmlTags.has(name.toLowerCase())) return match;
            return `&lt;/${name}&gt;`;
          },
        )
        // Escape self-closing tags: <Name />
        .replace(
          /<([A-Za-z][A-Za-z0-9_-]*)(\s[^>]*)?\s*\/>/g,
          (match, name: string) => {
            if (htmlTags.has(name.toLowerCase())) return match;
            return match.replace(/</g, "&lt;").replace(/>/g, "&gt;");
          },
        )
        .replace(/<(-+|=+)/g, "&lt;$1")
        .replace(/<(\d)/g, "&lt;$1")
        // Escape curly braces (MDX interprets them as JSX expressions)
        .replace(/\{/g, "&#123;")
        .replace(/\}/g, "&#125;");

      // Restore inline code placeholders
      escaped = escaped.replace(
        new RegExp(`${inlinePlaceholder}(\\d+)\x00`, "g"),
        (_, idx: string) => inlineCodes[Number(idx)],
      );

      return escaped;
    })
    .join("");
}
