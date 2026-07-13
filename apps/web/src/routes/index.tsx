import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { BenchTab } from '#/components/dashboard/bench-tab'
import { dashboardStats } from '#/components/dashboard/dashboard-data'
import { OverviewTab } from '#/components/dashboard/overview-tab'
import { ReleasesTab } from '#/components/dashboard/releases-tab'
import { Segmented } from '#/components/segmented'
import { catalogQueryOptions } from '#/lib/catalog'

export const Route = createFileRoute('/')({
  validateSearch: z.object({
    tab: z.enum(['overview', 'releases', 'bench']).default('overview').catch('overview'),
  }),
  search: { middlewares: [stripSearchParams({ tab: 'overview' })] },
  head: () => ({
    meta: [
      { title: 'RankedModel — LLM rankings, benchmarks & hardware fit' },
      {
        name: 'description',
        content:
          'The state of language models: rankings, releases and benchmark movement across every major LLM.',
      },
    ],
  }),
  component: DashboardRoute,
})

function DashboardRoute() {
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data } = useSuspenseQuery(catalogQueryOptions)
  const stats = dashboardStats(data)

  const statCards = [
    {
      label: 'Models tracked',
      value: String(stats.modelCount),
      sub: `${stats.orgCount} organizations`,
      subColor: 'var(--mut)',
    },
    {
      label: 'Open weights',
      value: String(stats.openCount),
      sub: `${stats.openPct}% of catalog`,
      subColor: 'var(--open)',
    },
    {
      label: 'Releases · 90 days',
      value: String(stats.recent90d),
      sub: 'tracked in the last quarter',
      subColor: 'var(--mut)',
    },
    {
      label: 'Open–closed gap',
      value: stats.gapIndex != null ? `${stats.gapIndex} idx` : '—',
      sub: stats.openBest ? `${stats.openBest.name} leads open` : '',
      subColor: 'var(--mut)',
    },
  ]

  return (
    <div className="animate-fadeup px-6 py-5 pb-10">
      <div className="mb-4 flex items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-[-0.02em]">The state of language models</h1>
          <div className="mt-0.5 text-xs text-mut">
            Rankings, releases and benchmark movement · updated {data.asOf}
          </div>
        </div>
        <div className="ml-auto">
          <Segmented
            value={tab}
            options={[
              { value: 'overview', label: 'Overview' },
              { value: 'releases', label: 'Releases' },
              { value: 'bench', label: 'Benchmarks' },
            ]}
            onChange={(next) => navigate({ search: { tab: next } })}
          />
        </div>
      </div>

      {/* stat strip (all tabs) */}
      <div className="mb-[18px] grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
        {statCards.map((s) => (
          <div
            key={s.label}
            className="rounded-[9px] border border-border bg-card px-3.5 py-3"
            data-testid="stat-card"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-dim">
              {s.label}
            </div>
            <div className="mt-[3px] text-xl font-semibold tracking-[-0.02em]">{s.value}</div>
            <div className="mt-px text-[11px]" style={{ color: s.subColor }}>
              {s.sub}
            </div>
          </div>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab catalog={data} />}
      {tab === 'releases' && <ReleasesTab catalog={data} />}
      {tab === 'bench' && <BenchTab catalog={data} />}
    </div>
  )
}
