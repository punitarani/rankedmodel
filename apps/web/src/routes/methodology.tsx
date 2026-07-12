import { createFileRoute } from '@tanstack/react-router'
import { Placeholder } from '#/components/shell/placeholder'

export const Route = createFileRoute('/methodology')({
  head: () => ({ meta: [{ title: 'Methodology · RankedModel' }] }),
  component: () => (
    <Placeholder
      title="Methodology"
      note="Scoring + provenance write-up lands with the Methodology commit."
    />
  ),
})
