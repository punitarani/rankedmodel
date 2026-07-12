import { createFileRoute } from '@tanstack/react-router'
import { Placeholder } from '#/components/shell/placeholder'

export const Route = createFileRoute('/compare')({
  head: () => ({ meta: [{ title: 'Compare models · RankedModel' }] }),
  component: () => (
    <Placeholder
      title="Compare models"
      note="Side-by-side specs, benchmarks and radar land with the Compare commit."
    />
  ),
})
