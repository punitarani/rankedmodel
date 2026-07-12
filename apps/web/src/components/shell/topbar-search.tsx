import { searchModels } from '@rankedmodel/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { ModelTag } from '#/components/model-tag'
import { catalogQueryOptions } from '#/lib/catalog'

/**
 * Design topbar search: instant dropdown (top 8 models over name+org+family) with
 * `/` focus shortcut, ↑↓/Enter keyboard nav, Esc to close. Enter with no highlight
 * goes to the full /search page (D13).
 */
export function TopbarSearch() {
  const { data } = useSuspenseQuery(catalogQueryOptions)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const results = searchModels(data.models, q)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = document.activeElement
      if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(target?.tagName ?? '')) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const go = (slug: string) => {
    setQ('')
    navigate({ to: '/models/$slug', params: { slug } })
  }

  return (
    <div className="relative ml-auto max-w-[420px] flex-1">
      <input
        ref={inputRef}
        type="text"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setCursor(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setQ('')
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setCursor((c) => Math.min(results.length - 1, c + 1))
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            setCursor((c) => Math.max(0, c - 1))
          }
          if (e.key === 'Enter' && q.trim()) {
            const hit = results[cursor]
            if (hit) go(hit.slug)
            else {
              setQ('')
              navigate({ to: '/search', search: { q } })
            }
          }
        }}
        placeholder="Search models, orgs…  ( / )"
        aria-label="Search models and organizations"
        className="w-full rounded-[7px] border border-border bg-panel2 px-[11px] py-1.5 text-[12.5px] text-text outline-none focus:border-acc"
        data-testid="topbar-search"
      />
      {results.length > 0 && (
        <div
          className="absolute top-[34px] right-0 left-0 animate-fadeup overflow-hidden rounded-lg border border-border2 bg-panel shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
          data-testid="search-dropdown"
        >
          {results.map((m, i) => (
            <button
              key={m.slug}
              type="button"
              // mousedown beats input blur ordering
              onMouseDown={(e) => {
                e.preventDefault()
                go(m.slug)
              }}
              className={`flex w-full cursor-pointer items-baseline gap-2 border-b border-border px-3 py-2 text-left ${
                i === cursor ? 'bg-hover' : ''
              }`}
            >
              <span className="text-[12.5px] font-semibold">{m.name}</span>
              <span className="text-[11px] text-mut">{m.org}</span>
              <span className="ml-auto">
                <ModelTag open={m.open} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
