# RankedModel

> The definitive hub for LLM rankings, benchmarks, evaluations, model comparisons, and hardware fit.

**Status:** in active initial development — building against [ARCHITECTURE.md](ARCHITECTURE.md) and the design handoff in [docs/design-handoff/](docs/design-handoff/), reconciled in [docs/DECISIONS.md](docs/DECISIONS.md).

RankedModel collapses the four-tab workflow — *rank it, verify it, size it, run it* — into one provenance-honest, deep-linkable tool: frontier and open models, benchmark results with per-source provenance, version lineage, API pricing, quantizations, and a per-user hardware-fit engine ("what can my GPU run, at which quant, how fast — or should I just pay for the API?"). See [COMPETITIVE_ANALYSIS.md](COMPETITIVE_ANALYSIS.md) for positioning.

## Stack

TanStack Start (React 19, SSR) on Cloudflare Workers · D1 (Drizzle) + KV catalog snapshots · Tailwind v4 + shadcn/ui on Base UI · custom SVG charts · Zod v4 · Biome · Vitest + Playwright.

## Prerequisites

- **Bun ≥ 1.3** (package manager + script runner)
- **Node ≥ 24** (hosts vite / wrangler / vitest — never run wrangler tooling under the Bun runtime)

No Cloudflare account is needed for local development: D1/KV run locally via miniflare with state in `apps/web/.wrangler/state`, shared between the dev server and the `wrangler --local` CLI.

## Development

```sh
bun install
bun run publish-data:local   # validate → derive → seed local D1 → snapshot to local KV
bun run dev                  # app on http://localhost:3000
bun run ci                   # typecheck + lint + tests + build (exactly what CI runs)
```

*(Commands land incrementally with the milestones; this README is finalized at ship readiness.)*

## Repository layout

```
apps/web/          TanStack Start app (routes, components, server functions)
packages/shared/   Zod schemas, scoring engine, hardware-fit engine, formatters
packages/db/       Drizzle schema + migrations
data/              curated dataset (the repo is the CMS)
scripts/           validate / derive / seed / snapshot / publish pipeline
docs/              design handoff, decisions, deploy runbook
```
