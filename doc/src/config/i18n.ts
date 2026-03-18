import type { CollectionKey } from "astro:content";
import { settings } from "./settings";

/** Default locale code (always "en", served from docsDir). */
export const defaultLocale = "en" as const;

/** All supported locale codes, derived from settings. */
export const locales = [
  defaultLocale,
  ...(Object.keys(settings.locales) as Array<keyof typeof settings.locales>),
] as const;
export type Locale = (typeof locales)[number];

type LocaleKey = keyof typeof settings.locales;

/** Safely look up a locale in settings.locales. */
function getLocaleConfig(locale: string) {
  return (settings.locales as Record<string, (typeof settings.locales)[LocaleKey]>)[locale];
}

/** Get the content directory for a locale. */
export function getContentDir(locale: Locale | string): string {
  if (locale === defaultLocale) return settings.docsDir;
  return getLocaleConfig(locale)?.dir ?? settings.docsDir;
}

/**
 * Get the Astro content collection name for a locale.
 * Returns a CollectionKey so it can be passed directly to getCollection().
 * The cast is safe because collections are dynamically created in content.config.ts
 * for every locale in settings.locales.
 */
export function getCollectionName(locale: Locale | string): CollectionKey {
  if (locale === defaultLocale) return "docs";
  return `docs-${locale}` as CollectionKey;
}

/** Get the display label for a locale. */
export function getLocaleLabel(locale: Locale | string): string {
  if (locale === defaultLocale) return "EN";
  return getLocaleConfig(locale)?.label ?? locale.toUpperCase();
}

/** Detect locale from a URL pathname (after base stripping). */
export function detectLocaleFromPath(path: string): Locale {
  for (const code of Object.keys(settings.locales)) {
    if (path.startsWith(`/${code}/`) || path === `/${code}`) {
      return code as Locale;
    }
  }
  return defaultLocale;
}

