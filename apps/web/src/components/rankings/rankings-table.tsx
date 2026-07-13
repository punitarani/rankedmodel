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
import { normPct } from '#/components/charts/scales'
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
  const { key: sortKey, desc } = parseSort(sort)
  const arrow = (key: string) => (sortKey === key ? (desc ? '↓' : '↑') : '')

  const benchCols = columns

  const gridTemplate = `34px minmax(190px,1.6fr) 74px 62px 84px repeat(${benchCols.length || 1}, ${FIXED_COL_WIDTH}px)`
  const minWidth =
    34 + 190 + 74 + 62 + 84 + benchCols.length * FIXED_COL_WIDTH + 8 * (4 + benchCols.length)

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
          <ModelTag open={m.open} />
          {!m.ranked && (
            <span
              className="flex-none rounded border border-border px-1 py-px font-mono text-[8.5px] uppercase text-dim"
              title="Too few benchmark results to rank — index shown for reference only"
            >
              unrated
            </span>
          )}
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
          <InlineBar pct={hasAnyBench ? Math.round(m.index) : 0} className="mt-[3px]" />
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
          <HeadBtn id="params" label="Params" className="text-right" />
          <HeadBtn id="ctx" label="Ctx" className="text-right" />
          <HeadBtn id="index" label="Index" className="text-right" />
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
