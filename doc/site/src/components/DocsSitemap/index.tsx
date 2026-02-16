import { Fragment, type ReactNode } from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import sidebars from '@site/sidebars';
import docTitles from '@site/src/data/doc-titles.json';
import styles from './styles.module.css';

type SidebarItem =
  | string
  | {
      type: 'category';
      label: string;
      collapsed?: boolean;
      link?: { type: string; id: string };
      items: SidebarItem[];
    }
  | {
      type: 'doc';
      id: string;
      label?: string;
    };

/**
 * Convert a doc ID to a proper Docusaurus URL path.
 * Docusaurus routes index docs to the parent directory URL,
 * e.g. "overview/index" -> "overview", not "overview/index".
 */
function docIdToUrl(docsBaseUrl: string, docId: string): string {
  const path = docId.replace(/\/index$/, '');
  return `${docsBaseUrl}${path}`;
}

function generateLabel(sidebarId: string): string {
  return sidebarId
    .replace(/Sidebar$/i, '')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .toUpperCase();
}

function renderSidebarItems(items: SidebarItem[], docsBaseUrl: string): ReactNode {
  return (
    <Fragment>
      {items.map((item, idx) => {
        if (typeof item === 'string') {
          const titles = docTitles as Record<string, string>;
          const title = titles[item] || item;
          return (
            <ul key={`str-${idx}`} className={styles.pageList}>
              <li>
                <a href={docIdToUrl(docsBaseUrl, item)}>{title}</a>
              </li>
            </ul>
          );
        }
        if (item.type === 'category' && item.items) {
          const linkId = item.link?.type === 'doc' ? item.link.id : null;
          return (
            <div key={`cat-${idx}`} className={styles.categorySection}>
              <h3 className={styles.categoryTitle}>
                {linkId ? (
                  <a href={docIdToUrl(docsBaseUrl, linkId)}>{item.label}</a>
                ) : (
                  item.label || 'Category'
                )}
              </h3>
              {renderSidebarItems(item.items, docsBaseUrl)}
            </div>
          );
        }
        if (item.type === 'doc' && item.id) {
          const titles = docTitles as Record<string, string>;
          const title = titles[item.id] || item.label || item.id;
          return (
            <ul key={`doc-${idx}`} className={styles.pageList}>
              <li>
                <a href={docIdToUrl(docsBaseUrl, item.id)}>{title}</a>
              </li>
            </ul>
          );
        }
        return null;
      })}
    </Fragment>
  );
}

export default function DocsSitemap(): ReactNode {
  const docsBaseUrl = useBaseUrl('/docs/');
  const sidebarEntries = Object.entries(sidebars) as Array<[string, SidebarItem[]]>;

  return (
    <div className={styles.sitemap}>
      {sidebarEntries.map(([sidebarId, items]) => (
        <details key={sidebarId} className={styles.sidebarSection} open>
          <summary className={styles.sidebarTitle}>
            <span className={styles.chevron}>&#9654;</span>
            {generateLabel(sidebarId)}
          </summary>
          <div className={styles.sidebarContent}>
            {Array.isArray(items) ? renderSidebarItems(items, docsBaseUrl) : null}
          </div>
        </details>
      ))}
    </div>
  );
}
