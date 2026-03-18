import { useState, useEffect } from "react";

interface SidebarToggleProps {
  children: React.ReactNode;
  bottomContent?: React.ReactNode;
}

export default function SidebarToggle({ children, bottomContent }: SidebarToggleProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close mobile sidebar on View Transition navigation
  useEffect(() => {
    function handleSwap() {
      setOpen(false);
    }
    document.addEventListener("astro:after-swap", handleSwap);
    return () => document.removeEventListener("astro:after-swap", handleSwap);
  }, []);

  return (
    <>
      {/* Hamburger button - visible only on mobile */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="lg:hidden px-hsp-sm py-vsp-xs -ml-hsp-sm mr-hsp-sm text-muted hover:text-fg"
        aria-label={open ? "Close sidebar" : "Open sidebar"}
      >
        {open ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-[1.5rem] w-[1.5rem]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-[1.5rem] w-[1.5rem]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        )}
      </button>

      {/* Backdrop overlay - mobile only */}
      {open && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.3)" }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar panel - mobile only (desktop sidebar is in doc-layout) */}
      <aside
        className={`
          fixed top-[3.5rem] left-0 z-40 h-[calc(100vh-3.5rem)] w-[16rem] flex flex-col
          border-r border-muted bg-bg transition-transform duration-200
          lg:hidden
          ${open ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
        {bottomContent && (
          <div className="border-t border-muted px-hsp-lg py-vsp-md flex items-center gap-x-hsp-md">
            {bottomContent}
          </div>
        )}
      </aside>
    </>
  );
}
