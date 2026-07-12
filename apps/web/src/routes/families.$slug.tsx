import { fmtDate, fmtParams } from '@rankedmodel/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { BackLink } from '#/components/back-link'
import { InlineBar } from '#/components/charts/inline-bar'
import { Sparkline } from '#/components/charts/sparkline'
import { ModelTag } from '#/components/model-tag'
import { catalogQueryOptions } from '#/lib/catalog'

export const Route = createFileRoute('/families/$slug')({
  loader: async ({ context, params }) => {
    const catalog = await context.queryClient.ensureQueryData(catalogQueryOptions)
    if (!catalog.models.some((m) => m.familySlug === params.slug)) throw notFound()
  },
  head: ({ params }) => ({
    meta: [{ title: `${params.slug} family — lineage & progression · RankedModel` }],
  }),
  notFoundComponent: () => (
    <div className="py-16 text-center text-[13px] text-mut">
      Family not found. <Link to="/models">Back to explorer</Link>
    </div>
  ),
  component: FamilyRoute,
})

function FamilyRoute() {
  const { slug } = Route.useParams()
  const { data } = useSuspenseQuery(catalogQueryOptions)
  const members = data.models
    .filter((m) => m.familySlug === slug)
    .sort((a, b) => a.date.localeCompare(b.date))
  const first = members[0]
  if (!first) throw notFound()
  const bySlug = new Map(members.map((m) => [m.slug, m]))

  return (
    <div className="max-w-[820px] animate-fadeup px-6 py-5 pb-12">
      <BackLink
        to="/organizations/$slug"
        params={{ slug: first.orgSlug }}
        fallbackLabel={first.org}
      />
      <h1 className="mt-2.5 text-2xl font-semibold tracking-[-0.02em]">{first.family} family</h1>
      <div className="mt-1 text-[13px] text-mut">
        {members.length} releases · index progression and succession lineage (D9)
      </div>

      <div className="mt-4 rounded-[10px] border border-border bg-card px-4 py-3.5">
        <div className="text-[13px] font-semibold">Index progression</div>
        <div data-testid="family-sparkline">
          <Sparkline
            dots={members.map((m, i) => ({
              value: m.index,
              label: `${m.name} · ${m.index.toFixed(1)}`,
              active: i === members.length - 1,
            }))}
          />
        </div>
      </div>

      <div className="mt-3.5 overflow-hidden rounded-[10px] border border-border bg-card">
        {members.map((m) => {
          const pred = m.predecessor ? bySlug.get(m.predecessor) : null
          const delta = pred ? Math.round((m.index - pred.index) * 10) / 10 : null
          return (
            <Link
              key={m.slug}
              to="/models/$slug"
              params={{ slug: m.slug }}
              className="flex cursor-pointer items-center gap-3 border-b border-border px-4 py-2.5 text-text no-underline last:border-b-0 hover:bg-hover hover:no-underline"
              data-testid="family-member"
            >
              <span className="w-[86px] flex-none font-mono text-[11px] text-dim">
                {fmtDate(m.date)}
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline gap-[7px]">
                  <span className="font-semibold">{m.name}</span>
                  <ModelTag open={m.open} />
                  <span className="font-mono text-[10.5px] text-dim">
                    {fmtParams(m.params, m.active)}
                  </span>
                </span>
                {pred && (
                  <span className="mt-0.5 block text-[11px] text-dim">
                    succeeds {pred.name}
                    {delta != null && delta !== 0 && (
                      <span
                        className="ml-1.5 font-mono"
                        style={{ color: delta > 0 ? 'var(--open)' : 'var(--closed)' }}
                      >
                        {delta > 0 ? '+' : ''}
                        {delta}
                      </span>
                    )}
                  </span>
                )}
              </span>
              <span className="ml-auto text-right">
                <span className="font-mono text-[11.5px] font-semibold">{m.index.toFixed(1)}</span>
                <InlineBar pct={Math.round(m.index)} className="mt-[3px] w-[90px]" />
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
