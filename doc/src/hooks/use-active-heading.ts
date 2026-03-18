import { useCallback, useEffect, useRef, useState } from "react";
import type { Heading } from "@/types/heading";

const SCROLL_MARGIN_TOP = 80;
const DEBOUNCE_MS = 200;

function getActiveHeadingId(
  headingIds: string[],
  elementMap: Map<string, HTMLElement>,
): string | null {
  if (headingIds.length === 0) return null;

  const viewportHeight = window.innerHeight;

  let firstVisibleIndex = -1;
  for (let i = 0; i < headingIds.length; i++) {
    const el = elementMap.get(headingIds[i]);
    if (!el) continue;
    const { top } = el.getBoundingClientRect();
    if (top >= SCROLL_MARGIN_TOP) {
      firstVisibleIndex = i;
      break;
    }
  }

  if (firstVisibleIndex === -1) {
    return headingIds[headingIds.length - 1];
  }

  if (firstVisibleIndex === 0) {
    const el = elementMap.get(headingIds[0]);
    if (el) {
      const { top } = el.getBoundingClientRect();
      if (top < viewportHeight / 2) {
        return headingIds[0];
      }
    }
    return null;
  }

  const el = elementMap.get(headingIds[firstVisibleIndex]);
  if (el) {
    const { top } = el.getBoundingClientRect();
    if (top < viewportHeight / 2) {
      return headingIds[firstVisibleIndex];
    }
  }

  return headingIds[firstVisibleIndex - 1];
}

interface UseActiveHeadingResult {
  activeId: string | null;
  activate: (id: string) => void;
}

export function useActiveHeading(
  headings: Heading[],
): UseActiveHeadingResult {
  const [activeId, setActiveId] = useState<string | null>(null);
  const headingIdsRef = useRef<string[]>([]);
  const elementMapRef = useRef<Map<string, HTMLElement>>(new Map());
  const suppressedRef = useRef(false);

  const activate = useCallback((id: string) => {
    setActiveId(id);
    suppressedRef.current = true;
    // Safety timeout: unsuppress if no scroll event fires (target already in view)
    setTimeout(() => {
      suppressedRef.current = false;
    }, 2000);
  }, []);

  useEffect(() => {
    const ids = headings.map((h) => h.slug);
    headingIdsRef.current = ids;

    const map = new Map<string, HTMLElement>();
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) map.set(id, el);
    }
    elementMapRef.current = map;

    let timerId: ReturnType<typeof setTimeout> | null = null;

    function update() {
      timerId = null;
      setActiveId(
        getActiveHeadingId(headingIdsRef.current, elementMapRef.current),
      );
    }

    let fallbackTimerId: ReturnType<typeof setTimeout> | null = null;

    function onScroll() {
      if (suppressedRef.current) {
        // Fallback for browsers without scrollend (Safari < 18)
        if (fallbackTimerId !== null) clearTimeout(fallbackTimerId);
        fallbackTimerId = setTimeout(onScrollEnd, 1500);
        return;
      }
      if (timerId !== null) clearTimeout(timerId);
      timerId = setTimeout(update, DEBOUNCE_MS);
    }

    function onScrollEnd() {
      suppressedRef.current = false;
      if (fallbackTimerId !== null) {
        clearTimeout(fallbackTimerId);
        fallbackTimerId = null;
      }
      if (timerId !== null) clearTimeout(timerId);
      update();
    }

    update();

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    window.addEventListener("scrollend", onScrollEnd, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scrollend", onScrollEnd);
      if (timerId !== null) clearTimeout(timerId);
      if (fallbackTimerId !== null) clearTimeout(fallbackTimerId);
    };
  }, [headings]);

  return { activeId, activate };
}
