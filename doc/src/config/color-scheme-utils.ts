import { colorSchemes, type ColorScheme, type ColorRef } from "./color-schemes";
import { settings } from "./settings";

/** Default mapping: semantic token name → palette index */
export const SEMANTIC_DEFAULTS: Record<string, number> = {
  surface: 0,
  muted: 8,
  accent: 5,
  accentHover: 14,
  codeBg: 10,
  codeFg: 11,
  success: 2,
  danger: 1,
  warning: 3,
  info: 4,
  mermaidNodeBg: 9,
  mermaidText: 11,
  mermaidLine: 8,
  mermaidLabelBg: 10,
  mermaidNoteBg: 0,
  chatUserBg: 5,
  chatUserText: 9,
  chatAssistantBg: 9,
  chatAssistantText: 11,
};

export const SEMANTIC_CSS_NAMES: Record<string, string> = {
  surface: "--zd-surface",
  muted: "--zd-muted",
  accent: "--zd-accent",
  accentHover: "--zd-accent-hover",
  codeBg: "--zd-code-bg",
  codeFg: "--zd-code-fg",
  success: "--zd-success",
  danger: "--zd-danger",
  warning: "--zd-warning",
  info: "--zd-info",
  mermaidNodeBg: "--zd-mermaid-node-bg",
  mermaidText: "--zd-mermaid-text",
  mermaidLine: "--zd-mermaid-line",
  mermaidLabelBg: "--zd-mermaid-label-bg",
  mermaidNoteBg: "--zd-mermaid-note-bg",
  chatUserBg: "--zd-chat-user-bg",
  chatUserText: "--zd-chat-user-text",
  chatAssistantBg: "--zd-chat-assistant-bg",
  chatAssistantText: "--zd-chat-assistant-text",
};

export const lightDarkPairings = [
  { light: "Default Light", dark: "Default Dark", label: "Default" },
];

export function getActiveScheme(): ColorScheme {
  const scheme = colorSchemes[settings.colorScheme];
  if (!scheme) {
    throw new Error(`Unknown color scheme: "${settings.colorScheme}". Available: ${Object.keys(colorSchemes).join(", ")}`);
  }
  return scheme;
}

/** Resolve a ColorRef to a concrete color string.
 *  - number → palette[value]
 *  - string → used as-is
 *  - undefined → fallback */
export function resolveColor(
  value: ColorRef | undefined,
  palette: string[],
  fallback: string,
): string {
  if (value === undefined) return fallback;
  if (typeof value === "number") return palette[value] ?? fallback;
  return value;
}

/** Resolve semantic colors with fallbacks to default palette slots */
export function resolveSemanticColors(scheme: ColorScheme) {
  const p = scheme.palette;
  return {
    surface: resolveColor(scheme.semantic?.surface, p, p[0]),
    muted: resolveColor(scheme.semantic?.muted, p, p[8]),
    accent: resolveColor(scheme.semantic?.accent, p, p[5]),
    accentHover: resolveColor(scheme.semantic?.accentHover, p, p[14]),
    codeBg: resolveColor(scheme.semantic?.codeBg, p, p[10]),
    codeFg: resolveColor(scheme.semantic?.codeFg, p, p[11]),
    success: resolveColor(scheme.semantic?.success, p, p[2]),
    danger: resolveColor(scheme.semantic?.danger, p, p[1]),
    warning: resolveColor(scheme.semantic?.warning, p, p[3]),
    info: resolveColor(scheme.semantic?.info, p, p[4]),
    mermaidNodeBg: resolveColor(scheme.semantic?.mermaidNodeBg, p, p[9]),
    mermaidText: resolveColor(scheme.semantic?.mermaidText, p, p[11]),
    mermaidLine: resolveColor(scheme.semantic?.mermaidLine, p, p[8]),
    mermaidLabelBg: resolveColor(scheme.semantic?.mermaidLabelBg, p, p[10]),
    mermaidNoteBg: resolveColor(scheme.semantic?.mermaidNoteBg, p, p[0]),
    chatUserBg: resolveColor(scheme.semantic?.chatUserBg, p, p[5]),
    chatUserText: resolveColor(scheme.semantic?.chatUserText, p, p[9]),
    chatAssistantBg: resolveColor(scheme.semantic?.chatAssistantBg, p, p[9]),
    chatAssistantText: resolveColor(scheme.semantic?.chatAssistantText, p, p[11]),
  };
}

export function schemeToCssPairs(scheme: ColorScheme): [string, string][] {
  const p = scheme.palette;
  const sem = resolveSemanticColors(scheme);
  return [
    ["--zd-bg", resolveColor(scheme.background, p, p[0])],
    ["--zd-fg", resolveColor(scheme.foreground, p, p[15])],
    ["--zd-cursor", resolveColor(scheme.cursor, p, p[6])],
    ["--zd-sel-bg", resolveColor(scheme.selectionBg, p, resolveColor(scheme.background, p, p[0]))],
    ["--zd-sel-fg", resolveColor(scheme.selectionFg, p, resolveColor(scheme.foreground, p, p[15]))],
    ...p.map((color, i) => [`--zd-${i}`, color] as [string, string]),
    ["--zd-surface", sem.surface],
    ["--zd-muted", sem.muted],
    ["--zd-accent", sem.accent],
    ["--zd-accent-hover", sem.accentHover],
    ["--zd-code-bg", sem.codeBg],
    ["--zd-code-fg", sem.codeFg],
    ["--zd-success", sem.success],
    ["--zd-danger", sem.danger],
    ["--zd-warning", sem.warning],
    ["--zd-info", sem.info],
    ["--zd-mermaid-node-bg", sem.mermaidNodeBg],
    ["--zd-mermaid-text", sem.mermaidText],
    ["--zd-mermaid-line", sem.mermaidLine],
    ["--zd-mermaid-label-bg", sem.mermaidLabelBg],
    ["--zd-mermaid-note-bg", sem.mermaidNoteBg],
    ["--zd-chat-user-bg", sem.chatUserBg],
    ["--zd-chat-user-text", sem.chatUserText],
    ["--zd-chat-assistant-bg", sem.chatAssistantBg],
    ["--zd-chat-assistant-text", sem.chatAssistantText],
  ];
}

export function generateCssCustomProperties(): string {
  const scheme = getActiveScheme();
  const pairs = schemeToCssPairs(scheme);
  const lines = [":root {", ...pairs.map(([prop, value]) => `  ${prop}: ${value};`), "}"];
  return lines.join("\n");
}

export function generateLightDarkCssProperties(): string {
  if (!settings.colorMode) {
    throw new Error("colorMode is not configured");
  }
  const { lightScheme, darkScheme } = settings.colorMode;
  const light = colorSchemes[lightScheme];
  const dark = colorSchemes[darkScheme];
  if (!light) throw new Error(`Unknown light scheme: "${lightScheme}"`);
  if (!dark) throw new Error(`Unknown dark scheme: "${darkScheme}"`);

  const lightPairs = schemeToCssPairs(light);
  const darkPairs = schemeToCssPairs(dark);

  if (lightPairs.length !== darkPairs.length) {
    throw new Error(`Light scheme has ${lightPairs.length} properties but dark scheme has ${darkPairs.length}`);
  }

  const lines = [":root {", "  color-scheme: light dark;"];
  for (let i = 0; i < lightPairs.length; i++) {
    const prop = lightPairs[i][0];
    const lightVal = lightPairs[i][1];
    const darkVal = darkPairs[i][1];
    lines.push(`  ${prop}: light-dark(${lightVal}, ${darkVal});`);
  }
  lines.push("}");
  return lines.join("\n");
}