/** UI string translations */
const translations: Record<string, Record<string, string>> = {
  en: {
    "nav.gettingStarted": "Getting Started",
    "nav.guides": "Guides",
    "nav.components": "Components",
    "nav.reference": "Reference",
    "nav.claude": "Claude",
    "nav.changelog": "Changelog",
    "nav.previous": "Previous",
    "nav.next": "Next",
    "toc.title": "On this page",
    "docs.browseAll": "Browse all documentation sections.",
    "search.label": "Search",
    "code.copy": "Copy code",
    "code.copied": "Copied!",
    "code.wrapToggle": "Toggle word wrap",
    "doc.editPage": "Edit this page",
    "doc.tags": "Tags",
    "doc.taggedWith": "Pages tagged with",
    "doc.allTags": "All Tags",
    "doc.created": "Created",
    "doc.updated": "Updated",
    "doc.noTags": "No tags found.",
    "doc.pageCount": "{count} pages",
    "doc.pageCountSingle": "{count} page",
    "nav.backToMenu": "Back to main menu",
    "doc.fallbackNotice":
      "This page has not been translated yet and is shown in the original language.",
    "version.latest": "Latest",
    "version.switcher.label": "Version",
    "version.banner.unmaintained":
      "You are viewing documentation for an older version.",
    "version.banner.unreleased":
      "You are viewing unreleased documentation.",
    "version.banner.latestLink": "View the latest version",
    "version.switcher.unavailable": "Not available in this version",
    "version.switcher.allVersions": "All versions",
    "version.page.title": "Documentation Versions",
    "version.page.latest.title": "Latest Version (Current)",
    "version.page.latest.description":
      "The most up-to-date documentation for the latest stable release.",
    "version.page.latest.link": "View latest docs",
    "version.page.past.title": "Past Versions",
    "version.page.past.description":
      "Documentation for previously released versions.",
    "version.page.unmaintained": "Unmaintained",
    "version.page.unreleased": "Unreleased",
    "version.page.status": "Status",
    "version.page.docs": "Docs",
  },
  ja: {
    "nav.gettingStarted": "はじめに",
    "nav.guides": "ガイド",
    "nav.components": "コンポーネント",
    "nav.reference": "リファレンス",
    "nav.claude": "Claude",
    "nav.changelog": "変更履歴",
    "nav.previous": "前へ",
    "nav.next": "次へ",
    "toc.title": "目次",
    "docs.browseAll": "すべてのドキュメントセクションを閲覧",
    "search.label": "検索",
    "code.copy": "コードをコピー",
    "code.copied": "コピーしました！",
    "code.wrapToggle": "折り返し切替",
    "doc.editPage": "このページを編集",
    "doc.tags": "タグ",
    "doc.taggedWith": "タグ付きページ",
    "doc.allTags": "すべてのタグ",
    "doc.created": "作成",
    "doc.updated": "更新",
    "doc.noTags": "タグが見つかりません。",
    "doc.pageCount": "{count}ページ",
    "doc.pageCountSingle": "{count}ページ",
    "nav.backToMenu": "メインメニューに戻る",
    "doc.fallbackNotice":
      "このページはまだ翻訳されていません。原文のまま表示しています。",
    "version.latest": "最新",
    "version.switcher.label": "バージョン",
    "version.banner.unmaintained":
      "これは旧バージョンのドキュメントです。",
    "version.banner.unreleased":
      "これは未リリースのドキュメントです。",
    "version.banner.latestLink": "最新バージョンを見る",
    "version.switcher.unavailable": "このバージョンでは利用できません",
    "version.switcher.allVersions": "すべてのバージョン",
    "version.page.title": "ドキュメントバージョン",
    "version.page.latest.title": "最新バージョン（現在）",
    "version.page.latest.description":
      "最新の安定版リリースのドキュメントです。",
    "version.page.latest.link": "最新ドキュメントを見る",
    "version.page.past.title": "過去のバージョン",
    "version.page.past.description":
      "以前にリリースされたバージョンのドキュメントです。",
    "version.page.unmaintained": "メンテナンス終了",
    "version.page.unreleased": "未リリース",
    "version.page.status": "ステータス",
    "version.page.docs": "ドキュメント",
  },
  de: {
    "nav.gettingStarted": "Erste Schritte",
    "nav.guides": "Anleitungen",
    "nav.components": "Komponenten",
    "nav.reference": "Referenz",
    "nav.claude": "Claude",
    "nav.changelog": "Changelog",
    "nav.previous": "Zurück",
    "nav.next": "Weiter",
    "toc.title": "Auf dieser Seite",
    "docs.browseAll": "Alle Dokumentationsabschnitte durchsuchen.",
    "search.label": "Suche",
    "code.copy": "Code kopieren",
    "code.copied": "Kopiert!",
    "code.wrapToggle": "Zeilenumbruch umschalten",
    "nav.backToMenu": "Zurück zum Hauptmenü",
    "doc.editPage": "Diese Seite bearbeiten",
    "doc.tags": "Tags",
    "doc.taggedWith": "Seiten mit Tag",
    "doc.allTags": "Alle Tags",
    "doc.created": "Erstellt",
    "doc.updated": "Aktualisiert",
    "doc.noTags": "Keine Tags gefunden.",
    "doc.pageCount": "{count} Seiten",
    "doc.pageCountSingle": "{count} Seite",
    "doc.fallbackNotice":
      "Diese Seite wurde noch nicht übersetzt und wird in der Originalsprache angezeigt.",
    "version.latest": "Neueste",
    "version.switcher.label": "Version",
    "version.banner.unmaintained":
      "Sie sehen die Dokumentation einer älteren Version.",
    "version.banner.unreleased":
      "Sie sehen unveröffentlichte Dokumentation.",
    "version.banner.latestLink": "Neueste Version anzeigen",
  },
};

/** Get a translated UI string */
export function t(key: string, locale: Locale | string = defaultLocale): string {
  return translations[locale]?.[key] ?? translations[defaultLocale]?.[key] ?? key;
}
