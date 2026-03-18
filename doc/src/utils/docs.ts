import type { DocsEntry } from "@/types/docs-entry";
import fs from "node:fs";
import path from "node:path";
import { toTitleCase, toRouteSlug } from "@/utils/slug";
import { docsUrl, withBase } from "@/utils/base";
import { defaultLocale, type Locale } from "@/config/i18n";

/** Filter predicate: true when a doc should appear in navigation (sidebar, index, sitemap). */
export function isNavVisible(doc: DocsEntry): boolean {
  return !doc.data.unlisted && !doc.data.standalone;
}

export interface CategoryMeta {
  label?: string;
  position?: number;
  description?: string;
  sortOrder?: "asc" | "desc";
  noPage?: boolean;
}

export interface NavNode {
  slug: string;
  label: string;
  description?: string;
  position: number;
  href?: string;
  hasPage: boolean;
  children: NavNode[];
  sortOrder?: "asc" | "desc";
}

interface BuildNode {
  segment: string;
  fullPath: string;
  doc?: DocsEntry;
  children: Map<string, BuildNode>;
}

// Module-level caches — persist across all page renders during a single Astro build.
const categoryMetaCache = new Map<string, Map<string, CategoryMeta>>();
const navTreeCache = new Map<string, NavNode[]>();

/** Build a cache key from docs array + locale + category meta. */
function navTreeCacheKey(
  docs: DocsEntry[],
  lang: Locale,
  categoryMeta?: Map<string, CategoryMeta>,
): string {
  const metaKey = categoryMeta ? [...categoryMeta.keys()].sort().join(";") : "_";
  return `${lang}:${metaKey}:${docs.map((d) => d.id).sort().join(",")}`;
}

/**
 * Build a recursive navigation tree from a flat Astro content collection.
 * Mirrors the filesystem: directories become category nodes, files become leaves.
 *
 * Astro 5 glob() strips /index from IDs:
 *   getting-started/index.mdx → ID "getting-started" (category index)
 *   getting-started/intro.mdx → ID "getting-started/intro" (child page)
 */
export function buildNavTree(
  docs: DocsEntry[],
  lang: Locale = defaultLocale,
  categoryMeta?: Map<string, CategoryMeta>,
): NavNode[] {
  const cacheKey = navTreeCacheKey(docs, lang, categoryMeta);
  const cached = navTreeCache.get(cacheKey);
  if (cached) return cached;

  const root: BuildNode = {
    segment: "",
    fullPath: "",
    children: new Map(),
  };

  for (const doc of docs) {
    const slug = doc.data.slug ?? toRouteSlug(doc.id);
    const parts = slug.split("/");

    if (parts.length <= 1) {
      // Category index: Astro 5 stripped /index → single segment like "guides"
      const segment = doc.id;
      if (!root.children.has(segment)) {
        root.children.set(segment, {
          segment,
          fullPath: segment,
          children: new Map(),
        });
      }
      root.children.get(segment)!.doc = doc;
    } else {
      // Multi-segment: walk the tree creating intermediate nodes as needed
      let current = root;
      for (let i = 0; i < parts.length; i++) {
        const segment = parts[i];
        const fullPath = parts.slice(0, i + 1).join("/");
        if (!current.children.has(segment)) {
          current.children.set(segment, {
            segment,
            fullPath,
            children: new Map(),
          });
        }
        if (i === parts.length - 1) {
          current.children.get(segment)!.doc = doc;
        }
        current = current.children.get(segment)!;
      }
    }
  }

  const result = toNavNodes(root, lang, categoryMeta);
  navTreeCache.set(cacheKey, result);
  return result;
}

function toNavNodes(
  parent: BuildNode,
  lang: Locale,
  categoryMeta?: Map<string, CategoryMeta>,
  parentSortOrder?: "asc" | "desc",
): NavNode[] {
  const nodes: NavNode[] = [];

  for (const child of parent.children.values()) {
    const doc = child.doc;
    const meta = categoryMeta?.get(child.fullPath);
    const sortOrder = meta?.sortOrder ?? "asc";
    const children = toNavNodes(child, lang, categoryMeta, sortOrder);

    nodes.push({
      slug: child.fullPath,
      label:
        doc?.data.sidebar_label ?? doc?.data.title ?? meta?.label ?? toTitleCase(child.segment),
      description: doc?.data.description ?? meta?.description,
      position: doc?.data.sidebar_position ?? meta?.position ?? 999,
      href: meta?.noPage
        ? undefined
        : doc || children.length > 0
          ? docsUrl(child.fullPath, lang)
          : undefined,
      hasPage: !!doc,
      children,
      sortOrder,
    });
  }

  // Use the PARENT's sortOrder to sort these sibling nodes
  const order = parentSortOrder ?? "asc";
  nodes.sort((a, b) => {
    const posCompare = a.position - b.position;
    if (posCompare !== 0) return order === "desc" ? -posCompare : posCompare;
    const slugCompare = a.slug.localeCompare(b.slug);
    return order === "desc" ? -slugCompare : slugCompare;
  });

  return nodes;
}

