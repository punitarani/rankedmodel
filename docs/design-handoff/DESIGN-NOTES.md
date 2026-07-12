# Design Handoff — Implementation Notes

> Companion to the extracted Claude Design bundle in this directory. The bundle is the **authoritative
> visual + behavioral spec** for the five designed screens; this file is the implementer's index into it.
> Reconciliation decisions and shared contracts live in [../DECISIONS.md](../DECISIONS.md).

## Bundle contents

- `README.md` — the handoff instructions from Claude Design (read the dc.html in full; recreate pixel-perfectly in the target stack; don't copy prototype internals).
- `project/LLM Rankings Hub.dc.html` — the design: markup for all screens (lines ~50–667) + prototype logic (`renderVals()`, lines ~675–1190) containing every derived-data computation.
- `project/data/llm-data.js` — seed dataset: 10 `BENCHMARKS` (with normalization bounds `min`/`max`), 12 `GPUS`, 47 `MODELS` across 15 orgs, `ASOF: "July 11, 2026"`.
- `project/support.js` — prototype runtime shim only (mini-React “DC” framework). **No design content**; never port it.
- `project/.thumbnail` — project thumbnail from claude.ai/design.

## Screen inventory (5 designed screens)

| Screen | Prototype route | Production route | Key elements |
|---|---|---|---|
| Dashboard | `#/dashboard` | `/?tab=overview\|releases\|bench` | Stat strip (4 cards) · quality-vs-price log scatter · latest releases (8) · Arena top-8 bar rail · biggest movers · quick compare. **Releases tab:** month-grouped feed (22) · cadence quarter bars · open-vs-closed frontier + win-rate note. **Bench tab:** benchmark cards with top-5 bars. |
| Rankings | `#/rankings` | `/rankings` (+`/$category`) | Dense table: # · model (org + OPEN/CLOSED tag) · params · ctx · Index+bar · 7 benchmark cols (Arena, GPQA, HLE, SWE, LCB, AIME, MMLU) with bars (norm > 0.92 → accent) · toggle sort on every column · text filter · org select · open/closed segment · methodology footnote. |
| Model Explorer | `#/models` | `/models` | Facet rail: filter input · weights segment · org select · size-class select · runs-on-my-hardware GPU select · 5 capability chips · reset. Card grid: name+tag · org·date · mono stats (params/ctx/price) · index bar · capability chips. Sort: index / newest / largest / cheapest. |
| Model detail | `#/model/:id` | `/models/$slug` | Header: name, tag, org·family·released, note, 6 cap chips (✓/✕), Index + rank, Compare button. 8-cell meta grid. Benchmark bars with field-best marker + "best:" caption. **Run it locally** card (VRAM Q4/FP16, fits-on chips, tok/s line, quants) ⇄ **API-only** pricing card. Family sparkline + sibling list. Resources links (HF/GH/DOCS/API). Not-found state. |
| Compare | `#/compare` | `/compare?m=a,b,c` | 3 labeled selects (A/B/C = acc/open/closed colors). Specs table (12 rows, best-value highlight: max for params/ctx/index, min for prices/VRAM). Benchmarks table with per-cell bars. Sticky 6-axis radar + legend. |

Shared shell: fixed 210px sidebar (λ mark + brand, nav items, footer stats + disclaimer) · sticky topbar (page title, search input with dropdown results, theme toggle `◐ Light` / `◑ Dark`).

## Behavioral logic extracted from the prototype (implement exactly)

- **Index formula, category/radar mapping, movers, ranks** → contract C1 in DECISIONS.md.
- **Hardware fit** (`vramQ4 × 1.08 ≤ gpu.vram` boolean; graded verdicts are a production extension) → C2.
- **Chart geometry** (scatter/radar/sparkline/cadence constants) → C6.
- **Search**: case-insensitive substring over `name + org + family`, top 8, tag-colored results; `/` focuses the search input unless an input/select/textarea is active.
- **Stats strip**: models tracked · open-weights count + % · releases in trailing 90 days (vs `ASOF`, not wall clock) · open–closed frontier gap in Arena Elo with open leader named.
- **Frontier win-rate note**: `P = 100 / (1 + 10^(−ΔElo/400))`, rendered as "~N% head-to-head win rate".
- **Latest releases**: sort by date desc, take 8. **Feed**: 22 most recent grouped by month label.
- **Tag colors**: OPEN → `--open`/`--opendim`; CLOSED → `--closed`/`--closeddim`.
- **Theme**: persisted `localStorage` key (prototype: `llmhub.theme`; production: `rankedmodel.theme`), dark default.
- **Quick-compare defaults**: A = `claude-opus-4-8`, B = `deepseek-v4-5`.
- **Scatter labeled points**: claude-opus-4-8, gpt-5-5-pro, deepseek-v3-2, deepseek-v4-5, llama-3-1-8b, gemini-3-1-pro, kimi-k2-5.

## Dataset shape (llm-data.js → curated /data mapping)

See plan §3 / DECISIONS D15: `ctx` is stored in K-tokens; `params`/`active` in billions (`null` = undisclosed);
`bench` is a per-model map keyed by benchmark id; `price {i,o}` is $/Mtok (null = no hosted API);
`vramQ4/vramFp16` are curated GB figures; `caps` has 6 booleans (reason/code/vision/fc/tools/agent);
`quants` is a display list of method names. Benchmarks carry `min`/`max` **normalization bounds**
(e.g. arena 1150–1520, mmlu 40–100) — these become `norm_min`/`norm_max`, not display scales.

## Production deltas (all decided in DECISIONS.md)

Brand "Modelboard" → **RankedModel** (D1) · hash routes → real paths + typed search params (D10) ·
Google Fonts → self-hosted (D11) · `body.light` → `html.dark` with dark-default preference (D12) ·
plus the production-only routes (hardware, benchmarks, orgs/families, methodology, search, saved) that
extend this design language (D6, D16).
