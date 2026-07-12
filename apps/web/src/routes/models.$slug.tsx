import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { ModelDetailScreen } from '#/components/model-detail/model-detail-screen'
import { catalogQueryOptions } from '#/lib/catalog'
import { modelQueryOptions } from '#/lib/model'

export const Route = createFileRoute('/models/$slug')({
  loader: async ({ context, params }) => {
    const [catalog, detail] = await Promise.all([
      context.queryClient.ensureQueryData(catalogQueryOptions),
      context.queryClient.ensureQueryData(modelQueryOptions(params.slug)),
    ])
    if (!detail || !catalog.models.some((m) => m.slug === params.slug)) throw notFound()
  },
  head: ({ params }) => ({
    meta: [{ title: `${params.slug} — benchmarks, pricing & hardware fit · RankedModel` }],
  }),
  notFoundComponent: () => (
    <div className="py-16 text-center text-[13px] text-mut">
      Model not found. <Link to="/models">Back to explorer</Link>
    </div>
  ),
  component: ModelDetailRoute,
})

function ModelDetailRoute() {
  const { slug } = Route.useParams()
  const { data: catalog } = useSuspenseQuery(catalogQueryOptions)
  const model = catalog.models.find((m) => m.slug === slug)
  if (!model) throw notFound()
  return <ModelDetailScreen model={model} catalog={catalog} />
}
