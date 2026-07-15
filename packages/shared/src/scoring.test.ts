import { describe, expect, it } from 'vitest'
import {
  type BenchmarkBounds,
  categoryFractions,
  computeMovers,
  normalizeScore,
  RADAR_AXES,
  radarVector,
  rankByIndex,
  toIndexScale,
} from './scoring'

const arena: BenchmarkBounds = {
  slug: 'arena',
  category: 'human-preference',
  normMin: 1150,
  normMax: 1520,
}
const mmlu: BenchmarkBounds = { slug: 'mmlu', category: 'knowledge', normMin: 40, normMax: 100 }
const gpqa: BenchmarkBounds = { slug: 'gpqa', category: 'reasoning', normMin: 20, normMax: 100 }
const hle: BenchmarkBounds = { slug: 'hle', category: 'reasoning', normMin: 0, normMax: 100 }
const ALL = [arena, mmlu, gpqa, hle]

describe('normalizeScore', () => {
  it('min-max normalizes against curated bounds', () => {
    expect(normalizeScore(mmlu, 70)).toBeCloseTo(0.5, 10)
    expect(normalizeScore(arena, 1520)).toBe(1)
  })
  it('clamps below/above bounds', () => {
    expect(normalizeScore(mmlu, 10)).toBe(0) // below normMin
    expect(normalizeScore(arena, 1600)).toBe(1)
  })
  it('passes through null', () => {
    expect(normalizeScore(mmlu, null)).toBeNull()
  })
})

describe('toIndexScale', () => {
  it('rounds to 0.1 exactly like the design (round(f×1000)/10)', () => {
    expect(toIndexScale(0.87654)).toBe(87.7)
    expect(toIndexScale(0.87644)).toBe(87.6)
  })
})

describe('categoryFractions + radar', () => {
  it('averages within a category and leaves empty categories null', () => {
    const f = categoryFractions({ gpqa: 60, hle: 30 }, ALL)
    expect(f.reasoning).toBeCloseTo((0.5 + 0.3) / 2, 10)
    expect(f.knowledge).toBeNull()
  })
  it('radar has the six design axes in order, zero-filling empty ones', () => {
    expect(RADAR_AXES.map((a) => a.key)).toEqual([
      'PREF',
      'KNOW',
      'REASON',
      'CODE',
      'MATH',
      'AGENT',
    ])
    const v = radarVector({ arena: 1335 }, ALL)
    expect(v[0]).toBeCloseTo(0.5, 10) // PREF
    expect(v.slice(1)).toEqual([0, 0, 0, 0, 0])
  })
})

describe('computeMovers', () => {
  const m = (slug: string, predecessor: string | null, index: number, ranked = true) => ({
    slug,
    name: slug,
    predecessor,
    index,
    ranked,
  })
  it('keeps only positive lineage deltas, sorted desc, top N', () => {
    const movers = computeMovers(
      [
        m('a1', null, 50),
        m('a2', 'a1', 62), // +12
        m('b1', null, 70),
        m('b2', 'b1', 68), // −2 → dropped
        m('c1', null, 10),
        m('c2', 'c1', 15.5), // +5.5
      ],
      5,
    )
    expect(movers.map((x) => [x.slug, x.prevSlug, x.delta])).toEqual([
      ['a2', 'a1', 12],
      ['c2', 'c1', 5.5],
    ])
  })
  it('same-day releases (no predecessor) produce no mover', () => {
    expect(computeMovers([m('x', null, 90), m('y', null, 80)])).toEqual([])
  })
  it('excludes edges touching an unrated model (D20)', () => {
    // an unbenchmarked config sitting at index 0 must not manufacture a phantom mover
    const movers = computeMovers([
      m('base', null, 60),
      m('cfg-medium', 'base', 0, false), // unrated 0-index config
      m('next', 'cfg-medium', 71), // would be +71 vs the 0-index config, but the edge is gated
    ])
    expect(movers).toEqual([])
  })
})

describe('rankByIndex', () => {
  it('ranks by index desc with slug tiebreak', () => {
    const ranks = rankByIndex([
      { slug: 'b', index: 80 },
      { slug: 'a', index: 90 },
      { slug: 'c', index: 80 },
    ])
    expect(ranks.get('a')).toBe(1)
    expect(ranks.get('b')).toBe(2)
    expect(ranks.get('c')).toBe(3)
  })
})
