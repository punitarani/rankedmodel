import { createFileRoute } from '@tanstack/react-router'
import { Placeholder } from '#/components/shell/placeholder'

export const Route = createFileRoute('/models/$slug')({
  head: ({ params }) => ({ meta: [{ title: `${params.slug} · RankedModel` }] }),
  component: ModelDetailPlaceholder,
})

function ModelDetailPlaceholder() {
  const { slug } = Route.useParams()
  return <Placeholder title={slug} note="Model detail lands with the Model Detail commit." />
}
