import { createFileRoute } from '@tanstack/react-router'
import { Placeholder } from '#/components/shell/placeholder'

export const Route = createFileRoute('/organizations/$slug')({
  head: ({ params }) => ({ meta: [{ title: `${params.slug} · RankedModel` }] }),
  component: () => (
    <Placeholder title="Organization" note="Org hub lands with the entity-hubs commit." />
  ),
})
