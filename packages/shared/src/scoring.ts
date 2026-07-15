import type { BenchmarkCategory } from './enums'

/**
 * Scoring support engine (contract C1): min-max normalization powers the category
 * radar, per-benchmark bars, and the D20 coverage gate. The HEADLINE index is no
 * longer computed here — it is the Frontier Elo rating from ./bradley-terry.ts (D21).
 * Golden-tested against the curated dataset in scripts/src/derive.test.ts.
 */

export interface BenchmarkBounds {
  slug: string
  category: BenchmarkCategory
  normMin: number
  normMax: number
}

/** modelScores[benchmarkSlug] = raw score (null/undefined = not evaluated). */
export type BenchScores = Record<string, number | null | undefined>

/** Min-max normalization against curated bounds (D2), clamped to [0, 1]. */
export function normalizeScore(bounds: BenchmarkBounds, value: number | null | undefined) {
  if (value == null) return null
  return Math.max(0, Math.min(1, (value - bounds.normMin) / (bounds.normMax - bounds.normMin)))
}

/** Fraction → 0–100 index with 0.1 steps (design: `Math.round(f * 1000) / 10`). */
export function toIndexScale(fraction: number | null): number | null {
  return fraction == null ? null : Math.round(fraction * 1000) / 10
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * Ranking-eligibility floor (contract C1, D20). A model earns an overall rank only when it
 * has been measured on enough of the field to make the mean-of-normalized-scores index a
 * fair comparison — otherwise a model with a single cherry-picked high score would outrank a
 * broadly-benchmarked frontier model. The index VALUE is still computed and shown for every
 * model; this only gates the RANK, so sub-floor models are surfaced as "unrated", never
 * erased. Breadth (≥2 categories) + depth (≥3 benchmarks) defeats single-category cherry-picking.
 */
export const RANKING_MIN_BENCHMARKS = 3
export const RANKING_MIN_CATEGORIES = 2

/** Distinct benchmarks scored + distinct categories they span, for a model's scores. */
export function benchmarkCoverage(
  scores: BenchScores,
  benchmarks: BenchmarkBounds[],
): { count: number; categories: number } {
  const cats = new Set<BenchmarkCategory>()
  let count = 0
  for (const b of benchmarks) {
    if (scores[b.slug] == null) continue
    count++
    cats.add(b.category)
  }
  return { count, categories: cats.size }
}

/** True when a model has enough coverage to receive an overall rank (D20). */
export function isRankEligible(scores: BenchScores, benchmarks: BenchmarkBounds[]): boolean {
  const { count, categories } = benchmarkCoverage(scores, benchmarks)
  return count >= RANKING_MIN_BENCHMARKS && categories >= RANKING_MIN_CATEGORIES
}

/** Per-category mean of normalized scores as fractions (0–1); null = no scores in category. */
export function categoryFractions(
  scores: BenchScores,
  benchmarks: BenchmarkBounds[],
): Record<BenchmarkCategory, number | null> {
  const buckets = new Map<BenchmarkCategory, number[]>()
  for (const b of benchmarks) {
    const n = normalizeScore(b, scores[b.slug])
    if (n == null) continue
    if (!buckets.has(b.category)) buckets.set(b.category, [])
    buckets.get(b.category)?.push(n)
  }
  const out = {} as Record<BenchmarkCategory, number | null>
  for (const cat of [
    'human-preference',
    'knowledge',
    'reasoning',
    'coding',
    'math',
    'vision',
    'agents',
  ] as const) {
    out[cat] = mean(buckets.get(cat) ?? [])
  }
  return out
}

/** The design's six radar axes (vision is deliberately not an axis). */
export const RADAR_AXES = [
  { key: 'PREF', label: 'Preference', category: 'human-preference' },
  { key: 'KNOW', label: 'Knowledge', category: 'knowledge' },
  { key: 'REASON', label: 'Reasoning', category: 'reasoning' },
  { key: 'CODE', label: 'Coding', category: 'coding' },
  { key: 'MATH', label: 'Math', category: 'math' },
  { key: 'AGENT', label: 'Agents', category: 'agents' },
] as const satisfies readonly { key: string; label: string; category: BenchmarkCategory }[]

/** Radar values in axis order; axes with no data render at 0 (design). */
export function radarVector(scores: BenchScores, benchmarks: BenchmarkBounds[]): number[] {
  const fractions = categoryFractions(scores, benchmarks)
  return RADAR_AXES.map((a) => fractions[a.category] ?? 0)
}

export interface MoverInput {
  slug: string
  name: string
  predecessor: string | null
  index: number
  /** Rank-eligible (D20). Movers are only computed between two ranked models so an
   *  unbenchmarked config (index 0) can't manufacture a huge phantom gain/loss. */
  ranked: boolean
}
export interface Mover {
  slug: string
  name: string
  prevSlug: string
  prevName: string
  /** Rating gain in Elo points, rounded to 0.1 (display shows `+Δ`). */
  delta: number
}

/**
 * Biggest movers (D9): each lineage edge (model vs its predecessor) with a positive
 * index gain, sorted by gain desc, top 5. Reproduces the design's family-list adjacency
 * for the curated dataset (golden-tested) while staying well-defined for same-day
 * releases, which have no predecessor.
 */
export function computeMovers(models: MoverInput[], limit = 5): Mover[] {
  const bySlug = new Map(models.map((m) => [m.slug, m]))
  const movers: Mover[] = []
  for (const m of models) {
    if (!m.predecessor || !m.ranked) continue
    const prev = bySlug.get(m.predecessor)
    if (!prev?.ranked) continue
    const delta = Math.round((m.index - prev.index) * 10) / 10
    if (delta > 0) {
      movers.push({ slug: m.slug, name: m.name, prevSlug: prev.slug, prevName: prev.name, delta })
    }
  }
  movers.sort((a, b) => b.delta - a.delta || a.slug.localeCompare(b.slug))
  return movers.slice(0, limit)
}

/** Overall ranks: index desc, slug asc for determinism. rank[slug] = 1-based position. */
export function rankByIndex(models: { slug: string; index: number }[]): Map<string, number> {
  const sorted = [...models].sort((a, b) => b.index - a.index || a.slug.localeCompare(b.slug))
  return new Map(sorted.map((m, i) => [m.slug, i + 1]))
}
