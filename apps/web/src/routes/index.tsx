import { createFileRoute } from '@tanstack/react-router'
import { Placeholder } from '#/components/shell/placeholder'

export const Route = createFileRoute('/')({
  head: () => ({ meta: [{ title: 'RankedModel — LLM rankings, benchmarks & hardware fit' }] }),
  component: () => (
    <Placeholder
      title="The state of language models"
      note="Rankings, releases and benchmark movement — dashboard lands after the core screens."
    />
  ),
})
