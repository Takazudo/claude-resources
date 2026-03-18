import { useEffect, useState } from "react";
import type { HighlighterCore } from "shiki";

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki")
      .then(({ createHighlighter }) =>
        createHighlighter({
          themes: ["catppuccin-latte", "vitesse-dark"],
          langs: ["html", "css", "javascript"],
        }),
      )
      .catch((err) => {
        // Clear cached rejection so next call retries
        highlighterPromise = null;
        throw err;
      });
  }
  return highlighterPromise;
}

interface HighlightedCodeProps {
  code: string;
  language: string;
}

export default function HighlightedCode({
  code,
  language,
}: HighlightedCodeProps) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getHighlighter()
      .then((highlighter) => {
        if (cancelled) return;
        const lang = highlighter.getLoadedLanguages().includes(language)
          ? language
          : "text";
        const result = highlighter.codeToHtml(code, {
          lang,
          themes: { light: "catppuccin-latte", dark: "vitesse-dark" },
          defaultColor: false,
        });
        setHtml(result);
      })
      .catch(() => {
        // Shiki failed to load — keep showing the plain-text fallback
      });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  if (!html) {
    return (
      <pre className="m-0 p-hsp-md bg-code-bg text-caption leading-relaxed overflow-x-auto">
        <code className="font-mono whitespace-pre">
          {code}
        </code>
      </pre>
    );
  }

  return (
    <div
      className="zd-html-preview-code"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
