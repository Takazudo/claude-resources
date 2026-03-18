import { describe, it, expect } from "vitest";
import { hexToHsl, hslToHex } from "../color-convert";

describe("hexToHsl", () => {
  it("converts black (#000000)", () => {
    expect(hexToHsl("#000000")).toEqual({ h: 0, s: 0, l: 0 });
  });

  it("converts white (#ffffff)", () => {
    expect(hexToHsl("#ffffff")).toEqual({ h: 0, s: 0, l: 100 });
  });

  it("converts pure red (#ff0000)", () => {
    expect(hexToHsl("#ff0000")).toEqual({ h: 0, s: 100, l: 50 });
  });

  it("converts pure green (#00ff00)", () => {
    expect(hexToHsl("#00ff00")).toEqual({ h: 120, s: 100, l: 50 });
  });

  it("converts pure blue (#0000ff)", () => {
    expect(hexToHsl("#0000ff")).toEqual({ h: 240, s: 100, l: 50 });
  });

  it("converts mid-gray (#808080)", () => {
    const result = hexToHsl("#808080");
    expect(result.h).toBe(0);
    expect(result.s).toBe(0);
    expect(result.l).toBeCloseTo(50, 0);
  });

  it("converts arbitrary color (#da6871 — pinkish red)", () => {
    const result = hexToHsl("#da6871");
    expect(result.h).toBeGreaterThanOrEqual(355);
    expect(result.h).toBeLessThanOrEqual(360);
    expect(result.s).toBeGreaterThan(50);
    expect(result.l).toBeGreaterThan(50);
    expect(result.l).toBeLessThan(70);
  });

  it("converts arbitrary color (#93bb77 — muted green)", () => {
    const result = hexToHsl("#93bb77");
    expect(result.h).toBeGreaterThanOrEqual(90);
    expect(result.h).toBeLessThanOrEqual(110);
    expect(result.s).toBeGreaterThan(20);
    expect(result.l).toBeGreaterThan(50);
  });
});

describe("hslToHex", () => {
  it("converts h=0, s=0, l=0 to black", () => {
    expect(hslToHex(0, 0, 0)).toBe("#000000");
  });

  it("converts h=0, s=0, l=100 to white", () => {
    expect(hslToHex(0, 0, 100)).toBe("#ffffff");
  });

  it("converts h=0, s=100, l=50 to red", () => {
    expect(hslToHex(0, 100, 50)).toBe("#ff0000");
  });

  it("converts h=120, s=100, l=50 to green", () => {
    expect(hslToHex(120, 100, 50)).toBe("#00ff00");
  });

  it("converts h=240, s=100, l=50 to blue", () => {
    expect(hslToHex(240, 100, 50)).toBe("#0000ff");
  });
});

describe("roundtrip: hexToHsl → hslToHex", () => {
  const testColors = [
    "#ff0000",
    "#00ff00",
    "#0000ff",
    "#000000",
    "#ffffff",
    "#808080",
    "#c074d6",
    "#5caae9",
    "#dfbb77",
  ];

  for (const hex of testColors) {
    it(`roundtrips ${hex}`, () => {
      const hsl = hexToHsl(hex);
      const result = hslToHex(hsl.h, hsl.s, hsl.l);
      // Allow ±2 per channel due to HSL integer rounding
      const origR = parseInt(hex.slice(1, 3), 16);
      const origG = parseInt(hex.slice(3, 5), 16);
      const origB = parseInt(hex.slice(5, 7), 16);
      const resR = parseInt(result.slice(1, 3), 16);
      const resG = parseInt(result.slice(3, 5), 16);
      const resB = parseInt(result.slice(5, 7), 16);
      expect(Math.abs(origR - resR)).toBeLessThanOrEqual(2);
      expect(Math.abs(origG - resG)).toBeLessThanOrEqual(2);
      expect(Math.abs(origB - resB)).toBeLessThanOrEqual(2);
    });
  }
});

describe("edge cases", () => {
  it("hslToHex handles hue at 360 (same as 0)", () => {
    const at360 = hslToHex(360, 100, 50);
    const at0 = hslToHex(0, 100, 50);
    expect(at360).toBe(at0);
  });

  it("hslToHex handles saturation at 0 (grayscale)", () => {
    const result = hslToHex(180, 0, 50);
    // With 0 saturation, hue is irrelevant — should be gray
    expect(result).toBe("#808080");
  });

  it("hslToHex handles saturation at 100", () => {
    const result = hslToHex(60, 100, 50);
    expect(result).toBe("#ffff00"); // yellow
  });
});
