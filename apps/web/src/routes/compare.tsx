import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { Placeholder } from '#/components/shell/placeholder'

export const Route = createFileRoute('/compare')({
  validateSearch: z.object({ m: z.string().default('').catch('') }),
  head: () => ({ meta: [{ title: 'Compare models · RankedModel' }] }),
  component: () => (
    <Placeholder
      title="Compare models"
      note="Side-by-side specs, benchmarks and radar land with the Compare commit."
    />
  ),
})
