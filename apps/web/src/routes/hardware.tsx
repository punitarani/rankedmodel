import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { HardwareScreen } from '#/components/hardware/hardware-screen'
import { catalogQueryOptions } from '#/lib/catalog'
import { HARDWARE_SEARCH_DEFAULTS, hardwareSearchSchema } from '#/lib/search'

export const Route = createFileRoute('/hardware')({
  validateSearch: hardwareSearchSchema,
  search: { middlewares: [stripSearchParams(HARDWARE_SEARCH_DEFAULTS)] },
  head: () => ({
    meta: [
      { title: 'What can your hardware run? · RankedModel' },
      {
        name: 'description',
        content:
          'Graded fit verdicts for every open model against your GPU or Mac — VRAM, headroom, quantizations and measured tok/s.',
      },
    ],
  }),
  component: HardwareRoute,
})

function HardwareRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data } = useSuspenseQuery(catalogQueryOptions)
  return (
    <HardwareScreen
      catalog={data}
      search={search}
      navigateSearch={(patch) => navigate({ search: (prev) => ({ ...prev, ...patch }) })}
    />
  )
}
