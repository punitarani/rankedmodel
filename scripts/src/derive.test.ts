import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deriveScores } from './derive'
import { loadDataset } from './lib/load'

/**
 * GOLDEN TESTS (C1): cross-checked against an INDEPENDENT reimplementation of the design
 * formula below — it does not import packages/shared/src/scoring.ts or call anything from
 * ./derive.ts, so a regression in the real engine has to diverge from a separately-written
 * copy of the same math instead of just confirming the engine agrees with itself. A handful
 * of hand-verified real-model anchors are also pinned as literals, so the expected shape is
 * readable without running anything and a shared bug in both implementations still gets
 * caught. If these fail, the index no longer matches the documented C1 formula — do not "fix"
 * the numbers; fix the engine (or consciously amend C1 in docs/DECISIONS.md).
 */

const DATA = join(import.meta.dirname, '..', '..', 'data')

const CATEGORIES = [
  'human-preference',
  'knowledge',
  'reasoning',
  'coding',
  'math',
  'vision',
  'agents',
] as const

const SOURCE_PRECEDENCE = ['independent', 'arena', 'admin-run', 'curated', 'self-reported']

const RANKING_MIN_BENCHMARKS = 3
const RANKING_MIN_CATEGORIES = 2

interface RefModel {
  slug: string
  predecessor: string | null
  index: number
  ranked: boolean
  categoryIdx: Record<string, number | null>
  arenaElo: number | null
}

/** Reimplements C1 + the D20 coverage gate from scratch: per-benchmark headline pick by
 *  source precedence, min-max normalize clamped to [0,1], mean × 100 rounded to 0.1 (missing
 *  scores excluded, never penalized as 0); a model is rank-eligible only with ≥3 benchmarks
 *  across ≥2 categories; ranks + movers cover eligible models only. */
async function computeReference(root: string) {
  const ds = await loadDataset(root)
  const boundsBySlug = new Map(ds.benchmarks.map((b) => [b.slug, b]))

  const headline = new Map<string, Map<string, { score: number; source: string }>>()
  for (const [benchSlug, rows] of ds.results) {
    for (const row of rows) {
      let scores = headline.get(row.modelSlug)
      if (!scores) {
        scores = new Map()
        headline.set(row.modelSlug, scores)
      }
      const existing = scores.get(benchSlug)
      if (
        !existing ||
        SOURCE_PRECEDENCE.indexOf(row.source) < SOURCE_PRECEDENCE.indexOf(existing.source)
      ) {
        scores.set(benchSlug, { score: row.score, source: row.source })
      }
    }
  }

  const models: RefModel[] = ds.models.map((m) => {
    const scores = headline.get(m.slug) ?? new Map()
    const fractionsByCategory = new Map<string, number[]>()
    const allFractions: number[] = []
    const cats = new Set<string>()
    let count = 0
    for (const [benchSlug, { score }] of scores) {
      const bounds = boundsBySlug.get(benchSlug)
      if (!bounds) continue
      count++
      cats.add(bounds.category)
      const frac = Math.max(
        0,
        Math.min(1, (score - bounds.normMin) / (bounds.normMax - bounds.normMin)),
      )
      allFractions.push(frac)
      const bucket = fractionsByCategory.get(bounds.category) ?? []
      bucket.push(frac)
      fractionsByCategory.set(bounds.category, bucket)
    }
    const index = allFractions.length
      ? Math.round((allFractions.reduce((a, b) => a + b, 0) / allFractions.length) * 1000) / 10
      : 0
    const categoryIdx = Object.fromEntries(
      CATEGORIES.map((cat) => {
        const bucket = fractionsByCategory.get(cat)
        if (!bucket || bucket.length === 0) return [cat, null]
        const mean = bucket.reduce((a, b) => a + b, 0) / bucket.length
        return [cat, Math.round(mean * 1000) / 10]
      }),
    ) as Record<string, number | null>
    return {
      slug: m.slug,
      predecessor: m.predecessor,
      index,
      ranked: count >= RANKING_MIN_BENCHMARKS && cats.size >= RANKING_MIN_CATEGORIES,
      categoryIdx,
      arenaElo: scores.get('arena')?.score ?? null,
    }
  })

  // Rank eligible models only; unrated models get no rank.
  const ranked = models
    .filter((m) => m.ranked)
    .sort((a, b) => b.index - a.index || a.slug.localeCompare(b.slug))
  const rank = new Map<string, number | null>(ranked.map((m, i) => [m.slug, i + 1]))
  for (const m of models) if (!rank.has(m.slug)) rank.set(m.slug, null)

  const bySlug = new Map(models.map((m) => [m.slug, m]))
  const movers = models
    .filter((m): m is RefModel & { predecessor: string } => {
      const prev = m.predecessor ? bySlug.get(m.predecessor) : undefined
      return m.ranked && !!prev && prev.ranked
    })
    .map((m) => {
      const prev = bySlug.get(m.predecessor) as RefModel
      return {
        slug: m.slug,
        prevSlug: prev.slug,
        delta: Math.round((m.index - prev.index) * 10) / 10,
      }
    })
    .filter((m) => m.delta > 0)
    .sort((a, b) => b.delta - a.delta || a.slug.localeCompare(b.slug))
    .slice(0, 5)

  return { models, rank, movers }
}

