export interface ColorScheme {
  background: string;
  foreground: string;
  cursor: string;
  selectionBg: string;
  selectionFg: string;
  palette: [
    string, string, string, string, string, string, string, string,
    string, string, string, string, string, string, string, string,
  ];
  shikiTheme: NonNullable<import("astro").ShikiConfig["theme"]>;
  /** Optional semantic overrides — when omitted, defaults are used:
   *  surface=palette[0], muted=palette[8], accent=palette[6], accentHover=palette[14]
   *  codeBg=foreground, codeFg=background, success=palette[2], danger=palette[1],
   *  warning=palette[3], info=palette[4] */
  semantic?: {
    surface?: string;
    muted?: string;
    accent?: string;
    accentHover?: string;
    codeBg?: string;
    codeFg?: string;
    success?: string;
    danger?: string;
    warning?: string;
    info?: string;
  };
}

export const colorSchemes: Record<string, ColorScheme> = {
  "Default Dark": {
    background: "#212429",
    foreground: "#a2aab8",
    cursor: "#a8aebb",
    selectionBg: "#323842",
    selectionFg: "#a7aebc",
    palette: [
      "#1e2024", "#da6871", "#93bb77", "#dfbb77",
      "#5caae9", "#c074d6", "oklch(70.4% 0.04 256.788)", "#a9aeb7",
      "#717171", "#da6871", "#93bb77", "#dfbb77",
      "#5caae9", "#c074d6", "oklch(70.4% 0.04 256.788)", "#a9aeb7",
    ],
    shikiTheme: "one-dark-pro",
    semantic: { muted: "#797d86" },
  },
};
