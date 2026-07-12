import { createFileRoute } from '@tanstack/react-router'
import { Placeholder } from '#/components/shell/placeholder'

export const Route = createFileRoute('/benchmarks/')({
  head: () => ({ meta: [{ title: 'Benchmarks · RankedModel' }] }),
  component: () => (
    <Placeholder
      title="Benchmarks"
      note="Category grid + leaderboards land with the Benchmarks commit."
    />
  ),
})
