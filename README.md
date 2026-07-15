# RankedModel

> The definitive hub for LLM rankings, benchmarks, evaluations, model comparisons — and
> the only one that also answers *“can my hardware run it, at which quant, how fast?”*

RankedModel collapses the four-tab workflow — **rank it, verify it, size it, run it** —
into one provenance-honest, deep-linkable tool: every major LLM release from GPT-3
(2020) to today — 463 models across 78 orgs, 122 benchmarks with published
normalization bounds, version lineage, API pricing, quantizations, and a graded
hardware-fit engine. System design in
[ARCHITECTURE.md](ARCHITECTURE.md) (§13 reconciles it with the committed design
handoff); every locked decision and contract in [docs/DECISIONS.md](docs/DECISIONS.md).

## Screens

`/` dashboard (overview · releases · benchmarks tabs) — `/rankings` (+`/{category}`)
dense sortable table — `/models` faceted explorer with runs-on-my-GPU —
`/models/{slug}` detail with benchmark provenance, family lineage and the
Run-it-locally card — `/compare?m=a,b,c` specs/benchmarks/radar with saved comparisons —
`/hardware` graded fit verdicts by profile or by model — `/benchmarks/{slug}`
leaderboards with provenance badges and distributions — org/family hubs —
`/methodology` — full SEO surface (sitemap, JSON-LD, canonical).

**URL is the state everywhere** — every filter, sort, tab and comparison is a shareable
link. Dark (default) + light themes from the design-token palette.

## Architecture in one paragraph

One Cloudflare Worker serves static assets + TanStack Start SSR + two typed server
functions. D1 (Drizzle) is the source of truth; each publish writes an **immutable,
versioned catalog snapshot** to KV that ships to the client once and powers all
list/filter/rank interactions through pure shared selectors. Scores are computed at
publish time (`validate → derive → seed → snapshot → version bump`); the version bump
*is* cache invalidation. The rating formula (Frontier Elo — Bradley-Terry over pairwise
benchmark battles, D21), hardware-fit thresholds and snapshot schema are golden-tested
contracts (`packages/shared`).

## Development

Prereqs: **Bun ≥ 1.3** and **Node ≥ 24** (wrangler/vite/vitest run under Node — never
under the Bun runtime). No Cloudflare account needed: D1/KV run locally via miniflare,
shared between the dev server and the wrangler CLI.

```sh
bun install
bun run publish-data:local   # validate → derive → seed local D1 → snapshot to local KV
bun run dev                  # http://localhost:3000
```

| Command | What it does |
|---|---|
| `bun run ci` | typecheck → lint → unit tests → build → perf budgets (exactly what CI runs) |
| `bun run e2e` | publish local data, then Playwright against the **built** preview in workerd |
| `bun run validate-data` | Zod + cross-file integrity gates over `data/` |
| `bun run derive` | recompute `data/derived/scores.json` (committed, reviewable) |
| `bun run publish-data:local` | full local publish pipeline (idempotent) |
| `bun run deploy:staging` / `:production` | credential-gated real deploys — see [docs/DEPLOY.md](docs/DEPLOY.md) |

## Repository layout

```
apps/web/          TanStack Start app (routes, screens, server fns, e2e specs)
packages/shared/   Zod schemas · scoring engine · hardware-fit engine · selectors · formatters
packages/db/       Drizzle schema + migrations (applied via wrangler)
data/              curated dataset — the repo is the CMS (see CONTRIBUTING.md)
scripts/           validate / derive / seed / snapshot / publish / budgets / deploy
docs/              design handoff · DECISIONS.md · DEPLOY.md
```

## Data & contributions

The dataset is curated, versioned and validated in git — numbers are point-in-time
approximations with per-result provenance, disclosed on `/methodology`. To add a model
or benchmark (or fix a score), see [CONTRIBUTING.md](CONTRIBUTING.md): CI enforces the
gates, and the derived-scores diff in your PR shows exactly how rankings move.
