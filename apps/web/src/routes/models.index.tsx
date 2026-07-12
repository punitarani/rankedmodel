import { createFileRoute } from '@tanstack/react-router'
import { Placeholder } from '#/components/shell/placeholder'

export const Route = createFileRoute('/models/')({
  head: () => ({ meta: [{ title: 'Model Explorer · RankedModel' }] }),
  component: () => (
    <Placeholder
      title="Model explorer"
      note="Facet rail + card grid lands with the Explorer commit."
    />
  ),
})
