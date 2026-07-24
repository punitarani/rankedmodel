# Model Beats — Architecture & Scope

> The definitive hub for LLM rankings, benchmarks, evaluations, and model comparisons.
> Status: scoping document · v1 · July 2026

---

## 1. What we're building

A public, SEO-crawlable, SPA-feel web application on Cloudflare that catalogs every major LLM release, tracks benchmark results across evaluations, and lets users compare models, trace version history, and determine hardware fit. Data is **manually curated by the admin** (you), versioned in git, and published to D1. No user accounts in v1 — saved comparisons live in the URL + localStorage.

**Design principles**

1. **URL is the state.** Every filter, sort, comparison, and view is encoded in typed search params → deep-linkable, shareable, back-button-correct.
2. **Ship the catalog to the client.** The full dataset is small (~1–2k models, ~100 benchmarks, ~50–100k result rows ≈ 1–3 MB gzipped). Ship a versioned, immutable catalog snapshot once; all filtering/sorting/searching is instant and client-side. D1 serves detail payloads and SSR.
3. **Compute at publish time, not request time.** Normalized scores, composite indexes, trend deltas, and facet counts are derived when data is published, not per-request.
4. **Read-only public app.** No mutations from the public site → aggressive edge caching everywhere, trivially safe.

---

## 2. Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **TanStack Start** (React 19, Vite) | First-class Cloudflare Workers target (`@cloudflare/vite-plugin`, official CF template). SSR for SEO/first-paint, then pure client-side SPA navigation. Typed file-based routing with **validated search params** — the backbone of "URL is the state". Server functions give a typed RPC layer with zero API boilerplate. |
| Hosting | **Cloudflare Workers + Static Assets** | CF's recommended path in 2026 (Pages is legacy-maintained). One Worker serves assets + SSR + API. Cron Triggers available if ingestion is ever automated. |
| Data / serving | **Build-time snapshot, bundled into the Worker** (D22) | The dataset is read-only and computed at publish time, so there is **no runtime database and no store**. `bun run build-catalog` builds two artifacts from `data/**` — a headline catalog snapshot and a per-model detail map — bundled into the Worker at `vite build` and served from the edge cache. A `version` content hash keys the immutable catalog URL. Removed D1, Drizzle, migrations, seed and KV (superseded D14/D15/D17 storage). |
| UI components | **shadcn/ui on Base UI** | Base UI is shadcn's default primitive layer as of July 2026 — exactly the requested combo. Tailwind v4, CSS-variable theming, dark/light via class strategy. |
| Tables | **TanStack Table v8 + TanStack Virtual** | Headless sortable/filterable/column-configurable tables; virtualized rows for the full-catalog explorer. |
| Charts | **Recharts via shadcn charts** (primary) + small custom SVG components (heatmap, timeline, radar if needed) | Keeps chart theming inside the shadcn token system. One lib; no ECharts/d3 unless a view demands it. |
| Data/server state | **TanStack Query** (bundled w/ Start) | SSR-hydrated queries, client cache, request dedupe. |
| Validation | **Zod v4** | Shared schemas: curation-file validation (CI), search-param validation (router), server-function I/O. |
| Tooling | pnpm, TypeScript strict, Biome (lint+format), Vitest, Playwright (smoke) | |

**Rejected alternatives (brief):** Next.js on Workers (via OpenNext adapter — heavier, indirect, weaker URL-state ergonomics); Astro (content-site oriented, islands model fights an app this interactive); pure Vite SPA (loses SEO for model/benchmark pages, which a "source of truth" needs); Radix primitives (superseded — Base UI now the shadcn default).

---

## 3. System architecture

