import {
  type CapabilityKey,
  type ExplorerQuery,
  type ExplorerSort,
  fmtCtx,
  fmtDate,
  fmtParams,
  fmtPrice,
  SIZE_CLASS_LABELS,
  type SnapshotModel,
  selectExplorer,
  selectOrgs,
} from '@rankedmodel/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef, useState } from 'react'
import { InlineBar } from '#/components/charts/inline-bar'
import { normPct, ratingWindow } from '#/components/charts/scales'
import { FilterSelect } from '#/components/filter-select'
import { ModelTag } from '#/components/model-tag'
import { SearchSelect } from '#/components/search-select'
import { Segmented } from '#/components/segmented'
import { catalogQueryOptions } from '#/lib/catalog'
import { CAP_CODES, type ExplorerSearch } from '#/lib/search'

/** Card min-width (px) and grid gap (px) — must match the CSS `minmax(270px,1fr)` + `gap-[11px]`
 *  below, so the virtualized lane count matches the SSR auto-fill grid exactly (no reflow on mount). */
const CARD_MIN_WIDTH = 270
const GRID_GAP = 11

/** Uniform card height (px, matches the `h-[176px]` on every card). Cards are forced to one fixed
 *  height with overflow-hidden, so all cards are identical AND the fixed-height virtualizer's row
 *  stride is exact — it can never under-measure and draw the next row over a taller one (the
 *  original collision bug, where a 148px estimate lost to cards that wrapped to two tag rows). */
const CARD_H = 176
const CARD_HEIGHT = CARD_H + GRID_GAP

/**
 * Lane count for the virtualized grid, computed to exactly match the CSS
 * `repeat(auto-fill, minmax(270px,1fr))` column count: `floor((content + gap) / (card + gap))`.
 * Virtualizing a responsive auto-fill grid needs a DETERMINISTIC lane count (a virtual "row"
 * = one grid row of N cards); deriving it from the same formula the browser uses means the
 * post-mount grid never reflows to a different column count than the SSR/first paint.
 */
function laneCountFor(width: number): number {
  const contentWidth = width - 228 - 48 // minus filter rail + page padding
  return Math.max(1, Math.floor((contentWidth + GRID_GAP) / (CARD_MIN_WIDTH + GRID_GAP)))
}

/** The 5 filter chips exactly as the design's rail lists them. */
const CAP_CHIPS: { code: keyof typeof CAP_CODES; label: string }[] = [
  { code: 'reason', label: 'Reasoning' },
  { code: 'vision', label: 'Vision' },
  { code: 'fc', label: 'Function calling' },
  { code: 'tools', label: 'Tool use' },
  { code: 'agent', label: 'Agentic' },
]

const CAP_LABELS: Record<CapabilityKey, string> = {
  reasoning: 'Reasoning',
  coding: 'Coding',
  vision: 'Vision',
  functionCalling: 'Function calling',
  toolUse: 'Tool use',
  agentic: 'Agentic',
}

