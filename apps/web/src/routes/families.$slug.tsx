import { createFileRoute } from '@tanstack/react-router'
import { Placeholder } from '#/components/shell/placeholder'

export const Route = createFileRoute('/families/$slug')({
  head: ({ params }) => ({ meta: [{ title: `${params.slug} family · RankedModel` }] }),
  component: () => (
    <Placeholder title="Family" note="Family hub lands with the entity-hubs commit." />
  ),
})
