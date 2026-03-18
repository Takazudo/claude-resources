import { describe, it, expect } from "vitest";
import { generateCode, type ExportColorState } from "../export-code";

function makeState(overrides?: Partial<ExportColorState>): ExportColorState {
  return {
    background: 0,
    foreground: 15,
    cursor: 6,
    selectionBg: 0,
    selectionFg: 15,
    palette: [
      "#1c1c1c", "#da6871", "#93bb77", "#dfbb77",
      "#5caae9", "#c074d6", "#7aa2f7", "#a0a0a0",
      "#888888", "#da6871", "#93bb77", "#dfbb77",
      "#5caae9", "#c074d6", "#bb9af7", "#b8b8b8",
    ],
    semanticMappings: {
      surface: 0,
      muted: 8,
      accent: 6,
      accentHover: 14,
      codeBg: "fg",
      codeFg: "bg",
      success: 2,
      danger: 1,
      warning: 3,
      info: 4,
    },
    shikiTheme: "dracula",
    ...overrides,
  };
}

describe("generateCode", () => {
  it("includes shikiTheme in output", () => {
    const code = generateCode(makeState({ shikiTheme: "dracula" }));
    expect(code).toContain('shikiTheme: "dracula"');
  });

  it("uses different shikiTheme when specified", () => {
    const code = generateCode(makeState({ shikiTheme: "tokyo-night" }));
    expect(code).toContain('shikiTheme: "tokyo-night"');
  });

  it("outputs numeric background/foreground values", () => {
    const code = generateCode(makeState({ background: 0, foreground: 15 }));
    expect(code).toContain("background: 0,");
    expect(code).toContain("foreground: 15,");
  });

  it("quotes string semantic values (bg/fg)", () => {
    const code = generateCode(makeState());
    expect(code).toContain('codeBg: "fg",');
    expect(code).toContain('codeFg: "bg",');
  });

  it("does not quote numeric semantic values", () => {
    const code = generateCode(makeState());
    expect(code).toContain("surface: 0,");
    expect(code).toContain("muted: 8,");
    expect(code).toContain("accent: 6,");
  });

  it("formats palette with 4 colors per line", () => {
    const code = generateCode(makeState());
    // Each line in the palette block should have exactly 4 color entries
    const paletteSection = code.split("palette: [")[1].split("]")[0];
    const lines = paletteSection
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    for (const line of lines) {
      const colorMatches = line.match(/"#[0-9a-f]{6}"/g);
      expect(colorMatches).not.toBeNull();
      expect(colorMatches!.length).toBe(4);
    }
  });

  it("omits semantic block when semanticMappings is empty", () => {
    const code = generateCode(makeState({ semanticMappings: {} }));
    expect(code).not.toContain("semantic:");
  });

  it("includes semantic block when mappings are present", () => {
    const code = generateCode(makeState());
    expect(code).toContain("semantic: {");
  });

  it("outputs numeric cursor, selectionBg, selectionFg", () => {
    const code = generateCode(makeState({ cursor: 6, selectionBg: 0, selectionFg: 15 }));
    expect(code).toContain("cursor: 6,");
    expect(code).toContain("selectionBg: 0,");
    expect(code).toContain("selectionFg: 15,");
  });
});
