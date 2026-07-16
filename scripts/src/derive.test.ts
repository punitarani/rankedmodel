import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildBattles } from '@rankedmodel/shared'
import { describe, expect, it } from 'vitest'
import { type DerivedScores, deriveScores } from './derive'
import { loadDataset } from './lib/load'

/**
 * GOLDEN TESTS (C1/D21). The deterministic half of the pipeline — headline source
 * precedence, the D20 coverage gate, category indices, battle tallies — is cross-checked
 * against an INDEPENDENT scratch reimplementation below (it does not import the scoring
 * engine). The Bradley-Terry rating itself is an iterative MLE, so instead of a second
 * implementation it is pinned three ways: analytic unit fixtures in
 * packages/shared/src/bradley-terry.test.ts, hand-verified real-model anchors here, and
 * a byte-level match against the committed data/derived/scores.json. If these fail, the
 * index no longer matches the documented D21 contract — do not "fix" the numbers; fix
 * the engine (or consciously amend docs/DECISIONS.md and regenerate).
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

// deriveScores now runs an iterative fit (~3 s on the full corpus); share one result
// across tests instead of re-deriving per assertion.
let derivedOnce: Promise<DerivedScores> | null = null
function derived(): Promise<DerivedScores> {
  derivedOnce ??= deriveScores(DATA)
  return derivedOnce
}

interface RefModel {
  slug: string
  predecessor: string | null
  ranked: boolean
  categoryIdx: Record<string, number | null>
  arenaElo: number | null
  headline: Map<string, number>
}

/** Reimplements the deterministic half from scratch: per-benchmark headline pick by
 *  source precedence, the D20 coverage gate (≥3 benchmarks across ≥2 categories), and
 *  per-category min-max means × 100 rounded to 0.1. No imports from the real engine. */
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
    const scores = headline.get(m.slug) ?? new Map<string, { score: number; source: string }>()
    const fractionsByCategory = new Map<string, number[]>()
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
      const bucket = fractionsByCategory.get(bounds.category) ?? []
      bucket.push(frac)
      fractionsByCategory.set(bounds.category, bucket)
    }
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
      ranked: count >= RANKING_MIN_BENCHMARKS && cats.size >= RANKING_MIN_CATEGORIES,
      categoryIdx,
      arenaElo: scores.get('arena')?.score ?? null,
      headline: new Map([...scores].map(([bench, { score }]) => [bench, score])),
    }
  })

  return { ds, models }
}

