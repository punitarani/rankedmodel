import { searchModels } from '@rankedmodel/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { ModelTag } from '#/components/model-tag'
import { catalogQueryOptions } from '#/lib/catalog'

/** Full search results page (D13): grouped models / organizations / benchmarks. */
export const Route = createFileRoute('/search')({
  validateSearch: z.object({ q: z.string().max(80).default('').catch('') }),
  head: () => ({ meta: [{ title: 'Search · RankedModel' }] }),
  component: SearchRoute,
})

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.07em] text-dim">{title}</div>
    <div className="flex flex-col gap-1">{children}</div>
  </div>
)

function SearchRoute() {
  const { q } = Route.useSearch()
  const { data } = useSuspenseQuery(catalogQueryOptions)
  const needle = q.trim().toLowerCase()
  const models = needle ? searchModels(data.models, q, 50) : []
  const orgs = needle
    ? [...new Map(data.models.map((m) => [m.orgSlug, m.org])).entries()].filter(([, name]) =>
        name.toLowerCase().includes(needle),
      )
    : []
  const benchmarks = needle
    ? data.benchmarks.filter((b) => b.name.toLowerCase().includes(needle))
    : []

  return (
    <div className="max-w-[720px] animate-fadeup px-6 py-5 pb-10">
      <h1 className="text-lg font-semibold tracking-[-0.02em]">Search</h1>
      <div className="mt-0.5 text-xs text-mut">
        {needle ? (
          <span data-testid="search-summary">
            “{q}” — {models.length} models · {orgs.length} orgs · {benchmarks.length} benchmarks
          </span>
        ) : (
          'Type in the topbar (press / anywhere) or pass ?q= in the URL.'
        )}
      </div>
      <div className="mt-4 flex flex-col gap-4">
        {models.length > 0 && (
          <Group title="Models">
            {models.map((m) => (
              <Link
                key={m.slug}
                to="/models/$slug"
                params={{ slug: m.slug }}
                data-testid="search-model"
                className="flex items-baseline gap-2 rounded-md border border-border bg-card px-3 py-2 text-text no-underline hover:bg-hover hover:no-underline"
              >
                <span className="text-[12.5px] font-semibold">{m.name}</span>
                <span className="text-[11px] text-mut">
                  {m.org} · {m.family}
                </span>
                <span className="ml-auto">
                  <ModelTag open={m.open} />
                </span>
              </Link>
            ))}
          </Group>
        )}
        {orgs.length > 0 && (
          <Group title="Organizations">
            {orgs.map(([slug, name]) => (
              <Link
                key={slug}
                to="/organizations/$slug"
                params={{ slug }}
                className="rounded-md border border-border bg-card px-3 py-2 text-[12.5px] font-semibold text-text no-underline hover:bg-hover hover:no-underline"
              >
                {name}
              </Link>
            ))}
          </Group>
        )}
        {benchmarks.length > 0 && (
          <Group title="Benchmarks">
            {benchmarks.map((b) => (
              <Link
                key={b.slug}
                to="/benchmarks/$slug"
                params={{ slug: b.slug }}
                className="rounded-md border border-border bg-card px-3 py-2 text-[12.5px] font-semibold text-text no-underline hover:bg-hover hover:no-underline"
              >
                {b.name}
              </Link>
            ))}
          </Group>
        )}
      </div>
    </div>
  )
}
