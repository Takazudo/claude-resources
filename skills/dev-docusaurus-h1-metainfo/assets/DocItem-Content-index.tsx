import React, { type ReactNode } from 'react';
import clsx from 'clsx';
import { ThemeClassNames } from '@docusaurus/theme-common';
import { useDoc } from '@docusaurus/plugin-content-docs/client';
import Heading from '@theme/Heading';
import MDXContent from '@theme/MDXContent';
import type { Props } from '@theme/DocItem/Content';

/**
 * Component to display document metadata (creation date, update date, author)
 * Rendered via SSR so metadata is available even with JavaScript disabled.
 */
function DocMetadata(): ReactNode {
  const { frontMatter, metadata } = useDoc();

  const creationDate = frontMatter.custom_creation_date as string | undefined;
  const lastUpdatedAt = metadata.lastUpdatedAt;
  const lastUpdatedBy = metadata.lastUpdatedBy;

  // Format the last updated date to match creation date format (YYYY/MM/DD)
  let formattedUpdateDate: string | undefined;
  let formattedCreationDate: string | undefined;

  if (lastUpdatedAt) {
    const date = new Date(lastUpdatedAt);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    formattedUpdateDate = `${year}/${month}/${day}`;

    // If no custom creation date from Git, use lastUpdatedAt as fallback
    if (!creationDate) {
      formattedCreationDate = formattedUpdateDate;
    }
  }

  // Use custom creation date from frontmatter if available
  if (creationDate) {
    formattedCreationDate = creationDate;
  }

  // Don't render anything if we have no metadata to show
  if (!formattedCreationDate && !lastUpdatedAt && !lastUpdatedBy) {
    return null;
  }

  return (
    <ul className="theme-doc-meta">
      {formattedCreationDate && (
        <li className="theme-doc-meta-created">
          <span>Created:</span>
          <time>{formattedCreationDate}</time>
        </li>
      )}
      {formattedUpdateDate && (
        <li className="theme-doc-meta-updated">
          <span>Updated:</span>
          <time dateTime={new Date(lastUpdatedAt!).toISOString()}>{formattedUpdateDate}</time>
        </li>
      )}
      {lastUpdatedBy && (
        <li className="theme-doc-meta-author">
          <span>Author:</span>
          <address>{lastUpdatedBy}</address>
        </li>
      )}
    </ul>
  );
}

/**
 Title can be declared inside md content or declared through
 front matter and added manually. To make both cases consistent,
 the added title is added under the same div.markdown block
 See https://github.com/facebook/docusaurus/pull/4882#issuecomment-853021120

 We render a "synthetic title" if:
 - user doesn't ask to hide it with front matter
 - the markdown content does not already contain a top-level h1 heading
*/
function useSyntheticTitle(): string | null {
  const { metadata, frontMatter, contentTitle } = useDoc();
  const shouldRender = !frontMatter.hide_title && typeof contentTitle === 'undefined';
  if (!shouldRender) {
    return null;
  }
  return metadata.title;
}

export default function DocItemContent({ children }: Props): ReactNode {
  const syntheticTitle = useSyntheticTitle();
  return (
    <div className={clsx(ThemeClassNames.docs.docMarkdown, 'markdown')}>
      {syntheticTitle && (
        <header>
          <Heading as="h1">{syntheticTitle}</Heading>
        </header>
      )}
      <DocMetadata />
      <MDXContent>{children}</MDXContent>
    </div>
  );
}
