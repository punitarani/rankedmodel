import { BENCHMARK_CATEGORIES } from './enums'
import {
  assessTrainMethods,
  DATASET_PRESETS,
  type DatasetPresetId,
  estimateTrainCost,
  type MethodAssessment,
  smallestTrainConfig,
  TRAIN_METHOD_FIDELITY,
  type TrainConfig,
  type TrainCost,
  type TrainMethod,
  type TrainRecipe,
} from './finetune-fit'
import { assessFit, type FitVerdict, type SizeClass, sizeClass } from './hardware-fit'
import { LICENSE_CLASS_ORDER, type LicenseClass, licenseClass } from './license-class'
import { type BenchmarkBounds, type BenchScores, normalizeScore, toIndexScale } from './scoring'
import type { SnapshotModel } from './snapshot'

/**
 * Fine-tune selector (contract C8) — the /finetune page's single query function.
 * Hard constraints filter, the user's task axes rank; every number a row carries is
 * precomputed here so the UI renders breakdowns without re-deriving math.
 */

/** The 7 category axes plus two derived axes (docs, instruction-following). */
export type FinetuneAxis = (typeof BENCHMARK_CATEGORIES)[number] | 'docs' | 'if'

/** Display order: fine-tuning decision relevance first (agents/reasoning/coding lead). */
export const FINETUNE_AXES: readonly FinetuneAxis[] = [
  'agents',
  'reasoning',
  'coding',
  'math',
  'if',
  'knowledge',
  'docs',
  'vision',
  'human-preference',
]

export const FINETUNE_AXIS_LABELS: Record<FinetuneAxis, string> = {
  agents: 'Agents',
  reasoning: 'Reasoning',
  coding: 'Coding',
  math: 'Math',
  if: 'Instruction following',
  knowledge: 'Knowledge',
  docs: 'Documents',
  vision: 'Vision',
  // Honest name: arena/preference scores measure chat quality, not creative writing.
  'human-preference': 'Chat quality',
}

/**
 * Derived axes (no taxonomy change): the mean of the model's normalized scores over a
 * fixed benchmark basket. `docs` = document understanding inside the vision category;
 * `if` = IFEval instruction adherence — the most fine-tuning-relevant single signal.
 * Sparse by nature; models without any basket benchmark show null.
 */
export const DOC_BENCH_SLUGS = ['docvqa', 'ocrbench', 'chartqa', 'charxiv'] as const
export const IF_BENCH_SLUGS = ['ifeval'] as const

function derivedIdx(
  bench: BenchScores,
  benchmarks: BenchmarkBounds[],
  slugs: readonly string[],
): number | null {
  const values: number[] = []
  for (const b of benchmarks) {
    if (!slugs.includes(b.slug)) continue
    const n = normalizeScore(b, bench[b.slug])
    if (n != null) values.push(n)
  }
  if (values.length === 0) return null
  return toIndexScale(values.reduce((a, v) => a + v, 0) / values.length)
}

/** Document-understanding index on the 0–100 scale; null when no doc benchmark is held. */
export function docsIdx(bench: BenchScores, benchmarks: BenchmarkBounds[]): number | null {
  return derivedIdx(bench, benchmarks, DOC_BENCH_SLUGS)
}

/** All 9 axis values: the 7 categoryIdx entries pass through, docs/if are computed. */
export function finetuneAxes(
  m: SnapshotModel,
  benchmarks: BenchmarkBounds[],
): Record<FinetuneAxis, number | null> {
  const out = {} as Record<FinetuneAxis, number | null>
  for (const cat of BENCHMARK_CATEGORIES) out[cat] = m.categoryIdx[cat] ?? null
  out.docs = derivedIdx(m.bench, benchmarks, DOC_BENCH_SLUGS)
  out.if = derivedIdx(m.bench, benchmarks, IF_BENCH_SLUGS)
  return out
}

/**
 * A trainable weight artifact: open weights, known size, and not a duplicate
 * reasoning-effort/mode row of the same checkpoint (you fine-tune weights once —
 * thinking/non-thinking modes are inference settings, so only the default config
 * represents the artifact here).
 */
export function isTrainableCheckpoint(m: SnapshotModel): boolean {
  return m.openness !== 'closed' && m.params != null && (m.effortLabel == null || m.isDefaultConfig)
}

export type FinetuneSort = 'best' | 'cost' | 'vram' | 'params' | 'date'
export type FinetuneLicenseFilter = 'any' | (typeof LICENSE_CLASS_ORDER)[number]

