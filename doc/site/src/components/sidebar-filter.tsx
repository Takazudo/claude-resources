import { useState, useMemo, useCallback, useEffect } from "react";

export interface SidebarItem {
  id: string;
  label: string;
  href: string;
}

export interface SidebarSection {
  key: string;
  label: string;
  items: SidebarItem[];
}

interface SidebarFilterProps {
  sections: SidebarSection[];
  currentPath?: string;
}

const STORAGE_KEY = "ccdoc-sidebar-open";

// Sidebar indentation — fluid with clamp() (copied from zudoc sidebar-tree)
const BASE_PAD = "clamp(0.4rem, 0.8vw, 1.3rem)";
const INDENT = "clamp(0.8rem, 1.2vw, 1.625rem)";
const CONNECTOR_OFFSET = "clamp(0.2rem, 0.3vw, 0.5rem)";
const CONNECTOR_WIDTH = "clamp(0.4rem, 0.6vw, 1rem)";

function padLeft(depth: number, forCategory: boolean): string {
  if (depth === 0) return `calc(${BASE_PAD} + ${forCategory ? "0.15rem" : "0rem"})`;
  return `calc(${depth} * ${INDENT} + 1.25rem + 5px)`;
}

function connectorLeft(depth: number): string {
  return `calc(${depth} * ${INDENT} + ${CONNECTOR_OFFSET})`;
}

function getOpenSet(): Set<string> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((v): v is string => typeof v === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

function saveOpenSet(set: Set<string>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

export default function SidebarFilter({
  sections,
  currentPath = "",
}: SidebarFilterProps) {
  const [query, setQuery] = useState("");

  const filteredSections = useMemo(() => {
    if (!query) return sections;
    const q = query.toLowerCase();
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) =>
          item.label.toLowerCase().includes(q),
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [sections, query]);

  return (
    <nav>
      {/* Filter input */}
      <div className="px-hsp-sm py-vsp-xs border-b border-muted">
        <div className="flex items-center gap-hsp-xs bg-surface rounded px-hsp-sm py-vsp-2xs">
          <svg
            className="h-[14px] w-[14px] text-muted shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Filter..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-transparent text-small outline-none w-full text-fg placeholder:text-muted"
          />
        </div>
      </div>

      {/* Overview link */}
      <div>
        <a
          href="/"
          className={`block py-[calc(var(--spacing-vsp-xs)+0.15rem)] text-small font-semibold ${
            currentPath === "/"
              ? "bg-fg text-bg"
              : "text-fg hover:underline focus:underline"
          }`}
          style={{ paddingLeft: padLeft(0, false) }}
        >
          Overview
        </a>
      </div>

      {/* Sections */}
      {filteredSections.map((section) => (
        <CollapsibleSection
          key={section.key}
          section={section}
          currentPath={currentPath}
          forceOpen={!!query}
        />
      ))}
    </nav>
  );
}

function ConnectorLines({ depth, isLast }: { depth: number; isLast: boolean }) {
  if (depth === 0) return null;
  const left = connectorLeft(depth);
  return (
    <>
      <div
        className="absolute border-l border-dashed border-muted"
        style={{
          left,
          top: 0,
          bottom: isLast ? "50%" : 0,
        }}
      />
      <div
        className="absolute border-t border-dashed border-muted"
        style={{
          left,
          width: CONNECTOR_WIDTH,
          top: "50%",
        }}
      />
    </>
  );
}

function CollapsibleSection({
  section,
  currentPath,
  forceOpen,
}: {
  section: SidebarSection;
  currentPath: string;
  forceOpen: boolean;
}) {
  const containsCurrent = section.items.some(
    (item) => item.href === currentPath,
  );

  // Start with SSR-safe default (only use containsCurrent which is deterministic)
  const [open, setOpen] = useState(containsCurrent);

  // On mount, restore from sessionStorage if stored
  useEffect(() => {
    const stored = getOpenSet();
    if (stored.has(section.key) && !open) {
      setOpen(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) {
      const stored = getOpenSet();
      if (!stored.has(section.key)) {
        stored.add(section.key);
        saveOpenSet(stored);
      }
    }
  }, [open, section.key]);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      const stored = getOpenSet();
      if (next) {
        stored.add(section.key);
      } else {
        stored.delete(section.key);
      }
      saveOpenSet(stored);
      return next;
    });
  }, [section.key]);

  const isExpanded = forceOpen || open;

  return (
    <div className="border-t border-muted">
      <div className="relative">
        {/* Section header */}
        <div
          className="flex w-full items-center justify-between text-small font-semibold py-[0.15rem] text-fg"
          style={{ paddingLeft: padLeft(0, true) }}
        >
          <button
            type="button"
            onClick={toggle}
            className="flex-1 py-vsp-xs text-left hover:underline focus:underline"
          >
            {section.label} ({section.items.length})
          </button>
          <button
            type="button"
            onClick={toggle}
            className="px-hsp-md py-vsp-xs hover:underline focus:underline"
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-[1rem] w-[1rem] transition-transform duration-150 ${isExpanded ? "rotate-90" : ""} text-muted`}
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

      {/* Section items */}
      {isExpanded && (
        <div>
          {section.items.map((item, index) => {
            const isActive = item.href === currentPath;
            const isLast = index === section.items.length - 1;
            return (
              <div key={item.id}>
                <div className="relative">
                  <ConnectorLines depth={1} isLast={isLast} />
                  <a
                    href={item.href}
                    className={`block py-vsp-2xs ${isLast ? "pb-vsp-xs" : ""} text-small ${
                      isActive
                        ? "bg-fg font-medium text-bg"
                        : "text-muted hover:underline focus:underline"
                    }`}
                    style={{ paddingLeft: padLeft(1, false) }}
                  >
                    {item.label}
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