describe('derived scores match the design formula (goldens)', () => {
  it('matches an independent reimplementation of the C1 formula for every model', async () => {
    const actual = await deriveScores(DATA)
    const ref = await computeReference(DATA)
    expect(actual.models).toHaveLength(ref.models.length)
    for (const m of actual.models) {
      const r = ref.models.find((x) => x.slug === m.slug)
      expect(r, `no reference model for ${m.slug}`).toBeDefined()
      expect(m.overallIndex).toBe(r?.index)
      expect(m.ranked).toBe(r?.ranked)
      expect(m.rankOverall).toBe(ref.rank.get(m.slug))
      expect(m.categoryIdx).toEqual(r?.categoryIdx)
      expect(m.arenaElo).toBe(r?.arenaElo)
    }
    expect(actual.movers.map((mv) => [mv.slug, mv.prevSlug, mv.delta])).toEqual(
      ref.movers.map((mv) => [mv.slug, mv.prevSlug, mv.delta]),
    )
  })

  it('scales with the dataset (relative counts, not a hardcoded seed size)', async () => {
    const ds = await loadDataset(DATA)
    const { models } = await deriveScores(DATA)
    expect(models).toHaveLength(ds.models.length)
    // sanity: this is the real ~463-model corpus, not the old 55-model synthetic seed
    expect(models.length).toBeGreaterThan(400)
  })

  it('gates a single-benchmark model out of the ranking (D20 coverage floor)', async () => {
    const { models } = await deriveScores(DATA)
    // Doubao-Seed-1.6 has exactly one tracked result (a math benchmark), so its index is high
    // but it is UNRATED — it must not receive a rank and must not top the leaderboard.
    const doubao = models.find((m) => m.slug === 'doubao-seed-1-6')
    expect(doubao?.ranked).toBe(false)
    expect(doubao?.rankOverall).toBeNull()
    // the real #1 rank goes to a broadly-benchmarked frontier model
    const top = models.find((m) => m.rankOverall === 1)
    expect(top?.slug).toBe('gpt-5-6')
  })

  it('pins a real, broadly-covered model — Llama 3.1 405B — category by category', async () => {
    const { models } = await deriveScores(DATA)
    const llama = models.find((m) => m.slug === 'llama-3-1-405b')
    expect(llama?.ranked).toBe(true)
    expect(llama?.categoryIdx).toEqual({
      'human-preference': 49.8,
      knowledge: 79.8,
      reasoning: 75,
      coding: 93,
      math: 86.6,
      vision: null,
      agents: 99.3,
    })
    expect(llama?.arenaElo).toBe(1229)
  })

  it('pins the real SWE-bench Verified leader', async () => {
    const ds = await loadDataset(DATA)
    const rows = ds.results.get('swe-bench') ?? []
    const best = Math.max(...rows.map((r) => r.score))
    const leaders = rows.filter((r) => r.score === best).map((r) => r.modelSlug)
    expect(best).toBe(95)
    expect(leaders).toContain('claude-fable-5')
  })

  it('pins the real top-5 movers (rank-eligible lineage edges only)', async () => {
    const { movers } = await deriveScores(DATA)
    expect(movers.map((m) => [m.slug, m.prevSlug, m.delta])).toEqual([
      ['gemini-1-0-pro', 'gemini-1-0-nano', 45.9],
      ['mpt-30b', 'mpt-7b', 33.4],
      ['stable-lm-2-12b', 'stable-lm-2-1-6b', 32.5],
      ['chatglm3-6b', 'chatglm2-6b', 31.5],
      ['nemotron-4-340b', 'nemotron-4-15b', 30],
    ])
  })

  it('is deterministic', async () => {
    const a = await deriveScores(DATA)
    const b = await deriveScores(DATA)
    expect(a).toEqual(b)
  })
})