export function ExplorerScreen({
  search,
  navigateSearch,
}: {
  search: ExplorerSearch
  navigateSearch: (patch: Partial<ExplorerSearch>) => void
}) {
  const { data } = useSuspenseQuery(catalogQueryOptions)
  const orgs = useMemo(() => selectOrgs(data.models), [data.models])
  const activeCaps = search.caps
    .split(',')
    .filter((c): c is keyof typeof CAP_CODES => c in CAP_CODES)
  // Re-run the (whole-catalog) filter/sort only when an input actually changes, not on every
  // keystroke-triggered URL update / re-render. Deps are the raw search strings (stable), not
  // the per-render `activeCaps` array.
  const rows = useMemo(() => {
    const query: ExplorerQuery = {
      q: search.q,
      org: search.org,
      open: search.open,
      size: search.size,
      gpu: search.gpu,
      caps: search.caps
        .split(',')
        .filter((c): c is keyof typeof CAP_CODES => c in CAP_CODES)
        .map((c) => CAP_CODES[c]),
      sort: search.sort as ExplorerSort,
    }
    return selectExplorer(data.models, query, data.gpus)
  }, [
    data.models,
    data.gpus,
    search.q,
    search.org,
    search.open,
    search.size,
    search.gpu,
    search.caps,
    search.sort,
  ])

  // Virtualize only after mount (same SSR-safety pattern as the rankings table): the first
  // paint renders the full, non-virtualized grid so there's no client/server size mismatch
  // and the page stays fully crawlable; the client then switches to a lane-virtualized
  // render for smooth scrolling over what can be several hundred cards.
  const [mounted, setMounted] = useState(false)
  const [lanes, setLanes] = useState(1)
  useEffect(() => {
    setMounted(true)
    const update = () => setLanes(laneCountFor(window.innerWidth))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  const listRef = useRef<HTMLDivElement>(null)
  const laneRows = Math.ceil(rows.length / lanes)
  const rowVirtualizer = useWindowVirtualizer({
    count: laneRows,
    estimateSize: () => CARD_HEIGHT,
    overscan: 3,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  })

  const toggleCap = (code: keyof typeof CAP_CODES) => {
    const next = activeCaps.includes(code)
      ? activeCaps.filter((c) => c !== code)
      : [...activeCaps, code]
    navigateSearch({ caps: next.join(',') })
  }

  const FacetLabel = ({ children }: { children: React.ReactNode }) => (
    <div className="mb-[7px] font-mono text-[9.5px] uppercase tracking-[0.07em] text-dim">
      {children}
    </div>
  )

  // Elo bars are relative to the rendered field (D21): the rating has no fixed 0–100 domain.
  const eloWindow = useMemo(
    () => ratingWindow(rows.filter((m) => Object.keys(m.bench).length > 0).map((m) => m.index)),
    [rows],
  )

  const renderCard = (m: SnapshotModel) => (
    <Link
      key={m.slug}
      to="/models/$slug"
      params={{ slug: m.slug }}
      className="flex h-[176px] cursor-pointer flex-col gap-2 overflow-hidden rounded-[10px] border border-border bg-card p-[13px] px-[15px] text-text no-underline hover:border-border2 hover:bg-hover hover:no-underline"
      data-testid="explorer-card"
    >
      <div className="flex items-baseline gap-2">
        <div className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13.5px] font-semibold">
          {m.name}
        </div>
        <ModelTag open={m.open} />
      </div>
      <div className="truncate text-[11.5px] text-mut">
        {m.org} · {fmtDate(m.date)}
      </div>
      <div className="flex gap-3 overflow-hidden whitespace-nowrap font-mono text-[10.5px] text-mut">
        <span>{fmtParams(m.params, m.active)}</span>
        <span>{fmtCtx(m.ctxK)} ctx</span>
        <span>{fmtPrice(m.price, m.open)}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <InlineBar
          pct={Object.keys(m.bench).length > 0 ? normPct(m.index, eloWindow.min, eloWindow.max) : 0}
          height={4}
          className="flex-1"
        />
        <span
          className="font-mono text-[11px] font-semibold"
          style={{ color: m.ranked ? 'var(--text)' : 'var(--mut)' }}
          title={m.ranked ? undefined : 'Too few benchmark results to rank'}
        >
          {/* An unrated 0-benchmark model reads '—', not a misleading '0.0' (D20). */}
          {Object.keys(m.bench).length > 0 ? m.index.toFixed(1) : '—'}
        </span>
      </div>
      {/* Tag area fills the remaining card height (content-start keeps rows top-aligned); the card's
          fixed height + overflow-hidden guarantees a uniform card even when caps wrap to two rows. */}
      <div className="flex flex-1 flex-wrap content-start gap-1 overflow-hidden">
        {(Object.keys(m.caps) as CapabilityKey[])
          .filter((k) => m.caps[k] && k !== 'coding')
          .slice(0, 5)
          .map((k) => (
            <span
              key={k}
              className="h-fit rounded border border-border px-1.5 py-px text-[10px] text-mut"
            >
              {CAP_LABELS[k]}
            </span>
          ))}
      </div>
    </Link>
  )

  return (
    <div className="flex animate-fadeup items-start">
      {/* filter rail */}
      <div className="sticky top-[49px] flex h-[calc(100vh-49px)] w-[228px] flex-none flex-col gap-4 overflow-y-auto border-r border-border px-4 pt-[18px] pb-8">
        <input
          type="text"
          value={search.q}
          onChange={(e) => navigateSearch({ q: e.target.value })}
          placeholder="Filter models…"
          className="rounded-md border border-border bg-panel2 px-[9px] py-1.5 text-xs text-text outline-none focus:border-acc"
          data-testid="explorer-filter"
        />
        <div>
          <FacetLabel>Weights</FacetLabel>
          <Segmented
            grow
            value={search.open}
            options={[
              { value: 'all', label: 'All' },
              { value: 'open', label: 'Open' },
              { value: 'closed', label: 'Closed' },
            ]}
            onChange={(open) => navigateSearch({ open })}
          />
        </div>
        <div>
          <FacetLabel>Organization</FacetLabel>
          <SearchSelect
            value={search.org}
            onValueChange={(org) => navigateSearch({ org })}
            options={[
              { value: 'all', label: 'All orgs' },
              ...orgs.map((o) => ({ value: o.slug, label: o.name })),
            ]}
            aria-label="Filter by organization"
            searchPlaceholder="Search organizations…"
            testid="explorer-org"
            className="w-full"
          />
        </div>
        <div>
          <FacetLabel>Total parameters</FacetLabel>
          <FilterSelect
            value={search.size}
            onValueChange={(size) => navigateSearch({ size: size as ExplorerSearch['size'] })}
            options={[
              { value: 'any', label: 'Any size' },
              { value: 's', label: SIZE_CLASS_LABELS.s },
              { value: 'm', label: SIZE_CLASS_LABELS.m },
              { value: 'l', label: SIZE_CLASS_LABELS.l },
              { value: 'xl', label: SIZE_CLASS_LABELS.xl },
              { value: 'undisclosed', label: SIZE_CLASS_LABELS.undisclosed },
            ]}
            aria-label="Filter by parameter size class"
            testid="explorer-size"
            className="w-full"
          />
        </div>
        <div>
          <FacetLabel>Runs on my hardware</FacetLabel>
          <FilterSelect
            value={search.gpu}
            onValueChange={(gpu) => navigateSearch({ gpu })}
            options={[
              { value: 'none', label: 'Any hardware / API' },
              ...data.gpus.map((g) => ({ value: g.slug, label: g.name })),
            ]}
            aria-label="Filter by hardware fit"
            testid="explorer-gpu"
            className="w-full"
          />
          <div className="mt-[5px] text-[10.5px] leading-[1.45] text-dim">
            Filters open models whose Q4 quant fits in VRAM/unified memory.
          </div>
        </div>
        <div>
          <FacetLabel>Capabilities</FacetLabel>
          <div className="flex flex-wrap gap-[5px]">
            {CAP_CHIPS.map((chip) => {
              const active = activeCaps.includes(chip.code)
              return (
                <button
                  key={chip.code}
                  type="button"
                  onClick={() => toggleCap(chip.code)}
                  aria-pressed={active}
                  className="cursor-pointer rounded-[20px] border px-2.5 py-[3px] text-[11px]"
                  style={{
                    borderColor: active ? 'var(--acc)' : 'var(--border)',
                    background: active ? 'var(--accdim)' : 'transparent',
                    color: active ? 'var(--acc)' : 'var(--mut)',
                  }}
                  data-testid={`cap-${chip.code}`}
                >
                  {chip.label}
                </button>
              )
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            navigateSearch({ q: '', open: 'all', org: 'all', size: 'any', gpu: 'none', caps: '' })
          }
          className="cursor-pointer self-start text-[11.5px] text-mut underline"
        >
          Reset filters
        </button>
      </div>

      {/* results */}
      <div className="min-w-0 flex-1 px-6 pt-[18px] pb-10">
        <div className="mb-[13px] flex items-baseline gap-2.5">
          <div className="text-sm font-semibold" data-testid="explorer-count">
            {rows.length} models
          </div>
          <div className="ml-auto flex items-center gap-[7px] text-[11.5px] text-mut">
            Sort
            <FilterSelect
              value={search.sort}
              onValueChange={(sort) => navigateSearch({ sort: sort as ExplorerSort })}
              options={[
                { value: 'index', label: 'Elo rating' },
                { value: 'date', label: 'Newest first' },
                { value: 'params', label: 'Largest first' },
                { value: 'cheap', label: 'Cheapest API' },
              ]}
              aria-label="Sort models"
              testid="explorer-sort"
            />
          </div>
        </div>
        {mounted ? (
          <div
            ref={listRef}
            style={{ position: 'relative', height: rowVirtualizer.getTotalSize() }}
          >
            {rowVirtualizer.getVirtualItems().map((vi) => (
              <div
                key={vi.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${vi.start - rowVirtualizer.options.scrollMargin}px)`,
                }}
              >
                <div
                  className="grid gap-[11px]"
                  style={{ gridTemplateColumns: `repeat(${lanes}, 1fr)` }}
                >
                  {rows.slice(vi.index * lanes, vi.index * lanes + lanes).map(renderCard)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-[11px]">
            {rows.map(renderCard)}
          </div>
        )}
      </div>
    </div>
  )
}
