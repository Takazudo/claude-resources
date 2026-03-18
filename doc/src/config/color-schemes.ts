/** A color reference: palette index (number) or direct color value (string) */
export type ColorRef = number | string;

export interface ColorScheme {
  background: ColorRef;
  foreground: ColorRef;
  cursor: ColorRef;
  selectionBg: ColorRef;
  selectionFg: ColorRef;
  palette: [
    string, string, string, string, string, string, string, string,
    string, string, string, string, string, string, string, string,
  ];
  shikiTheme: NonNullable<import("astro").ShikiConfig["theme"]>;
  /** Optional semantic overrides — when omitted, defaults are used:
   *  surface=p0, muted=p8, accent=p5, accentHover=p14
   *  codeBg=p10, codeFg=p11, success=p2, danger=p1, warning=p3, info=p4
   *  Each field accepts a palette index (number) or a direct color value (string). */
  semantic?: {
    surface?: ColorRef;
    muted?: ColorRef;
    accent?: ColorRef;
    accentHover?: ColorRef;
    codeBg?: ColorRef;
    codeFg?: ColorRef;
    success?: ColorRef;
    danger?: ColorRef;
    warning?: ColorRef;
    info?: ColorRef;
    mermaidNodeBg?: ColorRef;
    mermaidText?: ColorRef;
    mermaidLine?: ColorRef;
    mermaidLabelBg?: ColorRef;
    mermaidNoteBg?: ColorRef;
    chatUserBg?: ColorRef;
    chatUserText?: ColorRef;
    chatAssistantBg?: ColorRef;
    chatAssistantText?: ColorRef;
  };
}

/**
 * Standard palette index convention (all schemes should follow this):
 *
 * | Index | Role              | Description                              |
 * |-------|-------------------|------------------------------------------|
 * | p0    | Dark surface      | Deepest surface (code blocks, mermaid)   |
 * | p1    | Danger            | Red family — errors, destructive actions  |
 * | p2    | Success           | Green family — confirmations, tips        |
 * | p3    | Warning           | Yellow/amber — caution messages           |
 * | p4    | Info              | Blue family — informational highlights    |
 * | p5    | Accent            | Primary interactive color (links, CTA)    |
 * | p6    | Neutral           | Slate/cyan — borders, secondary elements  |
 * | p7    | Secondary neutral | Gray or muted accent                      |
 * | p8    | Muted             | Gray — borders, secondary text, comments  |
 * | p9    | Background        | Page background                           |
 * | p10   | Surface           | Elevated surface (panels, sidebars)       |
 * | p11   | Text primary      | Main body text                            |
 * | p12   | Accent variant    | Brighter or alternate accent              |
 * | p13   | Decorative        | Purple/lavender — non-semantic decoration  |
 * | p14   | Accent hover      | Hover state for interactive elements      |
 * | p15   | Text secondary    | Secondary text or muted foreground         |
 */
export const colorSchemes: Record<string, ColorScheme> = {
  "Default Light": {
    background: 9,
    foreground: 11,
    cursor: 6,
    selectionBg: 11,
    selectionFg: 10,
    palette: [
      "#303030", "#dd3131", "#266538", "#a83838",  // p0-3: dark surface, danger, success, warning
      "#3277c8", "#a35e0f", "#90a1b9", "#7a5218",  // p4-7: info, accent, neutral, secondary
      "#6b6b6b", "#e2ddda", "#ece9e9", "#303030",  // p8-11: muted, background, surface, text
      "#5b99dc", "#b89ee7", "#8590a0", "#654516",  // p12-15: accent variant, decorative, hover, muted foreground
    ],
    shikiTheme: "catppuccin-latte",
    semantic: {
      surface: 10,
      muted: 8,
      accent: 5,
      accentHover: 14,
      codeBg: 10,
      codeFg: 11,
      success: 2,
      danger: 1,
      warning: 3,
      info: 4,
    },
  },
  "Default Dark": {
    background: 9,
    foreground: 15,
    cursor: 6,
    selectionBg: 10,
    selectionFg: 11,
    palette: [
      "#1c1c1c", "#da6871", "#93bb77", "#dfbb77",  // p0-3: dark surface, danger, success, warning
      "#5caae9", "#c074d6", "#90a1b9", "#a0a0a0",  // p4-7: info, accent, neutral, secondary
      "#888888", "#181818", "#383838", "#e0e0e0",   // p8-11: muted, background, surface, text
      "#d69a66", "#c074d6", "#a7c0e3", "#b8b8b8",  // p12-15: accent variant, decorative, hover, text secondary
    ],
    shikiTheme: "vitesse-dark",
    semantic: {
      surface: 0,
      muted: 8,
      accent: 12,
      accentHover: 14,
      codeBg: 10,
      codeFg: 11,
      success: 2,
      danger: 1,
      warning: 3,
      info: 4,
    },
  },
};
