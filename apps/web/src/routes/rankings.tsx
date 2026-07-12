import { createFileRoute } from '@tanstack/react-router'
import { Placeholder } from '#/components/shell/placeholder'

export const Route = createFileRoute('/rankings')({
  head: () => ({ meta: [{ title: 'Global Rankings · RankedModel' }] }),
  component: () => (
    <Placeholder
      title="Global rankings"
      note="Dense sortable table lands with the Rankings commit."
    />
  ),
})
