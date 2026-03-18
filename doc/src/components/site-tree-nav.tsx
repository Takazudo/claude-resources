import { useState } from "react";
import type { NavNode } from "@/utils/docs";
import { INDENT, connectorLeft, ConnectorLines, CategoryLinkIcon } from "./tree-nav-shared";

// site-tree-nav uses wider padding than the narrow sidebar
const SITE_BASE_PAD = "clamp(0.5rem, 0.8vw, 1rem)";

function padLeft(depth: number): string {
  if (depth === 0) return SITE_BASE_PAD;
  return `calc(${depth} * ${INDENT} + 1.25rem + 5px)`;
}

function reorderTree(tree: NavNode[], order: string[]): NavNode[] {
  const map = new Map(tree.map((node) => [node.slug, node]));
  const ordered: NavNode[] = [];
  for (const slug of order) {
    const node = map.get(slug);
    if (node) {
      ordered.push(node);
      map.delete(slug);
    }
  }
  // append unmatched nodes at end
  for (const node of map.values()) {
    ordered.push(node);
  }
  return ordered;
}

interface SiteTreeNavProps {
  tree: NavNode[];
  ariaLabel?: string;
  categoryOrder?: string[];
  categoryIgnore?: string[];
}

export default function SiteTreeNav({
  tree,
  ariaLabel = "Site index",
  categoryOrder,
  categoryIgnore,
}: SiteTreeNavProps) {
  let processedTree = tree;
  if (categoryIgnore) {
    const ignoreSet = new Set(categoryIgnore);
    processedTree = processedTree.filter((node) => !ignoreSet.has(node.slug));
  }
  if (categoryOrder) {
    processedTree = reorderTree(processedTree, categoryOrder);
  }
  return (
    <nav
      aria-label={ariaLabel}
      data-site-nav
      className="grid gap-vsp-md"
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(min(18rem, 100%), 1fr))",
      }}
    >
      {processedTree.map((node) => (
        <div key={node.slug} className="min-w-0 border border-muted pl-hsp-sm py-vsp-2xs">
          {node.children.length > 0 ? (
            <CategoryNode node={node} depth={0} isLast={true} />
          ) : (
            <LeafNode node={node} depth={0} isLast={true} />
          )}
        </div>
      ))}
    </nav>
  );
}

function NodeList({ nodes, depth }: { nodes: NavNode[]; depth: number }) {
  return (
    <>
      {nodes.map((node, index) => {
        const isLast = index === nodes.length - 1;
        return node.children.length > 0 ? (
          <CategoryNode
            key={node.slug}
            node={node}
            depth={depth}
            isLast={isLast}
          />
        ) : (
          <LeafNode
            key={node.slug}
            node={node}
            depth={depth}
            isLast={isLast}
          />
        );
      })}
    </>
  );
}

function CategoryNode({
  node,
  depth,
  isLast,
}: {
  node: NavNode;
  depth: number;
  isLast: boolean;
}) {
  const [open, setOpen] = useState(true);
  const toggle = () => setOpen((prev) => !prev);
  const paddingLeft = padLeft(depth);

  return (
    <div className={`${depth >= 1 && !isLast ? "relative" : ""}`}>
      {depth >= 1 && !isLast && open && (
        <div
          className="absolute border-l border-dashed border-muted z-10"
          style={{
            left: connectorLeft(depth),
            top: 0,
            bottom: 0,
          }}
        />
      )}
      <div className="relative">
        <ConnectorLines depth={depth} isLast={isLast} widthScale={2} />
        <div
          className="flex w-full items-center justify-between text-small font-semibold pt-[0.15rem] text-fg"
          style={{ paddingLeft }}
        >
          {node.href ? (
            <a
              href={node.href}
              className="flex-1 flex items-center gap-hsp-xs py-vsp-xs text-fg hover:text-accent hover:underline focus:underline"
            >
              {depth === 0 && <CategoryLinkIcon className="w-[18px] 2xl:w-[24px]" />}
              {node.label}
            </a>
          ) : (
            <button
              type="button"
              onClick={toggle}
              className="flex-1 py-vsp-xs text-left hover:text-accent hover:underline focus:underline"
            >
              {node.label}
            </button>
          )}
          <button
            type="button"
            onClick={toggle}
            className="aspect-square flex items-center justify-center w-[1.75rem] border-y border-l border-muted hover:underline focus:underline"
            aria-expanded={open}
            aria-label={open ? `Collapse ${node.label}` : `Expand ${node.label}`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-[0.75rem] w-[0.75rem] transition-transform duration-150 ${open ? "rotate-90" : ""} text-muted`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <div>
          <NodeList nodes={node.children} depth={depth + 1} />
        </div>
      )}
    </div>
  );
}

function LeafNode({
  node,
  depth,
  isLast,
}: {
  node: NavNode;
  depth: number;
  isLast: boolean;
}) {
  if (!node.href) return null;
  const isRoot = depth === 0;
  const paddingLeft = padLeft(depth);

  return (
    <div>
      <div className="relative">
        <ConnectorLines depth={depth} isLast={isLast} widthScale={2} />
        <a
          href={node.href}
          className={isRoot
            ? "block py-[calc(var(--spacing-vsp-xs)+0.15rem)] text-small font-semibold text-fg hover:text-accent hover:underline focus:underline"
            : `block py-vsp-2xs ${isLast ? "pb-vsp-xs" : ""} text-small text-fg hover:text-accent hover:underline focus:underline`
          }
          style={{ paddingLeft }}
        >
          {node.label}
        </a>
      </div>
    </div>
  );
}
