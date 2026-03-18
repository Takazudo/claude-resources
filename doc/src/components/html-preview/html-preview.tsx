import { type ReactNode, useMemo } from "react";
import PreviewBase from "./preview-base";
import { dedent } from "@/utils/dedent";
import { preflightCss } from "./preflight";

interface HtmlPreviewProps {
  html: string;
  css?: string;
  head?: string;
  js?: string;
  title?: string;
  height?: number;
  defaultOpen?: boolean;
  /** Per-component css for code block display (before global merge) */
  componentCss?: string;
  /** Per-component head for code block display (before global merge) */
  componentHead?: string;
  /** Per-component js for code block display (before global merge) */
  componentJs?: string;
}

function containsScript(head?: string, js?: string): boolean {
  if (js) return true;
  if (head && /<script/i.test(head)) return true;
  return false;
}

function buildSrcdoc(
  html: string,
  css?: string,
  head?: string,
  js?: string,
): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${preflightCss}</style>
${head ?? ""}
${css ? `<style>${css}</style>` : ""}
</head>
<body>${html}
${js ? `<script>${js}</script>` : ""}
</body>
</html>`;
}

export default function HtmlPreview({
  html,
  css,
  head,
  js,
  title,
  height,
  defaultOpen,
  componentCss,
  componentHead,
  componentJs,
}: HtmlPreviewProps): ReactNode {
  const srcdoc = useMemo(
    () => buildSrcdoc(html, css, head, js),
    [html, css, head, js],
  );
  const hasScripts = containsScript(head, js);
  const syncDelay = hasScripts ? 300 : 0;
  // allow-same-origin is needed alongside allow-scripts so that syncHeight
  // can access iframe.contentDocument for auto-height measurement
  const sandboxValue = hasScripts ? "allow-scripts allow-same-origin" : "";

  const codeBlocks = useMemo(
    () => [
      { language: "html", title: "HTML", code: dedent(html) },
      ...(componentCss
        ? [{ language: "css", title: "CSS", code: dedent(componentCss) }]
        : []),
      ...(componentHead
        ? [{ language: "html", title: "Head", code: dedent(componentHead) }]
        : []),
      ...(componentJs
        ? [
            {
              language: "javascript",
              title: "JS",
              code: dedent(componentJs),
            },
          ]
        : []),
    ],
    [html, componentCss, componentHead, componentJs],
  );

  return (
    <PreviewBase
      title={title}
      height={height}
      srcdoc={srcdoc}
      defaultOpen={defaultOpen}
      sandbox={sandboxValue}
      syncDelay={syncDelay}
      codeBlocks={codeBlocks}
    />
  );
}
