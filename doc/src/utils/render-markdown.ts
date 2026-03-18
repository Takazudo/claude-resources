/**
 * Lightweight markdown-to-HTML renderer for chat messages.
 * Escapes HTML first, then applies markdown patterns — safe by construction.
 */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(text: string): string {
  // Extract inline code first so bold/italic don't process inside backticks
  const codeSpans: string[] = [];
  let processed = text.replace(/`([^`]+)`/g, (_match, code) => {
    const idx = codeSpans.length;
    codeSpans.push(`<code>${code}</code>`);
    return `%%CODE_${idx}%%`;
  });

  processed = processed
    // bold: **text** or __text__
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    // italic: *text* or _text_ (not inside words for _)
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/(?<!\w)_(.+?)_(?!\w)/g, "<em>$1</em>")
    // links: [text](url)
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );

  // Restore inline code spans
  return processed.replace(/%%CODE_(\d+)%%/g, (_match, idx) => codeSpans[parseInt(idx, 10)]);
}

export function renderMarkdown(src: string): string {
  // Escape HTML first — all subsequent replacements only add safe tags
  const escaped = escapeHtml(src);

  // Extract fenced code blocks before processing
  const codeBlocks: string[] = [];
  const withPlaceholders = escaped.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_match, lang, code) => {
      const idx = codeBlocks.length;
      const langAttr = lang ? ` data-language="${lang}"` : "";
      codeBlocks.push(`<pre${langAttr}><code>${code.trimEnd()}</code></pre>`);
      return `\n%%CODEBLOCK_${idx}%%\n`;
    },
  );

  // Split into paragraphs by double newline
  const blocks = withPlaceholders.split(/\n{2,}/);
  const rendered = blocks
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";

      // Code block placeholder
      const cbMatch = trimmed.match(/^%%CODEBLOCK_(\d+)%%$/);
      if (cbMatch) return codeBlocks[parseInt(cbMatch[1], 10)];

      // Unordered list (lines starting with - or *)
      if (/^[-*] /m.test(trimmed)) {
        const items = trimmed
          .split("\n")
          .filter((l) => /^[-*] /.test(l.trim()))
          .map((l) => `<li>${renderInline(l.trim().replace(/^[-*] /, ""))}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }

      // Ordered list (lines starting with 1. 2. etc.)
      if (/^\d+\. /m.test(trimmed)) {
        const items = trimmed
          .split("\n")
          .filter((l) => /^\d+\. /.test(l.trim()))
          .map((l) => `<li>${renderInline(l.trim().replace(/^\d+\. /, ""))}</li>`)
          .join("");
        return `<ol>${items}</ol>`;
      }

      // Heading (# to ###)
      const headingMatch = trimmed.match(/^(#{1,3}) (.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        return `<h${level + 3}>${renderInline(headingMatch[2])}</h${level + 3}>`;
      }

      // Regular paragraph — convert single newlines to <br>
      const lines = trimmed.split("\n").map(renderInline).join("<br>");
      return `<p>${lines}</p>`;
    })
    .filter(Boolean)
    .join("");

  return rendered;
}
