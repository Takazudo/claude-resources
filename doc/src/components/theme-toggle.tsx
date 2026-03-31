import { useState, useEffect } from "react";

const STORAGE_KEY = "zudo-doc-theme";

function SunIcon() {
  return (
    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

interface ThemeToggleProps {
  defaultMode?: "light" | "dark";
}

export default function ThemeToggle({ defaultMode = "dark" }: ThemeToggleProps) {
  const [mode, setMode] = useState<"light" | "dark">(defaultMode);

  useEffect(() => {
    const actual = (document.documentElement.getAttribute("data-theme") as "light" | "dark") || defaultMode;
    if (actual !== mode) {
      setMode(actual);
    }
  }, []);

  function toggle() {
    const next = mode === "dark" ? "light" : "dark";
    setMode(next);
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.style.colorScheme = next;
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    window.dispatchEvent(new CustomEvent("color-scheme-changed"));
  }

  const nextMode = mode === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${nextMode} mode`}
      className="text-muted hover:text-fg transition-colors p-hsp-sm focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
    >
      {mode === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