export interface FinetuneQuery {
  q: string
  /** Quality axes to rank by; empty = rank by Frontier index. */
  axes: FinetuneAxis[]
  /** Training hardware profile slug + GPU count (capacity = count × vramGb). */
  trainGpu: string
  trainCount: number
  /** Inference hardware profile slug, or null to skip the inference check. */
  inferGpu: string | null
  method: 'any' | TrainMethod
  recipe: TrainRecipe
  dataset: DatasetPresetId
  budgetUsd: number | null
  /** Threshold filter: 'conditional' admits permissive + conditional, etc. */
  license: FinetuneLicenseFilter
  size: SizeClass | 'any'
  /** Minimum context window in K tokens, or null for any. */
  minCtxK: number | null
  /** 'dense' = anything non-MoE (dense/SSM/hybrid); 'moe' = MoE only. */
  arch: 'any' | 'dense' | 'moe'
  /** Organization slug, or 'all'. */
  org: string
  modalities: ('vision' | 'audio' | 'video')[]
  /** 'fits' hides models too big for the chosen hardware; 'all' keeps them as won't-fit. */
  show: 'fits' | 'all'
  sort: FinetuneSort
}

/** GPU profile the selector needs — a superset of GpuBudget carrying name+kind for
 *  the "smallest config that would fit" hint. SnapshotGpu is structurally assignable. */
export interface GpuProfile {
  slug: string
  vramGb: number
  name?: string
  kind?: string
}

export interface FinetuneRow {
  m: SnapshotModel
  license: LicenseClass
  /** The highest-fidelity method that FITS the chosen hardware; null when none fit. */
  best: MethodAssessment | null
  /** The lightest method (QLoRA) at the chosen capacity — the fallback to display and
   *  size the "needs a bigger config" hint on non-fitting rows. */
  lightest: MethodAssessment
  /** Whether any method fits the chosen hardware (drives won't-fit styling). */
  fits: boolean
  /** Smallest rentable config that WOULD fit (non-fitting rows only); null = exceeds 8×. */
  neededConfig: TrainConfig | null
  /** Always all three methods in display order, for the breakdown. */
  methods: MethodAssessment[]
  estCostUsd: number | null
  cost: TrainCost | null
  /** Mean of the selected axes where covered; null = no coverage. */
  score: number | null
  /** How many of the selected axes this model has data for (D20-style tiering). */
  coverage: number
  axes: Record<FinetuneAxis, number | null>
  /** Q4 inference verdict on the chosen inference GPU; null when the check is off. */
  inferFit: FitVerdict | null
}

/** FLOPs basis for cost: MoE bills only routed (active) experts; dense bills total.
 *  Null = MoE with an undisclosed active count → cost is not estimable (show "—"). */
function flopsParams(m: SnapshotModel): number | null {
  return m.archClass === 'moe' ? m.active : m.params
}

function bestMethod(
  methods: MethodAssessment[],
  queried: 'any' | TrainMethod,
): MethodAssessment | null {
  if (queried !== 'any') return methods.find((a) => a.method === queried) ?? null
  for (const method of TRAIN_METHOD_FIDELITY) {
    const a = methods.find((x) => x.method === method)
    if (a && a.verdict !== 'wont-fit') return a
  }
  return null
}

function axisScore(
  axes: Record<FinetuneAxis, number | null>,
  selected: FinetuneAxis[],
): { score: number | null; coverage: number } {
  const values = selected.map((a) => axes[a]).filter((v): v is number => v != null)
  if (values.length === 0) return { score: null, coverage: 0 }
  return { score: values.reduce((a, v) => a + v, 0) / values.length, coverage: values.length }
}

/** Nulls-last ascending comparator over a nullable numeric key; 0 when tied. */
function byNullableAsc(a: number | null, b: number | null): number {
  if (a == null || b == null) return a == null && b == null ? 0 : a == null ? 1 : -1
  return a - b
}

/** Nulls-last descending comparator over a nullable numeric key; 0 when tied. */
function byNullableDesc(a: number | null, b: number | null): number {
  if (a == null || b == null) return a == null && b == null ? 0 : a == null ? 1 : -1
  return b - a
}

/**
 * Fine-tune filtering + ranking. `benchmarks` are the snapshot's curated bounds —
 * needed for the derived axes. Unknown trainGpu → empty (selectors never throw).
 */
