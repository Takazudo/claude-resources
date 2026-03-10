import { useMemo } from "react";
import { useActiveHeading } from "@/hooks/use-active-heading";
import type { Heading } from "@/types/heading";

interface TocProps {
  headings: Heading[];
}

export function Toc({ headings }: TocProps) {
  const filtered = useMemo(
    () => headings.filter((h) => h.depth >= 2 && h.depth <= 4),
    [headings],
  );
  const { activeId, activate } = useActiveHeading(filtered);

  if (filtered.length === 0) return <nav className="hidden" />;

  return (
    <nav
      aria-label="Table of contents"
      className={[
        "hidden xl:block",
        "w-[280px] shrink-0",
        "sticky top-[3.5rem] self-start",
        "pt-vsp-xl lg:pt-vsp-2xl",
        "max-h-[calc(100vh-3.5rem)] overflow-y-auto",
      ].join(" ")}
    >
      <ul className="border-l border-muted pl-hsp-lg">
        {filtered.map((heading, index) => {
          const isActive = heading.slug === activeId;
          return (
            <li
              key={`${heading.slug}-${index}`}
              className={[
                heading.depth === 3 ? "ml-hsp-lg" : "",
                heading.depth === 4 ? "ml-hsp-2xl" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <a
                href={`#${heading.slug}`}
                onClick={() => activate(heading.slug)}
                aria-current={isActive ? "true" : undefined}
                className={[
                  "block py-vsp-2xs text-small leading-snug transition-colors",
                  isActive
                    ? "bg-fg text-bg font-medium"
                    : "text-muted hover:underline focus:underline",
                ].join(" ")}
              >
                {heading.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
