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
  colorMode: {
    defaultMode: "dark",
    lightScheme: "Default Light",
    darkScheme: "Default Dark",
    respectPrefersColorScheme: true,
  } as ColorModeConfig | false,
  siteName: "CCResDoc",
  base: "/",
  docsDir: "src/content/docs",
  locales: {} as Record<string, LocaleConfig>,
  mermaid: true,
  colorTweakPanel: false as boolean,
  sidebarResizer: true as boolean,
  sidebarToggle: true as boolean,
  claudeResources: {
    claudeDir: "..",
    projectRoot: "..",
  } as { claudeDir: string; projectRoot?: string } | false,
  headerNav: [
    { label: "CLAUDE.md", path: "/docs/claude-md", categoryMatch: "claude-md" },
    { label: "Commands", path: "/docs/claude-commands", categoryMatch: "claude-commands" },
    { label: "Skills", path: "/docs/claude-skills", categoryMatch: "claude-skills" },
    { label: "Agents", path: "/docs/claude-agents", categoryMatch: "claude-agents" },
  ] satisfies HeaderNavItem[],
  footer: {
    links: [
      {
        title: "Links",
        items: [
          { label: "Claude Code", href: "https://claude.com/claude-code" },
          { label: "GitHub", href: "https://github.com/anthropics/claude-code" },
        ],
      },
    ],
    copyright: `Copyright © ${new Date().getFullYear()} CCResDoc.`,
  },
};