export function selectFinetune(
  models: SnapshotModel[],
  query: FinetuneQuery,
  gpus: GpuProfile[],
  benchmarks: BenchmarkBounds[],
): FinetuneRow[] {
  const trainGpu = gpus.find((g) => g.slug === query.trainGpu)
  if (!trainGpu) return []
  const trainCount = Math.max(1, Math.floor(query.trainCount) || 1)
  const capacityGb = trainCount * trainGpu.vramGb
  const inferGpu = query.inferGpu == null ? null : gpus.find((g) => g.slug === query.inferGpu)
  const q = query.q.trim().toLowerCase()
  const preset = DATASET_PRESETS.find((p) => p.id === query.dataset) ?? DATASET_PRESETS[1]
  const licenseMax =
    query.license === 'any'
      ? null
      : (LICENSE_CLASS_ORDER as readonly string[]).indexOf(query.license)

  const rows: FinetuneRow[] = []
  for (const m of models) {
    if (!isTrainableCheckpoint(m) || m.params == null) continue
    if (q && !`${m.name} ${m.org} ${m.family}`.toLowerCase().includes(q)) continue
    if (query.org !== 'all' && m.orgSlug !== query.org) continue

    const license = licenseClass(m.license, m.openness)
    if (
      licenseMax != null &&
      (LICENSE_CLASS_ORDER as readonly string[]).indexOf(license) > licenseMax
    ) {
      continue
    }
    if (query.size !== 'any' && sizeClass(m.params) !== query.size) continue
    if (query.minCtxK != null && m.ctxK < query.minCtxK) continue
    if (query.arch !== 'any' && (query.arch === 'moe') !== (m.archClass === 'moe')) continue
    if (!query.modalities.every((mod) => m.modalities.includes(mod))) continue

    const methods = assessTrainMethods(m.params, capacityGb, query.recipe)
    const lightest = methods.find((a) => a.method === 'qlora') as MethodAssessment
    const best = bestMethod(methods, query.method)
    const fits = best != null && best.verdict !== 'wont-fit'
    // 'fits' mode hides models too big for the chosen hardware; 'all' keeps them
    // visible with a won't-fit verdict + a "needs a bigger config" hint (discovery).
    if (!fits && query.show !== 'all') continue
    // Sizing the hint to the method the user would use: their forced method, else QLoRA.
    const reference =
      query.method === 'any'
        ? lightest
        : (methods.find((a) => a.method === query.method) ?? lightest)
    const neededConfig = fits ? null : smallestTrainConfig(reference.requiredGb, gpus)

    let inferFit: FitVerdict | null = null
    if (inferGpu) {
      const fit = assessFit(
        { openness: m.openness, vramQ4Gb: m.vramQ4, paramsB: m.params },
        inferGpu.vramGb,
      )
      // Open + params known ⇒ assessFit never returns null here. Offload is degraded,
      // not impossible (hardware-page semantics). In 'fits' mode a hard won't-run excludes;
      // in 'all' mode (discovery) we keep the row and just record the verdict, so big models
      // that fit training but not single-GPU inference stay visible.
      if (fit == null) {
        if (query.show !== 'all') continue
      } else {
        inferFit = fit.verdict
        if (fit.verdict === 'wont-run' && query.show !== 'all') continue
      }
    }

    // Cost bills MoE active experts (dense: total); a MoE with undisclosed active → "—".
    // Non-fitting rows price on the smallest config that WOULD fit (the chosen GPU can't
    // hold the model, so its cost would be meaningless); fitting rows price on the choice.
    const fp = flopsParams(m)
    const costGpu = fits ? query.trainGpu : neededConfig?.slug
    const cost =
      fp != null && costGpu != null
        ? estimateTrainCost(fp, preset.tokens, costGpu, query.recipe)
        : null
    const estCostUsd = cost?.usd ?? null
    // Budget applies to fitting rows only; a won't-fit row is excluded by memory, not price.
    // Unknown cost (Mac / undisclosed active) is not "over budget" — the row shows "—".
    if (fits && query.budgetUsd != null && estCostUsd != null && estCostUsd > query.budgetUsd) {
      continue
    }

    const axes = finetuneAxes(m, benchmarks)
    const { score, coverage } = axisScore(axes, query.axes)
    rows.push({
      m,
      license,
      best,
      lightest,
      fits,
      neededConfig,
      methods,
      estCostUsd,
      cost,
      score,
      coverage,
      axes,
      inferFit,
    })
  }

  return rows.sort((a, b) => {
    const tie = () => a.m.slug.localeCompare(b.m.slug)
    // Fitting models always rank above non-fitting ones (only relevant in 'all' mode).
    if (a.fits !== b.fits) return a.fits ? -1 : 1
    switch (query.sort) {
      case 'cost':
        return byNullableAsc(a.estCostUsd, b.estCostUsd) || tie()
      case 'vram':
        return (
          byNullableAsc((a.best ?? a.lightest).requiredGb, (b.best ?? b.lightest).requiredGb) ||
          tie()
        )
      case 'params':
        return (b.m.params ?? 0) - (a.m.params ?? 0) || tie()
      case 'date':
        return b.m.date.localeCompare(a.m.date) || tie()
      default: {
        // 'best': COVERAGE tiers first (a model scored on 2 of 2 selected axes always
        // beats one scored on 1 — the D20 anti-cherry-pick rule), then mean score,
        // then the D20 index order.
        if (a.coverage !== b.coverage) return b.coverage - a.coverage
        const s = byNullableDesc(a.score, b.score)
        if (s !== 0) return s
        if (a.m.ranked !== b.m.ranked) return a.m.ranked ? -1 : 1
        return b.m.index - a.m.index || tie()
      }
    }
  })
}
