import React, { type ReactNode, useState, useMemo, useEffect } from 'react'
import DocSidebar from '@theme-original/DocSidebar'
import type DocSidebarType from '@theme/DocSidebar'
import type { WrapperProps } from '@docusaurus/types'
import type { PropSidebarItem } from '@docusaurus/plugin-content-docs'

type Props = WrapperProps<typeof DocSidebarType>

// Height of the search input area (padding + input + border)
const SEARCH_INPUT_HEIGHT = '57px'

// CSS to adjust sidebar scroll area below search input
const SIDEBAR_SCROLL_STYLE_ID = 'sidebar-scroll-fix-style'
const SIDEBAR_SCROLL_CSS = `
@media (min-width: 997px) {
  .theme-doc-sidebar-container [class*="sidebar_"] {
    margin-top: ${SEARCH_INPUT_HEIGHT} !important;
    height: calc(100vh - var(--ifm-navbar-height) - ${SEARCH_INPUT_HEIGHT}) !important;
    padding-top: 0 !important;
  }
  .theme-doc-sidebar-container .menu {
    height: 100% !important;
    max-height: 100% !important;
  }
}
`

export default function DocSidebarWrapper(props: Props): ReactNode {
  const [searchQuery, setSearchQuery] = useState('')

  // Adjust sidebar scroll area for search input height
  useEffect(() => {
    let styleEl = document.getElementById(SIDEBAR_SCROLL_STYLE_ID)
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = SIDEBAR_SCROLL_STYLE_ID
      styleEl.textContent = SIDEBAR_SCROLL_CSS
      document.head.appendChild(styleEl)
    }
    return () => {
      const el = document.getElementById(SIDEBAR_SCROLL_STYLE_ID)
      if (el) el.remove()
    }
  }, [])

  // Filter sidebar items based on search query
  const filteredSidebar = useMemo(() => {
    if (!searchQuery.trim() || !props.sidebar) {
      return props.sidebar
    }

    const query = searchQuery.toLowerCase()

    const filterItems = (items: PropSidebarItem[]): PropSidebarItem[] => {
      return items
        .map(item => {
          // Handle category items
          if (item.type === 'category') {
            const filteredChildren = filterItems(item.items)
            if (filteredChildren.length > 0) {
              return { ...item, items: filteredChildren }
            }
            // Also check if category label matches
            if (item.label?.toLowerCase().includes(query)) {
              return item
            }
            return null
          }

          // Handle doc/link items
          if (item.type === 'link' || item.type === 'doc') {
            const label = item.label?.toLowerCase() || ''
            if (label.includes(query)) {
              return item
            }
          }

          return null
        })
        .filter((item): item is PropSidebarItem => item !== null)
    }

    return filterItems(props.sidebar)
  }, [props.sidebar, searchQuery])

  return (
    <>
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--ifm-toc-border-color)',
          position: 'sticky',
          top: 'var(--ifm-navbar-height)',
          backgroundColor: 'var(--ifm-background-surface-color)',
          zIndex: 1,
        }}
      >
        <input
          type="text"
          placeholder="Filter docs..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            fontSize: '14px',
            border: '1px solid var(--ifm-color-emphasis-300)',
            borderRadius: '4px',
            backgroundColor: 'transparent',
            color: 'var(--ifm-font-color-base)',
          }}
        />
      </div>
      <DocSidebar {...props} sidebar={filteredSidebar} />
    </>
  )
}