```
                        ┌────────────────────────────────────────────────┐
   git repo             │              Cloudflare Worker                 │
┌──────────────┐        │  ┌──────────────┐    ┌──────────────────────┐  │
│ /data (JSON) │ CI     │  │ Static Assets│    │ TanStack Start (SSR) │  │
│  models      │ ─────▶ │  │ (JS/CSS/img) │    │  + server functions  │  │
│  benchmarks  │ publish│  └──────────────┘    └───────┬──────────────┘  │
│  results     │        │                              │                 │
│  hardware    │        │        ┌─────────────────────┼──────────────┐  │
└──────────────┘        │        ▼                     ▼              │  │
      │                 │  ┌──────────┐   ┌─────────────────┐         │  │
      │ validate (Zod)  │  │ KV       │   │ D1 (SQLite)     │         │  │
      │ derive scores   │  │ catalog  │   │ source of truth │         │  │
      │ seed D1         │  │ snapshot │   │ + read replicas │         │  │
      │ build snapshot  │  └──────────┘   └─────────────────┘         │  │
      └───────────────▶ │        Cache API (edge, SWR)                │  │
                        └────────────────────────────────────────────────┘
                                             ▲
                                   Browser: SPA after first paint,
                                   catalog snapshot cached client-side
```

**One Worker, three roles:**

1. **Static assets** — hashed, immutable JS/CSS/fonts served from CF's asset layer (free, cached at edge).
2. **SSR** — TanStack Start renders every route server-side on first hit (SEO + fast first paint), reading D1 via the Sessions API (nearest read replica). After hydration, navigation is pure client-side SPA.
3. **Data API** — TanStack server functions (typed RPC) for detail payloads; an optional public REST façade (`/api/v1/*`, Hono sub-router in the same Worker) is deferred to Phase 4.

**Two read paths, by data shape:**

| Path | Contents | Transport | Used by |
|---|---|---|---|
| **Catalog snapshot** | All models w/ headline metadata + latest headline scores + facet values + search index fields | Single versioned JSON from KV (`catalog:v{N}`), `Cache-Control: immutable`, fetched once per data version, persisted in client cache | Explorer, rankings, compare picker, hardware filter, timeline, client-side search |
| **Detail queries** | Full model record, complete benchmark history, per-benchmark leaderboards, quantization/throughput tables | Server functions → D1, edge-cached (SWR, keyed by data version) | Model pages, benchmark pages, family pages, compare detail |

