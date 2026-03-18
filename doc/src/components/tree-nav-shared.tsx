// Shared constants and primitives for sidebar-tree and site-tree-nav

// Indentation — fluid clamp values
export const INDENT = "clamp(0.8rem, 1.2vw, 1.625rem)";
export const CONNECTOR_OFFSET = "clamp(0.2rem, 0.3vw, 0.5rem)";
export const CONNECTOR_WIDTH = "clamp(0.4rem, 0.6vw, 1rem)";
export const BASE_PAD = "clamp(0.4rem, 0.8vw, 1.3rem)";

export function connectorLeft(depth: number): string {
  return `calc(${depth} * ${INDENT} + ${CONNECTOR_OFFSET})`;
}

const CATEGORY_LINK_PATH =
  "M5.746 5.74 0 11.49l20.987 20.96C34.126 45.572 41.963 53.45 41.948 53.523c-.012.062-9.456 9.544-20.986 21.07L0 95.55l5.714 5.715c3.142 3.143 5.748 5.715 5.79 5.715s2.63-2.563 5.75-5.696l17.939-18.001c21.867-21.94 29.443-29.599 29.443-29.768 0-.114-.665-.804-5.084-5.275C51.872 40.47 11.71.125 11.565.036 11.525.01 8.906 2.578 5.746 5.74m38.345-.066c-3.132 3.13-5.696 5.71-5.696 5.732-.001.022 2.16 2.185 4.8 4.807 2.641 2.623 8.382 8.338 12.758 12.702 15.38 15.337 23.763 23.641 24.314 24.086.19.153.346.336.346.405 0 .07-1.738 1.847-3.887 3.976a17515 17515 0 0 0-20.35 20.264 19555 19555 0 0 1-17.223 17.158c-.416.409-.757.77-.757.8 0 .083 11.415 11.485 11.457 11.445.235-.22 53.542-53.528 53.542-53.543C103.395 53.472 49.891.02 49.837 0c-.028-.01-2.613 2.543-5.746 5.674";

export function CategoryLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      viewBox="0 0 103.395 107.049"
      aria-hidden="true"
      className={`shrink-0 ${className ?? ""}`}
    >
      <path d={CATEGORY_LINK_PATH} />
    </svg>
  );
}

export function ConnectorLines({ depth, isLast, widthScale = 1 }: { depth: number; isLast: boolean; widthScale?: number }) {
  if (depth === 0) return null;
  const left = connectorLeft(depth);
  const width = widthScale === 1 ? CONNECTOR_WIDTH : `calc(${CONNECTOR_WIDTH} * ${widthScale})`;
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
          width,
          top: "50%",
        }}
      />
    </>
  );
}
