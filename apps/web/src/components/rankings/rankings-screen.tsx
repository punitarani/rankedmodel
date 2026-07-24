import {
  type BenchmarkCategory,
  CATEGORY_LABELS,
  parseSort,
  selectOrgs,
  selectRankings,
} from '@modelbeats/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { SearchSelect } from '#/components/search-select'
import { Segmented } from '#/components/segmented'
import { catalogQueryOptions } from '#/lib/catalog'
import {
  CORE_RANKINGS_CANDIDATES,
  CORE_RANKINGS_LABELS,
  RANKINGS_COLUMN_MIN_COVERAGE,
} from '#/lib/search'
import { RankingsTable } from './rankings-table'

/** Fixed (non-benchmark) sort keys; any other key is looked up in the live benchmark catalog. */
const FIXED_SORT_LABELS: Record<string, string> = {
  index: 'Elo',
  name: 'name',
  open: 'access',
  params: 'parameters',
  ctx: 'context',
}

export interface RankingsSearch {
  sort: string
  q: string
  org: string
  open: 'all' | 'open' | 'closed'
}

export function RankingsScreen({
  search,
  category,
  navigateSearch,
}: {
  search: RankingsSearch
  category?: BenchmarkCategory
  navigateSearch: (patch: Partial<RankingsSearch>) => void
}) {
  const { data } = useSuspenseQuery(catalogQueryOptions)
  const navigate = useNavigate()
  const rows = selectRankings(data.models, search)
  const orgs = selectOrgs(data.models)
  const sortKey = parseSort(search.sort).key
  const benchLabel = data.benchmarks.find((b) => b.slug === sortKey)?.name
  const sortLabel = FIXED_SORT_LABELS[sortKey] ?? benchLabel ?? sortKey

  // Live per-benchmark coverage (full catalog) drives which columns are worth showing, so
  // near-empty benchmarks never render as columns of em-dashes (D20).
  const coverage = useMemo(() => {
    const c: Record<string, number> = {}
    for (const m of data.models) {
      for (const [slug, v] of Object.entries(m.bench)) if (v != null) c[slug] = (c[slug] ?? 0) + 1
    }
    return c
  }, [data.models])

  // Coverage among just the top of the table drives COLUMN ORDER (not the floor above): the
  // era-split catalog means a benchmark can clear the overall floor (MMLU: 287 models) while
  // still being blank for nearly every row a visitor actually looks at (16 of the top 100) —
  // ordering by raw catalog coverage would keep it left regardless. Sorting by top-100 coverage
  // instead puts the columns that are actually populated up top left where rows are dense, and
  // pushes era-mismatched columns right where the occasional em-dash is expected.
  const topCoverage = useMemo(() => {
    const c: Record<string, number> = {}
    for (const m of data.models) {
      if (!m.ranked || m.rank == null || m.rank > 100) continue
      for (const [slug, v] of Object.entries(m.bench)) if (v != null) c[slug] = (c[slug] ?? 0) + 1
    }
    return c
  }, [data.models])

  const columns = useMemo(() => {
    const label = (slug: string) =>
      CORE_RANKINGS_LABELS[slug] ?? data.benchmarks.find((b) => b.slug === slug)?.name ?? slug
    // Column-header hint (D20 follow-up): a benchmark can be well-covered catalog-wide yet
    // mostly blank at the top of the table (legacy knowledge/math evals the frontier stopped
    // reporting once scores saturated). Surfacing that as a hover hint turns a wall of
    // unexplained em-dashes into a documented, expected pattern — every gap behind it has a
    // dated, cited research trail (see corpus verificationNotes / the audit tool's
    // top-n-coverage check), not an oversight.
    const columnHint = (slug: string) => {
      const top = topCoverage[slug] ?? 0
      const total = coverage[slug] ?? 0
      if (top >= 80) return `${top} of the top 100 ranked models report this benchmark.`
      return (
        `Only ${top} of the top 100 ranked models report this benchmark ` +
        `(${total} models overall) — many frontier labs stopped publishing it once scores ` +
        `saturated near the ceiling. See Methodology for the full research trail.`
      )
    }
    if (category) {
      // A category page shows that category's benchmarks by coverage; a >=5 floor keeps a
      // top-5 meaningful, capped so a broad category doesn't overflow into dozens of columns.
      const inCat = data.benchmarks
        .filter((b) => b.category === category)
        .sort((a, b) => (coverage[b.slug] ?? 0) - (coverage[a.slug] ?? 0))
      const covered = inCat.filter((b) => (coverage[b.slug] ?? 0) >= 5)
      return (covered.length >= 3 ? covered : inCat.slice(0, 6)).map((b) => ({
        slug: b.slug,
        label: label(b.slug),
        hint: `${coverage[b.slug] ?? 0} of ${data.models.length} tracked models report this benchmark.`,
      }))
    }
    return CORE_RANKINGS_CANDIDATES.filter(
      (slug) => (coverage[slug] ?? 0) >= RANKINGS_COLUMN_MIN_COVERAGE,
    )
      .sort(
        (a, b) =>
          (topCoverage[b] ?? 0) - (topCoverage[a] ?? 0) || (coverage[b] ?? 0) - (coverage[a] ?? 0),
      )
      .map((slug) => ({ slug, label: label(slug), hint: columnHint(slug) }))
  }, [category, data.benchmarks, data.models.length, coverage, topCoverage])

  // If the user sorts by a benchmark that isn't a default column, surface it as an extra
  // column so the sort arrow + "sorted by X" line always name a column you can see (D20).
  const displayColumns = useMemo(() => {
    const isBench = data.benchmarks.some((b) => b.slug === sortKey)
    if (!isBench || columns.some((c) => c.slug === sortKey)) return columns
    return [
      ...columns,
      { slug: sortKey, label: CORE_RANKINGS_LABELS[sortKey] ?? benchLabel ?? sortKey },
    ]
  }, [columns, sortKey, benchLabel, data.benchmarks])

  return (
    <div className="animate-fadeup px-6 py-5 pb-10">
      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <div>
          <h1 className="text-lg font-semibold tracking-[-0.02em]">
            {category ? `${CATEGORY_LABELS[category]} rankings` : 'Global rankings'}
          </h1>
          <div className="mt-0.5 text-xs text-mut" data-testid="rankings-meta">
            {rows.length} models · sorted by {sortLabel} · click any column to re-sort
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={search.q}
            onChange={(e) => navigateSearch({ q: e.target.value })}
            placeholder="Filter…"
            className="w-[140px] rounded-md border border-border bg-panel2 px-[9px] py-[5px] text-xs text-text outline-none focus:border-acc"
            data-testid="rankings-filter"
          />
          <SearchSelect
            value={search.org}
            onValueChange={(org) => navigateSearch({ org })}
            options={[
              { value: 'all', label: 'All orgs' },
              ...orgs.map((o) => ({ value: o.slug, label: o.name })),
            ]}
            aria-label="Filter by organization"
            searchPlaceholder="Search organizations…"
            testid="rankings-org"
          />
          <Segmented
            value={search.open}
            options={[
              { value: 'all', label: 'All' },
              { value: 'open', label: 'Open' },
              { value: 'closed', label: 'Closed' },
            ]}
            onChange={(open) => navigateSearch({ open })}
          />
        </div>
      </div>

      <RankingsTable
        rows={rows}
        benchmarks={data.benchmarks}
        columns={displayColumns}
        sort={search.sort}
        onSort={(sort) => navigateSearch({ sort })}
      />
      {category && (
        <div className="mt-2.5 text-[11px] text-dim">
          Showing {CATEGORY_LABELS[category].toLowerCase()} benchmark columns only.{' '}
          <button
            type="button"
            className="cursor-pointer text-acc underline"
            onClick={() => navigate({ to: '/rankings' })}
          >
            All columns
          </button>
        </div>
      )}
      <div className="mt-2.5 text-[11px] text-dim">
        Elo = Bradley-Terry rating over pairwise benchmark battles: every benchmark two models both
        report is a head-to-head, weighted so no domain decides a pairing linearly by benchmark
        count (a shared domain votes with √n total weight), and 400 points ≈ 10:1 expected win odds.
        Models with too few results to compare fairly are shown{' '}
        <span className="font-mono">unrated</span> and sorted last.
      </div>
    </div>
  )
}