/**
 * Group "satellite" nodes under their primary node based on slug prefixes.
 * E.g. with prefix "claude", nodes "claude-md", "claude-commands" get moved
 * under the "claude" node as children.
 */
export function groupSatelliteNodes(tree: NavNode[], prefixes: string[]): NavNode[] {
  const result = [...tree];
  for (const prefix of prefixes) {
    const primaryIdx = result.findIndex((n) => n.slug === prefix);
    if (primaryIdx < 0) continue;
    const primary = result[primaryIdx];
    const satelliteIdxs: number[] = [];
    for (let i = 0; i < result.length; i++) {
      if (i !== primaryIdx && result[i].slug.startsWith(`${prefix}-`)) {
        satelliteIdxs.push(i);
      }
    }
    if (satelliteIdxs.length === 0) continue;
    const extraChildren: NavNode[] = [];
    for (const idx of satelliteIdxs) {
      extraChildren.push(result[idx]);
    }
    result[primaryIdx] = {
      ...primary,
      children: [...primary.children, ...extraChildren],
    };
    for (const idx of satelliteIdxs.reverse()) {
      result.splice(idx, 1);
    }
  }
  return result;
}

/** DFS flatten the tree for prev/next navigation. Only includes nodes with pages. */
export function flattenTree(nodes: NavNode[]): NavNode[] {
  const result: NavNode[] = [];
  flattenInto(nodes, result);
  return result;
}

function flattenInto(nodes: NavNode[], acc: NavNode[]): void {
  for (const node of nodes) {
    if (node.hasPage) {
      acc.push(node);
    }
    flattenInto(node.children, acc);
  }
}

/** Collect all category nodes that have children but no page (no index.mdx).
 *  Nodes without href (e.g. noPage categories) are skipped — they are toggle-only. */
export function collectAutoIndexNodes(nodes: NavNode[]): NavNode[] {
  const result: NavNode[] = [];
  for (const node of nodes) {
    if (!node.hasPage && node.children.length > 0 && node.href) {
      result.push(node);
    }
    result.push(...collectAutoIndexNodes(node.children));
  }
  return result;
}

/** Find a node by slug anywhere in the tree. */
export function findNode(nodes: NavNode[], slug: string): NavNode | undefined {
  for (const node of nodes) {
    if (node.slug === slug) return node;
    const found = findNode(node.children, slug);
    if (found) return found;
  }
  return undefined;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/**
 * Build breadcrumb trail by walking the nav tree.
 */
export function buildBreadcrumbs(
  tree: NavNode[],
  slug: string,
  lang: Locale = defaultLocale,
): BreadcrumbItem[] {
  const parts = slug.split("/");
  const homeHref = lang === defaultLocale ? withBase("/") : withBase(`/${lang}/`);
  const crumbs: BreadcrumbItem[] = [{ label: "", href: homeHref }];
  let nodes = tree;

  for (let i = 0; i < parts.length; i++) {
    const partialSlug = parts.slice(0, i + 1).join("/");
    const node = nodes.find((n) => n.slug === partialSlug);
    if (!node) break;

    const isLast = i === parts.length - 1;
    crumbs.push({
      label: node.label,
      href: isLast ? undefined : node.href,
    });
    nodes = node.children;
  }

  return crumbs;
}

/**
 * Scan a content directory for _category_.json files and return a map
 * of relative paths to category metadata.
 * Results are memoized by contentDir.
 */
export function loadCategoryMeta(contentDir: string): Map<string, CategoryMeta> {
  const cached = categoryMetaCache.get(contentDir);
  if (cached) return cached;
  const result = new Map<string, CategoryMeta>();
  scanDir(contentDir, contentDir, result);
  categoryMetaCache.set(contentDir, result);
  return result;
}

function scanDir(baseDir: string, currentDir: string, result: Map<string, CategoryMeta>): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const fullPath = path.join(currentDir, entry.name);
      const categoryFile = path.join(fullPath, "_category_.json");
      if (fs.existsSync(categoryFile)) {
        try {
          const raw = fs.readFileSync(categoryFile, "utf-8");
          const parsed: unknown = JSON.parse(raw);
          if (typeof parsed === "object" && parsed !== null) {
            const obj = parsed as Record<string, unknown>;
            const meta: CategoryMeta = {
              label: typeof obj.label === "string" ? obj.label : undefined,
              position: typeof obj.position === "number" ? obj.position : undefined,
              description: typeof obj.description === "string" ? obj.description : undefined,
              sortOrder: obj.sortOrder === "asc" || obj.sortOrder === "desc" ? obj.sortOrder : undefined,
              noPage: obj.noPage === true ? true : undefined,
            };
            const relativePath = path.relative(baseDir, fullPath);
            result.set(relativePath, meta);
          }
        } catch {
          // skip invalid JSON
        }
      }
      scanDir(baseDir, fullPath, result);
    }
  }
}
