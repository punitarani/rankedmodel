# Fine-tuning Model Selector (`/finetune`) — Design

**Date:** 2026-07-19 · **Decision:** D25 · **Contract:** C8

## Problem

Users deciding which open model to fine-tune / post-train have no tool on the site. `/models`
filters static facets; `/hardware` answers "can I *run* it". Nothing answers: can I *train* it
on my GPUs, what will it cost, and which candidate is best for my tasks?

## Decisions (user-confirmed)

1. **Interaction model:** constraint panel + ranked results with expandable per-model "why"
   breakdowns — not a wizard, not a plain filter page.
2. **Training VRAM & cost are formula-derived** from `params` (documented contract C8, like
   C2's Q4×1.08 rule). No new curated corpus data.
3. **Task axes:** the existing 7 `categoryIdx` axes plus a derived **docs** (document
   understanding) axis computed from DocVQA/OCRBench/ChartQA/CharXiv scores already in the
   snapshot. Creative writing maps to human-preference, labeled honestly ("Chat / creative").
   Video/audio are modality filter chips only — no invented quality scores.
4. **Scope: open weights only** (`openness !== 'closed'`, `params != null`). Closed models
   can't have their weights tuned; hosted fine-tuning APIs are out of scope.

## Architecture

Mirrors the explorer exactly: URL params (zod, C4 conventions) → pure selector in
`packages/shared` → screen component rendering rows. No server round-trips; the catalog
snapshot already carries everything needed.

- `packages/shared/src/license-class.ts` — ordered keyword classifier over the free-text
  `license` field → permissive / conditional / research-only / proprietary. Verified against
  all 103 distinct real license strings (188 / 125 / 52 models). Threshold filter semantics.
- `packages/shared/src/finetune-fit.ts` — the C8 engine: per-method memory parts
  (QLoRA / LoRA / full), verdicts at C2's 0.8/1.0 ratio boundaries, `GPU_TRAIN_ECON`,
  `DATASET_PRESETS`, `estimateTrainCost`. Anchored to the QLoRA paper.
- `packages/shared/src/finetune-select.ts` — `selectFinetune(models, query, gpus, benchmarks)`:
  hard-constraint filter (openness, q, license threshold, size, modalities, train feasibility,
  inference fit, budget) then ranking (equal-weight mean over selected axes, nulls excluded
  not penalized; empty selection → Frontier index order). Returns rows carrying every number
  the UI shows — the web app renders, never recomputes.
- `apps/web/src/routes/finetune.tsx` + `components/finetune/{finetune-screen,finetune-rail,finetune-row}.tsx`
  — rail (task chips, training GPU × count, inference GPU, method, dataset preset, budget,
  license, size, modality chips), ranked table (unvirtualized, hardware-page precedent),
  single-open accordion breakdown (per-method VRAM formula lines, cost derivation, inference
  verdict, per-axis quality bars, license class + raw string, model-page link), empty state
  with one-param relax hints ("Remove the budget cap → 41 models").
- `apps/web/src/lib/finetune-profile.ts` — localStorage persistence of `{tgpu, tn, igpu}`
  under its own key (never reuses `modelbeats.hardware-profile`).

## Honesty rules

- Estimates are labeled as estimates and derived in one contract table (methodology shows the
  math; the breakdown line IS the formula).
- No coverage → `—` and sort-last, never a fake zero (D20 philosophy).
- Unknown license → conditional, never permissive; raw license string always shown.
- Mac training: fit verdicts yes, cost `—` (no comparable rental market); unknown cost passes
  budget caps.

## Verification

Unit anchors in `finetune-fit.test.ts` / `finetune-select.test.ts` / `license-class.test.ts`;
e2e in `apps/web/e2e/finetune.spec.ts`; methodology section documents C8 for readers.

## Revision (2026-07-19, same day — critical accuracy pass)

1. **Coverage-tiered ranking** — models scored on more of the selected axes always outrank
   models scored on fewer (the mean-over-available scheme let a docs-only model cherry-pick
   #1 over models scored on both selected axes). Rows show `n/m` coverage.
2. **Checkpoint dedupe** — reasoning-effort/mode variants (thinking / non-thinking) collapse
   to the default config: 365 open rows → 345 distinct weight artifacts.
3. **Instruction-following axis** — derived from IFEval (128 open models), the most
   fine-tuning-relevant single benchmark; axes reordered to decision relevance
   (agents → reasoning → coding → math → if → knowledge → docs → vision → chat quality);
   "Chat / creative" honestly renamed "Chat quality".
4. **Post-training recipes SFT / DPO / RL (GRPO)** — DPO adds a frozen bf16 reference
   (+2P under full FT; free under LoRA/QLoRA via the adapter-off base), RL adds
   rollout buffers (+max(2, 0.1·P)); compute multipliers ×1/×2/×4.
5. **New filters** — min context window, MoE/non-MoE architecture, organization, and
   vision as a required modality.
6. **Model-detail "Fine-tune it" card** — per-method VRAM, smallest fitting curated GPU
   config, QLoRA cost estimate, license class, deep link to /finetune.
7. Copy: the best-fitting method chip reads "max fidelity", not "recommended".

## QA round (2026-07-19 — 16-finding adversarial audit)

A 10-agent audit (5 dimension finders → adversarial verification) surfaced 16 confirmed
issues; all fixed:

1. **Big-model visibility (high)** — the feasibility gate hid 39% of trainable models at
   default hardware (everything above ~34B) with no discovery path. Added a **`show: fits|all`**
   toggle (mirrors `/hardware`): "all" keeps non-fitting models with a won't-fit verdict and a
   "needs N× GPU / exceeds 8× B200" hint. The inference-fit exclusion also relaxes to a soft
   verdict in "all" mode so big models don't re-vanish. Kimi K3 (2800B) is now findable.
2. **MoE cost basis** — FLOPs key on `archClass==='moe' ? active : total`; a MoE with
   undisclosed active (Kimi K3) shows cost "—" rather than an ~87×-inflated total-param figure.
3. **`smallestTrainConfig` over non-Mac GPUs** (moved to shared) — one fix for three findings:
   the "no rental estimate" fallback, single-Mac recommendations over datacenter GPUs, and the
   Mac usable-VRAM label ambiguity. A config suggestion is now always rentable and comparable.
4. **Recipe multipliers** DPO ×2→×2.5 (reference forward), RL ×4→×8 (representative G≈8).
5. **Table redesign** — model name gets its own dominant flex track (no inline-badge
   truncation, `title` for overflow); openness + concise license are separate badge columns;
   method is a badge; shared `FINETUNE_GRID` keeps header/rows aligned; bounded VRAM/Quality
   tracks remove wide-screen whitespace.
6. **`trainRequiredGb` helper** removes the model-detail card's bogus `capacityGb=1` verdict trap.
