import { createFileRoute } from '@tanstack/react-router'
import { Placeholder } from '#/components/shell/placeholder'

export const Route = createFileRoute('/hardware')({
  head: () => ({ meta: [{ title: 'Hardware · RankedModel' }] }),
  component: () => (
    <Placeholder
      title="What can you run?"
      note="GPU picker + fit table lands with the Hardware commit."
    />
  ),
})