This split is the core performance decision: interactions that touch *many rows shallowly* (filter 1,500 models by 12 facets) never hit the network; interactions that touch *one entity deeply* (a model's 80 benchmark results with sources and settings) are a cached point query.

---

## 4. Data model (D1 / Drizzle schema)

Principles: flat filterable columns for anything the explorer facets on; JSON columns for link bags and rarely-queried detail; every entity has a stable `slug` for URLs; provenance on every benchmark result.

> **Historical (superseded by D22).** This D1/Drizzle schema was removed on 2026-07-18. Its
> shape now lives only as the build-time serving artifacts — the C3 catalog snapshot
> (`packages/shared/src/snapshot.ts`) and the C3b per-model detail
> (`packages/shared/src/model-detail.ts`), built from `data/**`. The DDL below is kept for
> lineage/context only.

```sql
organizations   (id PK, slug UQ, name, country, type,            -- 'lab'|'company'|'community'
                 url, description)

model_families  (id PK, slug UQ, org_id FK, name, description)

models          (id PK, slug UQ, family_id FK, org_id FK,
                 name, display_name, release_date, status,       -- 'released'|'preview'|'deprecated'
                 parent_model_id FK NULL,                        -- version lineage (self-ref)
                 openness,                                       -- 'open-weights'|'open-source'|'closed'
                 license, license_url,
                 params_total_b REAL NULL,                       -- NULL = undisclosed (closed models)
                 params_active_b REAL NULL,                      -- MoE active params
                 architecture,                                   -- 'dense'|'moe'|'ssm'|'hybrid'
                 context_length INT, max_output_tokens INT NULL,
                 -- capability flags: flat booleans → cheap faceting & indexing
                 is_multimodal BOOL, input_modalities JSON, output_modalities JSON,
                 supports_function_calling BOOL, supports_tool_use BOOL,
                 is_reasoning BOOL, agent_optimized BOOL,
                 languages JSON,                                 -- ISO codes
                 api_available BOOL,
                 links JSON,                                     -- {hf, github, docs, paper, download, announcement}
                 notes TEXT, created_at, updated_at)

benchmarks      (id PK, slug UQ, name, category,                 -- 'knowledge'|'math'|'coding'|'reasoning'|'agentic'|'vision'|'arena'|'instruction'|'long-context'
                 description, methodology_url, scale_min, scale_max,
                 higher_is_better BOOL, version, is_active BOOL)

benchmark_results (id PK, model_id FK, benchmark_id FK,
                 score REAL, score_normalized REAL,              -- derived at publish (see §5)
                 evaluated_at DATE NULL,
                 source,                                         -- 'self-reported'|'independent'|'arena'|'admin-run'
                 source_url, settings JSON,                      -- shots, CoT, harness, reasoning budget
                 is_verified BOOL, notes,
                 UQ(model_id, benchmark_id, source))

-- Hardware & local-inference domain
quantizations   (id PK, model_id FK, method,                     -- 'GGUF-Q4_K_M'|'GGUF-Q8_0'|'AWQ'|'GPTQ'|'MLX-4bit'|'FP8'|'FP16'...
                 bits REAL, disk_size_gb REAL,
                 min_vram_gb REAL, min_ram_gb REAL,              -- curated or derived (§8)
                 quality_note, download_url,
                 UQ(model_id, method))

hardware_profiles (id PK, slug UQ, name,                         -- 'RTX 4090', 'M3 Max 64GB', ...
                 kind,                                           -- 'nvidia'|'amd'|'apple'|'cpu'
                 vram_gb REAL, unified_ram_gb REAL NULL, notes)

throughput_estimates (id PK, model_id FK, quantization_id FK,
                 hardware_id FK, framework,                      -- 'llama.cpp'|'vLLM'|'MLX'|'ollama'|'exllamav2'
                 tokens_per_sec REAL, context_tested INT,
                 source, source_url,
                 UQ(quantization_id, hardware_id, framework))

-- Cost comparisons
model_pricing   (id PK, model_id FK, provider,
                 input_per_mtok REAL, output_per_mtok REAL,
                 effective_date, UQ(model_id, provider, effective_date))

-- Derived at publish time (never hand-edited)
model_scores    (model_id PK/FK, overall_index REAL,
                 coding_index REAL, math_index REAL, reasoning_index REAL,
                 knowledge_index REAL, agentic_index REAL, vision_index REAL NULL,
                 arena_elo REAL NULL, rank_overall INT, rank_delta_30d INT,
                 computed_at)

meta            (key PK, value)                                  -- 'data_version', 'published_at'
```

**Indexes:** `models(release_date)`, `models(org_id)`, `models(family_id)`, `benchmark_results(benchmark_id, score DESC)`, `benchmark_results(model_id)`, `throughput_estimates(hardware_id)`, plus the UQ constraints above. At this scale D1 point/range queries are sub-millisecond; no denormalization needed beyond `model_scores`.

**Version lineage:** `parent_model_id` forms a tree (e.g., Llama 3 → 3.1 → 3.3). "Family" groups siblings and sizes (Llama 3.1 8B/70B/405B share a family; lineage tracks succession). Performance-over-time charts walk lineage chains and join `benchmark_results`.

**Deliberate omissions (v1):** no users/auth tables, no write API, no per-request aggregation tables. Extensibility: adding a benchmark = one `benchmarks` row + result rows — zero schema change; new capability flags are additive columns with defaults.

---

## 5. Curation & publish pipeline (git-based, admin-driven)

Since data is manually curated, the repo *is* the CMS. Every data change is a reviewable diff with full history — better than an admin UI for a single curator, and free rollback.

```
/data
  organizations/*.json        one file per org
  families/*.json
  models/{org}/{slug}.json    one file per model (metadata + links + quantizations)
  benchmarks/*.json
  results/{benchmark}.csv     wide or long CSV per benchmark — fastest to bulk-edit
  hardware/profiles.json
  throughput/*.csv
  pricing/*.csv
```

**Publish flow (`pnpm publish-data`, also run by CI on merge to `main`):**

1. **Validate** — Zod schemas check every file: referential integrity (slugs resolve), enum membership, score ranges vs. benchmark scale, date sanity, duplicate detection. CI fails on any violation → bad data can't ship.
2. **Derive** — compute the **Frontier Elo** (D21/D26: Bradley-Terry ratings fitted over pairwise benchmark battles — every benchmark two models both report is a head-to-head, weighted 1/√n_c per battle so a shared domain votes with √n total weight rather than linearly; the fit must converge or derive fails), category indexes (mean of min-max-normalized scores per category — capability profile only), the D20 rank-eligibility gate, ranks, and lineage movers.
3. **Seed D1** — generate idempotent upsert SQL, apply via `wrangler d1 execute`. Schema changes go through `drizzle-kit generate` → `wrangler d1 migrations apply`, always before seeding (the publish pipeline applies migrations itself as step 3).
4. **Snapshot** — build the catalog JSON (models × headline fields × headline scores × facet dictionaries), gzip, write to KV as `catalog:v{N}`, then flip `meta.data_version = N`. Old versions retained for rollback.
5. **Invalidate** — nothing to purge: all caches are keyed by data version (see §9). New version → new keys → instant global consistency.

**Scoring methodology is a public page** (`/methodology`): how normalization, category indexes, and the overall index are computed, plus provenance rules (self-reported vs. independent). Non-negotiable for a "source of truth" — credibility comes from showing the math.

**Future (Phase 4, optional):** Cron Trigger + Workflows pipeline that drafts updates from external APIs (Artificial Analysis API, LMArena leaderboard dataset, HuggingFace Hub, OpenRouter) as *PRs against `/data`* — automation proposes, admin approves. Same publish flow, no architectural change.

---

## 6. Server layer

- **TanStack Start server functions** (typed RPC, Zod-validated I/O) are the only data interface v1 needs. Each maps to one or two D1 queries via Drizzle:
  - `getModel(slug)` — full record + results + lineage + quantizations + pricing
  - `getBenchmark(slug)` / `getBenchmarkLeaderboard(slug, filters)` — results + distribution stats
  - `getFamily(slug)`, `getOrganization(slug)`
  - `getCompare(modelSlugs[])` — batched detail for up to N models
  - `getTimeline(range)`, `getDashboard()` — pre-shaped from `model_scores` + recent releases
  - `getCatalog()` — returns KV snapshot (or D1 fallback), `immutable` cache headers
- **D1 Sessions API** with `first-unconstrained` for all public reads → served by nearest read replica. (Bookmark consistency is irrelevant — the public app never writes.)
- **REST façade** (`/api/v1/models`, `/api/v1/benchmarks/:slug/results`, …) via Hono in the same Worker — Phase 4, when/if third parties want the data. Server functions and REST share the same query layer + Zod schemas.
- **SEO surface:** SSR meta/OG tags per route, `sitemap.xml` + `robots.txt` generated from D1 at request time (cached), JSON-LD structured data on model pages.

---

## 7. Frontend architecture

### 7.1 State management — three stores, strict ownership

| Store | Owns | Mechanism |
|---|---|---|
| **URL search params** | All filters, sorts, column sets, comparison selections, active tabs, chart ranges | TanStack Router typed search params + Zod validators; compact encoding (`?o=meta,mistral&p=7-70&cap=fc,tool&sort=-mmlu`) |
| **TanStack Query** | Server data: catalog snapshot (`staleTime: Infinity`, keyed by data version) + detail payloads | SSR-hydrated, cached client-side |
| **localStorage** | Saved comparisons (named URL snapshots), hardware profile, theme, table density, pinned columns | Tiny typed wrapper; no state library needed — Zustand only if cross-cutting UI state emerges |

No global client-state library in v1. If it's shareable it's in the URL; if it's server data it's in Query; if it's a personal preference it's in localStorage.

### 7.2 Route map

```
/                         Dashboard
/models                   Model Explorer (virtualized table + facet rail)
/models/$slug             Model detail — tabs: overview | benchmarks | versions | hardware | quantizations
/families/$slug           Family page (lineage graph, members table, family-over-time chart)
/organizations/$slug      Org page (all models, release cadence)
/benchmarks               Benchmark Explorer (grid by category)
/benchmarks/$slug         Benchmark detail (leaderboard, score distribution, top-movers, over-time)
/leaderboards/$category   Global rankings: overall | coding | math | reasoning | agentic | vision | arena | open-weights
/compare?m=a,b,c          Comparison view (≤6 models)
/hardware                 Hardware compatibility explorer
/quantizations            Quantization explorer (method × size × quality tradeoffs)
/timeline                 Release timeline (zoomable, filterable)
/search?q=                Unified search results (client-side index over snapshot)
/saved                    Saved comparisons (localStorage)
/methodology              Scoring & provenance methodology
```

Code-split per route; shared chunks for table/chart primitives. Preload route chunks + detail queries on link hover (Router built-in).

### 7.3 Key views — functional spec

| View | Data | Core components & interactions |
|---|---|---|
| **Dashboard** | snapshot + `getDashboard()` | Latest releases feed · top movers (rank_delta_30d) · category leader cards · mini release-timeline sparkline · benchmark summary strip · quick-compare widget (2 pickers → /compare) · hardware quick-check card (reads local profile) |
| **Model Explorer** | snapshot | TanStack Table + Virtual, 15+ toggleable columns, facet rail (org, family, openness, params slider, ctx, license, date, capability flags, benchmark-score range filters), instant text filter, saved column presets, row → detail; every state change → URL |
| **Model detail** | `getModel` | Spec grid · capability matrix · benchmark table w/ per-source provenance badges · radar vs. family/category median · lineage tree · score-over-versions line chart · quantization table w/ "fits your hardware" indicators · pricing table · links panel |
| **Benchmark detail** | `getBenchmarkLeaderboard` | Sortable leaderboard w/ provenance filter (self-reported/independent) · score distribution histogram · score-vs-params scatter (open models) · top improvements over time |
| **Compare** | `getCompare` | Sticky model-column header · row-diff highlighting (differences emphasized, identical rows collapsible) · radar overlay · benchmark heatmap (models × benchmarks, normalized color scale) · capability matrix · cost/efficiency chart (index vs. $/Mtok; index vs. active params) · perf-over-time overlay |
| **Hardware explorer** | snapshot + quantizations | Profile builder (GPU picker or manual VRAM/RAM, OS, framework) → persisted locally → table of runnable models × best quantization × est. tok/s, with headroom bars; "what can run X?" inverse mode |
| **Timeline** | snapshot | Horizontal zoomable timeline, swim-lanes by org, dot size = params, color = openness, brush-to-filter, click → detail |
| **Leaderboards** | snapshot (`model_scores`) | Ranked tables per category w/ rank deltas, open-weights-only toggle, params-class filter |

### 7.4 Search

Client-side over the snapshot: prebuilt lightweight index (name, aliases, org, family, benchmark names) using a small fuzzy matcher (e.g., `fuse.js`-class, or hand-rolled trigram — decide at implementation). Instant-as-you-type in the command palette (`⌘K`, shadcn Command) with grouped results (models/families/benchmarks/orgs). No server round-trip; D1 FTS5 stays available if the corpus ever grows past client-side viability.

### 7.5 Visualization inventory

Recharts (shadcn-themed): line (score-over-time), scatter (score vs. params/cost), bar (leaderboards, distributions), radar (compare). Custom SVG (small, purpose-built): benchmark heatmap, release timeline, lineage tree. All charts read CSS design tokens → automatic dark/light correctness.

### 7.6 Accessibility & responsiveness

Base UI primitives are accessible by default (focus management, ARIA). Dense tables degrade to card lists < `md`; facet rail becomes a filter drawer; compare view becomes horizontally scrollable column pairs. Keyboard: full table nav, `⌘K` palette, skip links. Charts get table-fallback toggles.

---

## 8. Hardware fit engine

A pure, unit-tested function in `packages/shared` — used identically by the hardware explorer, model pages, and explorer filters:

```
weights_gb  = params_total_b × (bits / 8) × 1.08          # tensor overhead
kv_cache_gb = f(layers, kv_heads, head_dim, ctx, kv_dtype) # estimated from architecture class when exact dims unknown
required    = weights_gb + kv_cache_gb + runtime_overhead(framework)
fit         = required ≤ (vram_gb | unified_ram_gb × 0.75) # Apple unified-memory discount
```

- Curated `min_vram_gb` on a quantization row **overrides** the estimate (ground truth beats formula).
- Output is a graded verdict: `fits comfortably | fits (tight) | offload-partial | won't run`, plus est. tok/s when a matching `throughput_estimates` row exists (else interpolated from same-class hardware, clearly labeled *estimated*).
- MoE: memory needs use `params_total_b` (all experts resident); speed correlates with `params_active_b` — surfaced explicitly since it's a chronic user confusion.

---

## 9. Caching & invalidation

| Layer | Content | Policy |
|---|---|---|
| CF asset CDN | JS/CSS/fonts (hashed filenames) | `immutable, max-age=1y` |
| KV | `catalog:v{N}` | Immutable per version; client caches by version key |
| Cache API (edge) | Server-function GET responses | `s-maxage=3600, stale-while-revalidate=86400`, cache key includes `data_version` |
| Browser (TanStack Query) | Snapshot: `staleTime ∞` (version-keyed) · details: `staleTime 1h` | Version bump → new query keys → natural refetch |
| D1 read replicas | All SSR/detail reads | Sessions API, `first-unconstrained` |

Invalidation = version bump. No purge APIs, no stale-cache bugs: publish increments `data_version`, every cache key downstream changes, old entries age out.

---

## 10. Repo structure, environments, CI/CD

```
modelbeats/
  apps/web/                 TanStack Start app (routes/, components/, server/ fns)
  packages/shared/          Zod schemas, types, hardware-fit engine, score math
  packages/ui/              shadcn (Base UI) components, design tokens, chart wrappers
  data/                     curated dataset (§5)
  scripts/                  validate.ts, derive.ts, seed.ts, snapshot.ts
  drizzle/                  schema.ts + generated migrations
  wrangler.jsonc            Worker + D1 + KV bindings (local top-level + env: production)
```

- **Environments:** `production` only (one D1 + one KV + one Worker), defined in `wrangler.jsonc` `env.production`; top-level bindings drive local miniflare, which covers pre-prod verification. (Staging was descoped — see [docs/DEPLOY.md](DEPLOY.md) and the deployment-pipeline spec.)
- **CI/CD (GitHub Actions, `.github/workflows/ci.yml`):**
  - every PR & push: `ci` job (typecheck · Biome · Vitest · `validate-data` · build · budgets · migration-drift guard) + `e2e` job (Playwright against the built workerd preview)
  - push to `main`: `deploy` job, gated on `ci` + `e2e` passing, runs `bun run deploy:production` (migrate remote D1 → build → `wrangler deploy` → publish data). A merge that only touches `data/**` redeploys the same Worker and ships a new snapshot — same job, no separate path. Gated by a GitHub `production` environment (optional required-reviewer approval).
- **Observability:** Workers Logs + Analytics; optional Sentry (client + Worker). Alert on SSR error rate and p95.
- **Cost:** Workers Paid $5/mo covers Workers, D1 (10 GB, replicas), KV at this traffic/data scale. Effectively fixed-cost.

**Performance budgets:** initial route JS < 200 KB gz; catalog snapshot < 1.5 MB gz (lazy-loaded after first paint, never blocks SSR content); model-page TTFB < 100 ms warm edge; explorer filter interactions < 16 ms (all in-memory).

---

## 11. Phased roadmap

| Phase | Scope | Exit criteria |
|---|---|---|
| **0 — Foundation** (~1 wk) | Scaffold Start+CF template, wrangler envs, Drizzle schema + migrations, CI skeleton, shadcn/Base UI + tokens + dark mode, data validation pipeline with ~20 hand-seeded models / 8 benchmarks | Deployed to production; publish flow works end-to-end |
| **1 — Core catalog** (~2–3 wks) | Model Explorer (table, facets, URL state, virtualization) · Model detail (specs, benchmarks, links) · Benchmark explorer + detail · Leaderboards · client-side search + ⌘K · methodology page · SEO (meta, sitemap, JSON-LD) | Usable public v1: find, inspect, rank |
| **2 — Comparison & hardware** (~2 wks) | Compare view (diff, radar, heatmap, capability matrix, cost chart) · saved comparisons (URL + localStorage) · hardware profile + fit engine · hardware & quantization explorers | The differentiating features live |
| **3 — Temporal & dashboard** (~1–2 wks) | Release timeline · lineage trees + perf-over-versions · family/org pages · dashboard (movers, deltas, widgets) · rank-delta computation in publish pipeline | Full route map shipped |
| **4 — Extensions** (on demand) | Public REST API (Hono) · ingestion-as-PR automation (Cron/Workflows drafting `/data` PRs) · accounts (better-auth on D1) if server-side saved state ever wanted · FTS5 if search outgrows client-side | — |

Data curation runs continuously alongside all phases — it's the actual moat; the app is leverage on it.

## 12. Risks & open questions

- **Curation throughput is the bottleneck**, not tech. Mitigate: CSV-per-benchmark for bulk entry; tight Zod errors; Phase-4 automation drafts PRs. Decide early which ~30 benchmarks are "headline" (in snapshot) vs. long-tail (detail-only).
- **Benchmark comparability:** scores vary by harness/shots/CoT. The `settings` JSON + `source` provenance + methodology page handle honesty; the normalized index must document that it mixes sources.
- **Snapshot growth:** at ~5k models revisit snapshot shape (split headline scores into a second lazy file) before abandoning the client-side model.
- **D1 virtual-table export caveat:** avoid FTS5 in v1 (not needed) so `wrangler d1 export` backups stay trivial.
- **Open:** canonical model identity across providers (same weights, many hosts) — recommend: one `models` row per weight release; providers live in `model_pricing`. Confirm during Phase 0 seeding.

---

## 13. Design reconciliation (July 2026)

The Claude Design handoff (`docs/design-handoff/`) and a competitive analysis (kept private, not tracked in this repo) arrived after this document; where they diverge from §1–§12, the following **locked decisions** govern. Full rationale + shared contracts (index formula, hardware-fit thresholds, snapshot schema, URL-param conventions, design tokens, chart math, caching): **[docs/DECISIONS.md](docs/DECISIONS.md)**.

| ID | Delta vs. this document |
|---|---|
| **D22** | **No runtime database (2026-07-18).** D1, KV, Drizzle, migrations, `packages/db` and the seed pipeline are **removed**. The catalog snapshot and a per-model detail map are built from `data/**` by `bun run build-catalog` and **bundled into the Worker** at build time, served from the edge cache. This supersedes the storage/serving specifics of **§3** (no D1/KV/seed in the data flow), **§4** (the D1/Drizzle schema below is historical), **§5** (pipeline is `validate → derive → build-catalog`), **§6** (server fns read bundled JSON), **§9** (a content-hash `version` keys the immutable catalog URL; a deploy ships a new version). See [docs/DECISIONS.md](docs/DECISIONS.md) D22. |
| D1 | Brand is **Model Beats** (design prototype said "Modelboard"). |
| D2 | Score normalization uses **curated per-benchmark bounds** (`benchmarks.norm_min/norm_max`), not observed min–max (§5.2 superseded). |
| D3 | Charts are **custom SVG components**; Recharts removed from the stack (§2, §7.5 superseded). |
| D4 | `/models` is the design's **card grid**; the dense table lives at `/rankings`. TanStack Virtual deferred until ~200+ rows (§7.3 amended). |
| D5 | Compare is **3 slots**, not ≤6 (§7.2 amended). |
| D6 | Route folds: `/leaderboards/$category`→`/rankings/$category`; `/quantizations`→model detail + `/hardware`; `/timeline`→`/?tab=releases` redirect (§7.2 amended). |
| D7–D9 | Capability flags split flat-facet vs. full JSON; `source` enum gains `curated`; movers are family-succession deltas; `rank_delta_30d` populates from the 2nd publish (§4, §5 amended). |
| D10–D13 | URL-state, self-hosted fonts, `.dark`-class dark-default theming (no cookie SSR), topbar search now; ⌘K palette post-v1 (§7 amended). |
| D14 | `packages/ui` dropped; Drizzle schema lives in `packages/db` (§10 layout amended). |
| D15–D17 | Context stored in K-tokens in curated files (absolute in D1); sidebar nav gains Hardware/Benchmarks/Methodology; server surface is exactly `getCatalog` + `getModel` with all other reads as pure snapshot selectors in `packages/shared` (§6 amended). |

**Positioning note:** hardware-fit + compare are the flagship wedge; provenance + methodology are the brand; rankings are table stakes. Community curation (CONTRIBUTING + data PRs) is a day-one requirement; ingestion-automation (Phase 4) is the freshness path and is sketched in `docs/DEPLOY.md` at ship readiness.

