import {
  fmtCtx,
  fmtParams,
  fmtScore,
  parseSort,
  type SnapshotBenchmark,
  type SnapshotModel,
  toggleSort,
} from '@rankedmodel/shared'
import { useNavigate } from '@tanstack/react-router'
import { createColumnHelper, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef, useState } from 'react'
import { InlineBar } from '#/components/charts/inline-bar'
import { normPct, ratingWindow } from '#/components/charts/scales'
import { ModelTag } from '#/components/model-tag'

/**
 * The design's dense rankings table: headless TanStack Table for the column/row model
 * (sorting stays in the URL via the shared selector), design grid markup for rendering.
 * Which benchmark columns show is resolved by the parent screen from live coverage (D20),
 * so near-empty benchmarks never render as columns of em-dashes.
 */

const FIXED_COL_WIDTH = 72
/** Fixed row height (px) — every row renders one line of text at identical padding. */
const ROW_HEIGHT = 34

const columnHelper = createColumnHelper<SnapshotModel>()

export function RankingsTable({
  rows,
  benchmarks,
  columns,
  sort,
  onSort,
}: {
  rows: SnapshotModel[]
  benchmarks: SnapshotBenchmark[]
  columns: { slug: string; label: string }[]
  sort: string
  onSort: (next: string) => void
}) {
  const navigate = useNavigate()
  const boundsBySlug = new Map(benchmarks.map((b) => [b.slug, b]))
  // Elo bars are relative to the rendered field (D21): the rating has no fixed 0–100 domain.
  const eloWindow = ratingWindow(
    rows.filter((m) => Object.values(m.bench).some((v) => v != null)).map((m) => m.index),
  )
  const { key: sortKey, desc } = parseSort(sort)
  const arrow = (key: string) => (sortKey === key ? (desc ? '↓' : '↑') : '')

  const benchCols = columns

  // Column tracks: rank, model (wide so long names aren't clipped), the open/closed access chip,
  // params, ctx, Elo (100px fits the header at 9.5px mono), then the benchmark columns.
  const MODEL_MIN = 240
  const ACCESS_COL = 72
  const FIXED_COLS = 6 // #, model, access, params, ctx, index
  const gridTemplate = `34px minmax(${MODEL_MIN}px,1.8fr) ${ACCESS_COL}px 74px 62px 100px repeat(${benchCols.length || 1}, ${FIXED_COL_WIDTH}px)`
  // Fixed tracks + inter-column gaps (gap-2) + the row's own horizontal padding (px-3.5 ×2), so
  // the last benchmark column keeps its right padding instead of being cropped at the scroll edge.
  const colCount = FIXED_COLS + benchCols.length
  const minWidth =
    28 +
    34 +
    MODEL_MIN +
    ACCESS_COL +
    74 +
    62 +
    100 +
    benchCols.length * FIXED_COL_WIDTH +
    8 * (colCount - 1)

  const table = useReactTable({
    data: rows,
    columns: [
      columnHelper.accessor('index', { id: 'index' }),
      ...benchCols.map((c) => columnHelper.accessor((m) => m.bench[c.slug], { id: c.slug })),
    ],
    getCoreRowModel: getCoreRowModel(),
  })
  const tableRows = table.getRowModel().rows

  // Virtualize only after mount: SSR (and the pre-hydration first paint) renders the full
  // list deterministically so there's no client/server size mismatch and the page is
  // fully crawlable/searchable; once mounted, swap to a windowed render for smooth
  // scrolling over what can be several hundred rows.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const listRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useWindowVirtualizer({
    count: tableRows.length,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  })

  const HeadBtn = ({
    id,
    label,
    className = '',
  }: {
    id: string
    label: string
    className?: string
  }) => (
    <button
      type="button"
      onClick={() => onSort(toggleSort(sort, id))}
      className={`cursor-pointer whitespace-nowrap text-left font-mono text-[9.5px] uppercase tracking-[0.05em] ${
        sortKey === id ? 'text-acc' : 'text-dim'
      } ${className}`}
      data-testid={`sort-${id}`}
    >
      {label} {arrow(id)}
    </button>
  )

  const renderRow = (m: SnapshotModel, i: number) => {
    const hasAnyBench = Object.values(m.bench).some((v) => v != null)
    return (
      <button
        key={m.slug}
        type="button"
        onClick={() => navigate({ to: '/models/$slug', params: { slug: m.slug } })}
        className="grid w-full cursor-pointer items-center gap-2 border-b border-border bg-card px-3.5 py-[7px] text-left text-[12.5px] hover:bg-hover"
        style={{ gridTemplateColumns: gridTemplate }}
        data-testid="ranking-row"
        data-ranked={m.ranked}
      >
        {/* Rank-eligible models get a position; unrated ones (D20) show a dash, not a fake rank. */}
        <span className="font-mono text-[11px] text-dim">{m.ranked ? i + 1 : '—'}</span>
        <span className="flex min-w-0 items-baseline gap-[7px]">
          <span className="overflow-hidden text-ellipsis whitespace-nowrap font-semibold">
            {m.name}
          </span>
          <span className="flex-none text-[11px] text-mut">{m.org}</span>
          {!m.ranked && (
            <span
              className="flex-none rounded border border-border px-1 py-px font-mono text-[8.5px] uppercase text-dim"
              title="Too few benchmark results to rank — rating shown for reference only"
            >
              unrated
            </span>
          )}
        </span>
        <span className="flex items-center">
          <ModelTag open={m.open} />
        </span>
        <span className="text-right font-mono text-[11px] text-mut">
          {fmtParams(m.params, m.active)}
        </span>
        <span className="text-right font-mono text-[11px] text-mut">{fmtCtx(m.ctxK)}</span>
        <span className="text-right">
          <span
            className="font-mono text-[11.5px] font-semibold"
            style={{ color: m.ranked ? 'var(--text)' : 'var(--mut)' }}
          >
            {hasAnyBench ? m.index.toFixed(1) : '—'}
          </span>
          <InlineBar
            pct={hasAnyBench ? normPct(m.index, eloWindow.min, eloWindow.max) : 0}
            className="mt-[3px]"
          />
        </span>
        {benchCols.map((c) => {
          const bounds = boundsBySlug.get(c.slug)
          const v = m.bench[c.slug]
          const pct = bounds ? normPct(v, bounds.normMin, bounds.normMax) : 0
          return (
            <span key={c.slug} className="text-right">
              <span
                className="font-mono text-[11px]"
                style={{ color: v == null ? 'var(--dim)' : 'var(--text)' }}
              >
                {v == null || !bounds ? '—' : fmtScore(v, bounds.unit)}
              </span>
              <InlineBar
                pct={pct}
                color={pct > 92 ? 'var(--acc)' : 'var(--border2)'}
                className="mt-[3px]"
              />
            </span>
          )
        })}
      </button>
    )
  }

  return (
    <div className="overflow-x-auto rounded-[10px] border border-border bg-card">
      <div style={{ minWidth }}>
        <div
          className="grid items-center gap-2 border-b border-border2 px-3.5 py-[9px]"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <span className="font-mono text-[9.5px] text-dim">#</span>
          <HeadBtn id="name" label="Model" />
          <HeadBtn id="open" label="Access" />
          <HeadBtn id="params" label="Params" className="text-right" />
          <HeadBtn id="ctx" label="Ctx" className="text-right" />
          <HeadBtn id="index" label="Elo" className="text-right" />
          {benchCols.map((c) => (
            <HeadBtn key={c.slug} id={c.slug} label={c.label} className="text-right" />
          ))}
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
                {renderRow(tableRows[vi.index].original, vi.index)}
              </div>
            ))}
          </div>
        ) : (
          <div ref={listRef}>{tableRows.map((row, i) => renderRow(row.original, i))}</div>
        )}
      </div>
    </div>
  )
}
