import { BENCHMARK_CATEGORIES, CATEGORY_LABELS } from '@rankedmodel/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { catalogQueryOptions } from '#/lib/catalog'

export const Route = createFileRoute('/benchmarks/')({
  head: () => ({
    meta: [
      { title: 'Benchmarks · RankedModel' },
      {
        name: 'description',
        content: 'Every tracked evaluation with methodology, bounds and current leaders.',
      },
    ],
  }),
  component: BenchmarksIndex,
})

function BenchmarksIndex() {
  const { data } = useSuspenseQuery(catalogQueryOptions)
  const byCategory = BENCHMARK_CATEGORIES.map((cat) => ({
    cat,
    benchmarks: data.benchmarks.filter((b) => b.category === cat),
  })).filter((g) => g.benchmarks.length > 0)

  return (
    <div className="max-w-[1060px] animate-fadeup px-6 py-5 pb-10">
      <h1 className="text-lg font-semibold tracking-[-0.02em]">Benchmarks</h1>
      <div className="mt-0.5 text-xs text-mut">
        {data.benchmarks.length} tracked evaluations · normalization bounds power the Index (see{' '}
        <Link to="/methodology">methodology</Link>)
      </div>
      <div className="mt-4 flex flex-col gap-5">
        {byCategory.map((g) => (
          <div key={g.cat}>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.07em] text-dim">
              {CATEGORY_LABELS[g.cat]}
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
              {g.benchmarks.map((b) => {
                const leader = data.models
                  .filter((m) => m.bench[b.slug] != null)
                  .sort((x, y) => (y.bench[b.slug] as number) - (x.bench[b.slug] as number))[0]
                return (
                  <Link
                    key={b.slug}
                    to="/benchmarks/$slug"
                    params={{ slug: b.slug }}
                    className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-card px-[15px] py-[13px] text-text no-underline hover:border-border2 hover:bg-hover hover:no-underline"
                    data-testid="benchmark-card"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="text-[13.5px] font-semibold">{b.name}</span>
                      <span className="ml-auto font-mono text-[9.5px] text-dim">
                        [{b.normMin}–{b.normMax}] {b.unit}
                      </span>
                    </div>
                    <div className="line-clamp-2 text-[11.5px] leading-normal text-mut">
                      {b.description}
                    </div>
                    {leader && (
                      <div className="mt-1 flex items-baseline gap-1.5 text-[11px]">
                        <span className="font-mono text-[9.5px] uppercase text-dim">leader</span>
                        <span className="font-semibold">{leader.name}</span>
                        <span className="ml-auto font-mono text-mut">
                          {b.slug === 'arena'
                            ? leader.bench[b.slug]
                            : `${(leader.bench[b.slug] as number).toFixed(1)}%`}
                        </span>
                      </div>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
