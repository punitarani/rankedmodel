import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { BenchmarkDetail } from '#/components/benchmarks/benchmark-detail'
import { catalogQueryOptions } from '#/lib/catalog'

export const Route = createFileRoute('/benchmarks/$slug')({
  loader: async ({ context, params }) => {
    const catalog = await context.queryClient.ensureQueryData(catalogQueryOptions)
    if (!catalog.benchmarks.some((b) => b.slug === params.slug)) throw notFound()
  },
  head: ({ params }) => ({
    meta: [{ title: `${params.slug} leaderboard · RankedModel` }],
  }),
  notFoundComponent: () => (
    <div className="py-16 text-center text-[13px] text-mut">
      Benchmark not found. <Link to="/benchmarks">Back to benchmarks</Link>
    </div>
  ),
  component: BenchmarkRoute,
})

function BenchmarkRoute() {
  const { slug } = Route.useParams()
  const { data } = useSuspenseQuery(catalogQueryOptions)
  const benchmark = data.benchmarks.find((b) => b.slug === slug)
  if (!benchmark) throw notFound()
  return <BenchmarkDetail benchmark={benchmark} catalog={data} />
}
