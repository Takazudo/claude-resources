export interface HeaderNavItem {
  label: string;
  path: string;
  categoryMatch?: string;
}

export interface ColorModeConfig {
  defaultMode: "light" | "dark";
  lightScheme: string;
  darkScheme: string;
  respectPrefersColorScheme: boolean;
}

export interface LocaleConfig {
  label: string;
  dir: string;
}

export const settings = {
  colorScheme: "Default Dark",
  colorMode: false as ColorModeConfig | false,
  siteName: "Claude Resources",
  base: "/",
  docsDir: "src/content/docs",
  locales: {} as Record<string, LocaleConfig>,
  mermaid: true,
  colorTweakPanel: false as boolean,
  claudeResources: {
    claudeDir: "..",
    projectRoot: "..",
  } as { claudeDir: string; projectRoot?: string } | false,
  headerNav: [
    { label: "Claude", path: "/docs/claude", categoryMatch: "claude" },
  ] satisfies HeaderNavItem[],
};
