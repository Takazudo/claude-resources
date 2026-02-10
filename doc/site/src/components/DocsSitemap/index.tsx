import React, { type ReactNode } from "react";
import useBaseUrl from "@docusaurus/useBaseUrl";
import sidebars from "@site/sidebars";
import docTitles from "@site/src/data/doc-titles.json";

type SidebarItem =
  | string
  | {
      type: "category";
      label: string;
      collapsed?: boolean;
      link?: { type: string; id: string };
      items: SidebarItem[];
    }
  | {
      type: "doc";
      id: string;
      label?: string;
    };

function DocLink({ docId }: { docId: string }): ReactNode {
  const baseUrl = useBaseUrl("/docs/");
  const title = (docTitles as Record<string, string>)[docId] || docId;
  const href = `${baseUrl}${docId}`;
  return (
    <li style={{ margin: "0.2rem 0" }}>
      <a href={href} style={{ color: "var(--ifm-font-color-base)" }}>
        {title}
      </a>
    </li>
  );
}

function CategorySection({
  item,
}: {
  item: SidebarItem;
}): ReactNode {
  if (typeof item === "string") {
    return <DocLink docId={item} />;
  }

  if ("type" in item && item.type === "doc") {
    return <DocLink docId={item.id} />;
  }

  if ("type" in item && item.type === "category") {
    const linkId = item.link?.type === "doc" ? item.link.id : null;
    const baseUrl = useBaseUrl("/docs/");

    return (
      <li style={{ margin: "0.5rem 0" }}>
        <details open style={{ margin: 0 }}>
          <summary
            style={{
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "1.1rem",
              padding: "0.3rem 0",
              listStyle: "none",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span
              style={{
                display: "inline-block",
                transition: "transform 0.2s",
                fontSize: "0.7rem",
              }}
              className="sitemap-chevron"
            >
              ▶
            </span>
            {linkId ? (
              <a
                href={`${baseUrl}${linkId}`}
                style={{ color: "var(--ifm-font-color-base)" }}
              >
                {item.label}
              </a>
            ) : (
              item.label
            )}
          </summary>
          <ul style={{ listStyle: "none", paddingLeft: "1.2rem", margin: 0 }}>
            {item.items.map((child, i) => (
              <CategorySection key={i} item={child} />
            ))}
          </ul>
        </details>
      </li>
    );
  }

  return null;
}

function SidebarSection({
  sidebarId,
  items,
}: {
  sidebarId: string;
  items: SidebarItem[];
}): ReactNode {
  const label = sidebarId.replace(/Sidebar$/, "");
  const displayLabel = label.charAt(0).toUpperCase() + label.slice(1);

  return (
    <section style={{ marginBottom: "2rem" }}>
      <h2 style={{ borderBottom: "2px solid var(--ifm-color-primary)", paddingBottom: "0.3rem" }}>
        {displayLabel}
      </h2>
      <ul style={{ listStyle: "none", paddingLeft: 0, margin: 0 }}>
        {items.map((item, i) => (
          <CategorySection key={i} item={item} />
        ))}
      </ul>
    </section>
  );
}

export default function DocsSitemap(): ReactNode {
  return (
    <div>
      <style>{`
        details[open] > summary .sitemap-chevron {
          transform: rotate(90deg);
        }
        details > summary::-webkit-details-marker {
          display: none;
        }
        details > summary::marker {
          display: none;
          content: "";
        }
        .docsSitemap a:hover {
          color: var(--ifm-color-primary) !important;
          text-decoration: underline;
        }
      `}</style>
      <div className="docsSitemap">
        {Object.entries(sidebars as Record<string, SidebarItem[]>).map(
          ([sidebarId, items]) => (
            <SidebarSection key={sidebarId} sidebarId={sidebarId} items={items} />
          )
        )}
      </div>
    </div>
  );
}
