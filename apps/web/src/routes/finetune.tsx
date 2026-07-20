import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { FinetuneScreen } from '#/components/finetune/finetune-screen'
import { FINETUNE_SEARCH_DEFAULTS, finetuneSearchSchema } from '#/lib/search'
import { seoMeta } from '#/lib/seo'

export const Route = createFileRoute('/finetune')({
  validateSearch: finetuneSearchSchema,
  search: { middlewares: [stripSearchParams(FINETUNE_SEARCH_DEFAULTS)] },
  head: () =>
    seoMeta({
      title: 'Which model should you fine-tune? · Model Beats',
      description:
        'Ranked open-weight models for your fine-tuning job — training VRAM per method (QLoRA, LoRA, full), license class, estimated cost, and task quality on your hardware.',
      path: '/finetune',
    }),
  component: FinetuneRoute,
})

function FinetuneRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <FinetuneScreen
      search={search}
      navigateSearch={(patch) =>
        navigate({ search: (prev) => ({ ...prev, ...patch }), replace: 'q' in patch })
      }
    />
  )
}
