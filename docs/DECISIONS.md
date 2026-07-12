# Decisions & Contracts

> Locked reconciliation between `ARCHITECTURE.md`, the design handoff (`docs/design-handoff/`), and
> `COMPETITIVE_ANALYSIS.md`. Code cites these IDs. Change a decision here first, then in code.

## Part 1 — Decisions (D1–D17)

| # | Decision |
|---|---|
| **D1** | **Brand = RankedModel** (design prototype said "Modelboard"); keep the design's λ mark, sidebar layout, typography. |
| **D2** | **Index = curated-bounds normalization** (design), not observed min-max (arch §5 original). `benchmarks.norm_min/norm_max` columns added — distinct from display scale. Stable across publishes; reproduces design numbers exactly. Formula in C1. |
| **D3** | **Custom SVG charts only**; Recharts dropped. The design is 100% hand-rolled SVG (scatter, bars, sparkline, radar, cadence); custom components are pixel-faithful and lighter. |
| **D4** | `/models` = **card grid + facet rail** (design); `/rankings` = **dense sortable table** (TanStack Table headless with design markup). TanStack Virtual deferred until the catalog outgrows ~200 rows. |
| **D5** | Compare = **3 slots** (A/B/C, fixed colors `--acc/--open/--closed`), URL `?m=a,b,c`. Architecture's ≤6 relaxed to the designed 3. |
| **D6** | Route folds: `/leaderboards/$category` → `/rankings/$category`; `/quantizations` → model detail + `/hardware`; `/timeline` → redirect `/?tab=releases` (zoomable swim-lane timeline is post-v1). All other architecture routes ship. |
| **D7** | Capabilities: flat facet booleans (`is_reasoning`, `supports_function_calling`, `supports_tool_use`, `agent_optimized`; vision via modalities) **plus** full `capabilities` JSON incl. `coding` for the design's 6-chip detail view. |
| **D8** | Provenance: `source` enum gains **`curated`**; all v1 seed rows use it; the methodology page discloses it. Multi-source schema support retained — provenance is the brand feature. |
| **D9** | Movers = **family-succession index delta** (design; computable from a single snapshot). `model_scores.rank_delta_30d` stays nullable; the publish pipeline persists each version's scores so 30-day deltas populate from the 2nd publish onward. |
| **D10** | Prototype's component-state + hash routes become **typed URL search params** (Zod via `@tanstack/zod-adapter`) on real paths. localStorage only for: theme, hardware profile, saved comparisons. |
| **D11** | Fonts self-hosted via `@fontsource-variable/geist` + `@fontsource-variable/geist-mono` — no Google Fonts request. |
| **D12** | Theme: shadcn's **`.dark` class on `<html>`** convention; `:root` carries the design's *light* values, `.dark` the *dark* values; **default preference = dark** (design parity). Pre-hydration inline script reads `localStorage['rankedmodel.theme'] ?? 'dark'` and sets the class; `suppressHydrationWarning` on `<html>`. **No cookie-based SSR theming** — cached HTML stays user-agnostic. |
| **D13** | Search: topbar dropdown + `/` shortcut (design) + `/search?q=` results page (SEO). ⌘K palette → post-v1. |
| **D14** | `packages/ui` dropped (components live in `apps/web/src/components/`); Drizzle lives in **`packages/db`** rather than top-level `drizzle/` so the app and scripts import one workspace package. |
| **D15** | Context units: curated files store K-tokens exactly as the design does (`400` = 400K, `2000` = 2M); D1 stores absolute tokens (×1000 at seed); `fmtCtx` renders `128K` / `2M`. |
| **D16** | Sidebar nav = Dashboard, Rankings, Model Explorer, Compare, **Hardware, Benchmarks, Methodology** (design's 4 + 3 additions, same item styling). Footer keeps model/org counts, snapshot date, and the curation disclaimer. |
| **D17** | Server surface = **two functions**: `getCatalog` (KV snapshot, D1 fallback) and `getModel(slug)` (deep detail: multi-source results, quantizations, throughput, pricing, lineage). Everything else is pure **selectors in `packages/shared`** over the snapshot — unit-testable, identical on server and client. Preserves the architecture's two-read-path split without per-screen server functions. |

## Part 2 — Contracts (C1–C7)

Single source of truth: `packages/shared`. Every consumer (pipeline, server functions, UI) imports these.

### C1 — Scoring (`packages/shared/src/scoring.ts`)

Must reproduce the design prototype exactly (golden-tested against `docs/design-handoff/project/data/llm-data.js`):

```
norm(b, v)   = v == null ? null : clamp((v − b.norm_min) / (b.norm_max − b.norm_min), 0, 1)
index(m)     = round(mean(norm over benchmarks with a score) × 1000) / 10   # 0–100, 0.1 step; missing excluded, no coverage penalty
categoryIdx  = same mean restricted to the category's benchmarks
radar axes   = PREF:[arena] · KNOW:[mmlu] · REASON:[gpqa,hle] · CODE:[swe,lcb] · MATH:[aime,math] · AGENT:[tau]
movers       = per lineage edge (model vs its predecessor): Δindex where Δ>0, sorted desc, top 5
               — reproduces the design's family-list adjacency for the curated dataset (golden-tested);
               same-day releases are size variants with no predecessor and produce no mover
ranks        = dense rank by index desc (overall) and per benchmark by raw score desc
```

### C2 — Hardware fit (`packages/shared/src/hardware-fit.ts`)

- `required_gb = vram_q4 × 1.08` — curated `vram_q4` first; fallback estimate `params_total_b × bits/8 × 1.08` only when curated data is missing.
- Verdict, with `ratio = required_gb / capacity_gb`: `≤ 0.8` **fits-comfortably** · `≤ 1.0` **fits-tight** · `≤ 1.3` **offload-partial** · else **won't-run**.
- Boolean design parity (explorer facet, fits-on chips) = `ratio ≤ 1.0`.
- tok/s comes only from an exact `throughput_estimates` row; otherwise `null`, labeled "no data" (no interpolation in v1).
- MoE: memory needs follow **total** params (all experts resident); speed correlates with **active** params — both surfaced.

### C3 — Catalog snapshot (`packages/shared/src/snapshot.ts`)

Three-way contract: the publish pipeline writes it, `getCatalog` parses it, the UI consumes it.

```ts
{ version: number, asOf: string,
  benchmarks: [{ slug, name, category, unit, description, normMin, normMax }],
  gpus: [{ slug, name, kind, vramGb }],
  models: [{ slug, name, org, orgSlug, family, familySlug, date, open, status,
             params, active, ctxK, arch, license, langs, modalities[], caps{6},
             bench: Record<benchSlug, number|null>, benchSources: Record<benchSlug, source> (D8), price: {i,o}|null,
             vramQ4, vramFp16, quants[], tps4090, tpsNote,
             links{hf?,gh?,docs?,api?}, note,
             index, rank, categoryIdx: Record<category, number|null> }] }
```

Derived fields (`index/rank/categoryIdx`) are precomputed at publish; normalization bounds ship so bar-percent math stays client-side. KV key `catalog:v{N}` is immutable; `meta.data_version` in D1 is authoritative.

### C4 — URL search-param conventions (`apps/web/src/lib/search.ts`)

Every param optional-with-fallback (invalid → default, never throw) via plain Zod v4 `.default().catch()` passed straight to `validateSearch` (Standard Schema). `@tanstack/zod-adapter` is deliberately NOT used — it pins its own zod 3 and collapses search typing. Compact keys: `?tab=` · `?sort=-index` (leading `-` = desc) · `?org=` · `?open=all|open|closed` · `?size=any|s|m|l|xl|undisclosed` · `?gpu=` · `?caps=fc,tools` · `?q=` · `?m=a,b,c` · `?cat=`.

### C5 — Design tokens (from the dc.html, exact)

| var | dark (default pref) | light |
|---|---|---|
| bg | `#0b0b0d` | `#f6f6f7` |
| panel | `#101013` | `#ffffff` |
| panel2 | `#17171b` | `#f0f0f2` |
| card | `#121216` | `#ffffff` |
| border | `#222229` | `#e4e4e8` |
| border2 | `#2e2e37` | `#d2d2d9` |
| text | `#ececf1` | `#191920` |
| mut | `#9a9aa5` | `#5f5f6b` |
| dim | `#60606b` | `#9c9ca4` |
| acc | `#7aa7ff` | `#3565c8` |
| accdim | `rgba(122,167,255,.13)` | `rgba(53,101,200,.09)` |
| open | `#4cc38a` | `#178a56` |
| opendim | `rgba(76,195,138,.13)` | `rgba(23,138,86,.1)` |
| closed | `#b491f5` | `#7a50d6` |
| closeddim | `rgba(180,145,245,.14)` | `rgba(122,80,214,.1)` |
| bar | `#26262e` | `#e9e9ee` |
| hover | `#1a1a20` | `#f2f2f5` |

Geist (400–700) body · Geist Mono (400–600) for numerals/labels/uppercase microcopy · radii 6–10px · `fadeup` .18s ease entrance · custom scrollbar + `::selection: var(--accdim)`.

### C6 — Chart math (`apps/web/src/components/charts/`)

- **Scatter** (quality vs price, viewBox 720×320): `x = 46 + (log10(p) − log10(0.06)) / (log10(200) − log10(0.06)) × (712 − 46)`; `y = 296 − (elo − 1140) / (1520 − 1140) × (296 − 12)`; ticks y `{1200,1300,1400,1500}`, x `{$0.1,$1,$10,$100}`.
- **Radar** (viewBox 280×260): center (140,126), r 92, 6 axes starting −π/2 stepping π/3, rings at .25/.5/.75/1, floor value 0.03.
- **Family sparkline** (viewBox 280×64): x 12→268 evenly (single point → x 140), y 54→10 min-max scaled (flat series → y 32).
- **Cadence bars**: height = count/max × 62px, min 4px; latest quarter colored `--acc`, rest `--border2`.
- **Arena rail bars**: pct = (elo − 1250)/(1520 − 1250) × 100.
- **Formatters** (`packages/shared/src/format.ts`): `fmtParams` → `70B` / `400B·17Ba` (MoE) / `—`; `fmtCtx` → `128K` / `2M` (≥1000K); `fmtPrice` → `$2.5/$20` / `weights` (open, no API) / `—`; `fmtDate` → `May 2026` / `May 14, 2026` (long).

### C7 — Caching

- `/api/catalog/v{N}.json` → `Cache-Control: public, max-age=31536000, immutable`.
- SSR HTML → `public, s-maxage=3600, stale-while-revalidate=86400` + `x-data-version` header.
- TanStack Query: catalog `staleTime: Infinity` (version-keyed), `getModel` 1 h.
- Invalidation = data-version bump (new KV key, new query keys); nothing is ever purged.