describe('derived scores match the D21 contract (goldens)', () => {
  it('matches an independent reimplementation of headline precedence, coverage gate, and category indices', async () => {
    const actual = await derived()
    const ref = await computeReference(DATA)
    expect(actual.models).toHaveLength(ref.models.length)
    for (const m of actual.models) {
      const r = ref.models.find((x) => x.slug === m.slug)
      expect(r, `no reference model for ${m.slug}`).toBeDefined()
      expect(m.ranked).toBe(r?.ranked)
      expect(m.categoryIdx).toEqual(r?.categoryIdx)
      expect(m.arenaElo).toBe(r?.arenaElo)
    }
  })

  it('battle tallies match an independent pairwise count', async () => {
    const ref = await computeReference(DATA)
    // scratch tally: every benchmark both models hold a headline score on = 1 battle
    const scratch = new Map<string, { winsA: number; winsB: number }>()
    const sorted = [...ref.models].sort((a, b) => (a.slug < b.slug ? -1 : 1))
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const A = sorted[i] as RefModel
        const B = sorted[j] as RefModel
        let winsA = 0
        let winsB = 0
        for (const [bench, scoreA] of A.headline) {
          const scoreB = B.headline.get(bench)
          if (scoreB === undefined) continue
          if (scoreA > scoreB) winsA += 1
          else if (scoreA < scoreB) winsB += 1
          else {
            winsA += 0.5
            winsB += 0.5
          }
        }
        if (winsA + winsB > 0) scratch.set(`${A.slug} ${B.slug}`, { winsA, winsB })
      }
    }

    const headlineByModel = new Map(ref.models.map((m) => [m.slug, Object.fromEntries(m.headline)]))
    const battles = buildBattles(
      headlineByModel,
      ref.ds.benchmarks.map((b) => b.slug),
    )
    expect(battles).toHaveLength(scratch.size)
    for (const rec of battles) {
      expect({ winsA: rec.winsA, winsB: rec.winsB }).toEqual(scratch.get(`${rec.a} ${rec.b}`))
    }
  })

  it('reproduces the committed data/derived/scores.json exactly', async () => {
    // one assertion catches both nondeterminism and "changed the engine, forgot to regen"
    const committed = JSON.parse(await readFile(join(DATA, 'derived', 'scores.json'), 'utf8'))
    expect(await derived()).toEqual(committed)
  })

  it('pins the frontier top 5 (rating desc)', async () => {
    const { models } = await derived()
    const top5 = models
      .filter((m) => m.rankOverall != null && m.rankOverall <= 5)
      .sort((a, b) => (a.rankOverall ?? 0) - (b.rankOverall ?? 0))
    expect(top5.map((m) => [m.slug, m.overallIndex])).toEqual([
      ['gpt-5-6', 3145.7],
      ['claude-fable-5', 3012],
      ['claude-opus-4-8', 2893.4],
      ['gpt-5-4-pro', 2848.5],
      ['claude-sonnet-5', 2832.7],
    ])
  })

  it('scales with the dataset (relative counts, not a hardcoded seed size)', async () => {
    const ds = await loadDataset(DATA)
    const { models } = await derived()
    expect(models).toHaveLength(ds.models.length)
    // sanity: this is the real ~500-model corpus, not the old 55-model synthetic seed
    expect(models.length).toBeGreaterThan(400)
  })

  it('gates a single-benchmark model out of the ranking (D20 coverage floor)', async () => {
    const { models } = await derived()
    // OpenAI Codex has exactly one tracked result — its rating exists (battles on one
    // benchmark still inform it) but it is UNRATED: no rank, never tops the leaderboard.
    // (Doubao-Seed-1.6, the prior fixture, gained enough coverage in a later research round
    // to cross the D20 floor itself — a real, welcome outcome, but it stopped being a valid
    // single-benchmark example.)
    const codex = models.find((m) => m.slug === 'openai-codex')
    expect(codex?.ranked).toBe(false)
    expect(codex?.rankOverall).toBeNull()
    expect(codex?.overallIndex).toBe(19.4)
    const top = models.find((m) => m.rankOverall === 1)
    expect(top?.slug).toBe('gpt-5-6')
  })

  it('rates zero-battle models at exactly the anchor (1000) and never ranks them', async () => {
    const ds = await loadDataset(DATA)
    const withResults = new Set<string>()
    for (const rows of ds.results.values()) for (const r of rows) withResults.add(r.modelSlug)
    const { models } = await derived()
    const zeroBattle = models.filter((m) => !withResults.has(m.slug))
    expect(zeroBattle.length).toBeGreaterThan(0)
    for (const m of zeroBattle) {
      expect(m.overallIndex).toBe(1000)
      expect(m.ranked).toBe(false)
      expect(m.rankOverall).toBeNull()
    }
  })

  it('assigns ranks exactly 1..K by rating desc with slug tiebreak, finite ratings everywhere', async () => {
    const { models } = await derived()
    for (const m of models) expect(Number.isFinite(m.overallIndex), m.slug).toBe(true)
    const ranked = models
      .filter((m) => m.ranked)
      .sort((a, b) => b.overallIndex - a.overallIndex || (a.slug < b.slug ? -1 : 1))
    ranked.forEach((m, i) => {
      expect(m.rankOverall, m.slug).toBe(i + 1)
    })
    for (const m of models) if (!m.ranked) expect(m.rankOverall, m.slug).toBeNull()
  })

  it('pins a real mid-table model — Llama 3.1 405B — rating and category profile', async () => {
    const { models } = await derived()
    const llama = models.find((m) => m.slug === 'llama-3-1-405b')
    expect(llama?.ranked).toBe(true)
    expect(llama?.overallIndex).toBe(1240.5)
    expect(llama?.rankOverall).toBe(173)
    // categoryIdx stays min-max (D21 keeps the radar on D2 bounds) — unchanged literals
    expect(llama?.categoryIdx).toEqual({
      'human-preference': 69.4,
      knowledge: 79.8,
      reasoning: 75,
      coding: 86.6,
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

  it('pins the real top-5 movers and their rating self-consistency', async () => {
    const { models, movers } = await derived()
    expect(movers.map((m) => [m.slug, m.prevSlug, m.delta])).toEqual([
      ['sarvam-105b', 'sarvam-1-2b', 1550],
      ['hy3', 'hunyuan-a13b', 1025.1],
      ['smollm3-3b-think', 'smollm2-1-7b', 976.1],
      ['smollm3-3b-no-thinking', 'smollm2-1-7b', 797.5],
      ['phi-4-reasoning', 'phi-4-mini-3-8b', 764.3],
    ])
    // structural: every mover delta is the rounded rating gap between two RANKED models
    const bySlug = new Map(models.map((m) => [m.slug, m]))
    for (const mv of movers) {
      const cur = bySlug.get(mv.slug)
      const prev = bySlug.get(mv.prevSlug)
      expect(cur?.ranked).toBe(true)
      expect(prev?.ranked).toBe(true)
      const gap = Math.round(((cur?.overallIndex ?? 0) - (prev?.overallIndex ?? 0)) * 10) / 10
      expect(mv.delta).toBe(gap)
      expect(mv.delta).toBeGreaterThan(0)
    }
  })

  it('is deterministic across independent runs', { timeout: 30_000 }, async () => {
    const a = await deriveScores(DATA)
    const b = await deriveScores(DATA)
    expect(a).toEqual(b)
  })
})
