import { useState, useMemo } from "react";
import type { Heading } from "@/types/heading";
import clsx from "clsx";

interface MobileTocProps {
  headings: Heading[];
  title?: string;
}

export function MobileToc({ headings, title = "On this page" }: MobileTocProps) {
  const filtered = useMemo(
    () => headings.filter((h) => h.depth >= 2 && h.depth <= 4),
    [headings],
  );
  const [open, setOpen] = useState(false);

  if (filtered.length === 0) return <div className="hidden" />;

  return (
    <div className="xl:hidden border border-muted mb-vsp-lg">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-hsp-lg py-vsp-xs text-small font-medium text-fg"
      >
        <span>{title}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className={clsx(
            "h-[1rem] w-[1rem] text-muted transition-transform duration-150",
            open && "rotate-180",
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {open && (
        <ul className="border-t border-muted px-hsp-lg py-vsp-xs space-y-vsp-2xs">
          {filtered.map((heading, index) => (
            <li
              key={`${heading.slug}-${index}`}
              className={clsx(
                heading.depth === 3 && "ml-hsp-lg",
                heading.depth === 4 && "ml-hsp-2xl",
              )}
            >
              <a
                href={`#${heading.slug}`}
                onClick={() => setOpen(false)}
                className="block py-vsp-2xs text-small text-muted hover:text-fg hover:underline"
              >
                {heading.text}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
