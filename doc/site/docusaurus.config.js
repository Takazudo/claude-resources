// @ts-check
import { themes as prismThemes } from "prism-react-renderer";

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Claude Code Doc",
  tagline: "Global commands and skills documentation",
  favicon: "img/favicon.ico",

  // Future flags
  future: {
    v4: true,
  },

  // Set the production url of your site here
  url: "http://claude.localhost:9987",
  baseUrl: "/",

  // Don't add trailing slash
  trailingSlash: false,

  // Ignore broken links - docs are generated from Claude Code skills/commands
  // which contain internal references not resolvable by Docusaurus
  onBrokenLinks: "ignore",

  // English locale
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  // Enable Mermaid diagrams
  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: "ignore",
    },
  },

  themes: ["@docusaurus/theme-mermaid"],

  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: "./sidebars.js",
          routeBasePath: "/",
          editUrl: undefined,
          remarkPlugins: [require("remark-breaks")],
        },
        // Disable blog feature
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Force dark mode and disable theme switching
      colorMode: {
        defaultMode: "dark",
        disableSwitch: true,
        respectPrefersColorScheme: false,
      },
      navbar: {
        title: "Claude Code Doc",
        items: [],
      },
      footer: {
        style: "dark",
        copyright: `Copyright © ${new Date().getFullYear()} Takazudo`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.oneDark,
      },
    }),
};

export default config;
