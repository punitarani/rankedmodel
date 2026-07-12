import { fmtCtx, fmtDate, fmtParams } from '@rankedmodel/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { BackLink } from '#/components/back-link'
import { CadenceBars } from '#/components/charts/cadence-bars'
import { InlineBar } from '#/components/charts/inline-bar'
import { ModelTag } from '#/components/model-tag'
import { catalogQueryOptions } from '#/lib/catalog'

export const Route = createFileRoute('/organizations/$slug')({
  loader: async ({ context, params }) => {
    const catalog = await context.queryClient.ensureQueryData(catalogQueryOptions)
    if (!catalog.models.some((m) => m.orgSlug === params.slug)) throw notFound()
  },
  head: ({ params }) => ({
    meta: [{ title: `${params.slug} — models & release cadence · RankedModel` }],
  }),
  notFoundComponent: () => (
    <div className="py-16 text-center text-[13px] text-mut">
      Organization not found. <Link to="/models">Back to explorer</Link>
    </div>
  ),
  component: OrgRoute,
})

function OrgRoute() {
  const { slug } = Route.useParams()
  const { data } = useSuspenseQuery(catalogQueryOptions)
  const models = data.models
    .filter((m) => m.orgSlug === slug)
    .sort((a, b) => b.date.localeCompare(a.date))
  const first = models[0]
  if (!first) throw notFound()
  const families = [...new Set(models.map((m) => m.family))]

  const counts = new Map<string, number>()
  for (const m of models) {
    const [y, mo] = m.date.split('-') as [string, string]
    const key = `${y} Q${Math.floor((Number(mo) - 1) / 3) + 1}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const quarterKeys = [...counts.keys()].sort()

  return (
    <div className="max-w-[900px] animate-fadeup px-6 py-5 pb-12">
      <BackLink to="/models" fallbackLabel="Model explorer" />
      <h1 className="mt-2.5 text-2xl font-semibold tracking-[-0.02em]">{first.org}</h1>
      <div className="mt-1 text-[13px] text-mut" data-testid="org-meta">
        {models.length} tracked models · {families.length} families:{' '}
        {families.map((f, i) => {
          const fam = models.find((m) => m.family === f)
          return (
            <span key={f}>
              {i > 0 && ' · '}
              <Link
                to="/families/$slug"
                params={{ slug: fam?.familySlug ?? '' }}
                className="text-mut hover:text-text"
              >
                {f}
              </Link>
            </span>
          )
        })}
      </div>

      <div className="mt-4 grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[minmax(0,1.7fr)_minmax(240px,1fr)]">
        <div className="overflow-hidden rounded-[10px] border border-border bg-card">
          <div className="grid grid-cols-[92px_minmax(140px,1.5fr)_70px_60px_90px] items-center gap-2.5 border-b border-border2 px-4 py-[9px] font-mono text-[9.5px] uppercase tracking-[0.05em] text-dim">
            <span>Released</span>
            <span>Model</span>
            <span className="text-right">Params</span>
            <span className="text-right">Ctx</span>
            <span className="text-right">Index</span>
          </div>
          {models.map((m) => (
            <Link
              key={m.slug}
              to="/models/$slug"
              params={{ slug: m.slug }}
              className="grid cursor-pointer grid-cols-[92px_minmax(140px,1.5fr)_70px_60px_90px] items-center gap-2.5 border-b border-border px-4 py-2 text-[12.5px] text-text no-underline hover:bg-hover hover:no-underline"
              data-testid="org-model-row"
            >
              <span className="font-mono text-[11px] text-dim">{fmtDate(m.date)}</span>
              <span className="flex min-w-0 items-baseline gap-[7px]">
                <span className="overflow-hidden text-ellipsis whitespace-nowrap font-semibold">
                  {m.name}
                </span>
                <ModelTag open={m.open} />
              </span>
              <span className="text-right font-mono text-[11px] text-mut">
                {fmtParams(m.params, m.active)}
              </span>
              <span className="text-right font-mono text-[11px] text-mut">{fmtCtx(m.ctxK)}</span>
              <span className="text-right">
                <span className="font-mono text-[11.5px] font-semibold">{m.index.toFixed(1)}</span>
                <InlineBar pct={Math.round(m.index)} className="mt-[3px]" />
              </span>
            </Link>
          ))}
        </div>
        <div className="rounded-[10px] border border-border bg-card px-4 py-3.5">
          <div className="text-[13px] font-semibold">Release cadence</div>
          <div className="mt-px text-[11px] text-mut">Tracked releases per quarter</div>
          <CadenceBars
            quarters={quarterKeys.map((k, i) => ({
              label: k.replace('20', "'"),
              count: counts.get(k) ?? 0,
              latest: i === quarterKeys.length - 1,
            }))}
          />
        </div>
      </div>
    </div>
  )
}
