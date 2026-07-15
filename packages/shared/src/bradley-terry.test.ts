import { describe, expect, it } from 'vitest'
import {
  BT_ANCHOR_RATING,
  buildBattles,
  fitBradleyTerry,
  type PairRecord,
  roundRating,
} from './bradley-terry'
import type { BenchScores } from './scoring'

/**
 * The Frontier Elo fitter (D21). Analytic fixtures are pinned from an INDEPENDENT
 * Newton-Raphson solve of the Bradley-Terry stationarity equations (not the MM
 * iteration the implementation uses), so both algorithms must agree on the MLE.
 */

describe('buildBattles', () => {
  const scores = (s: BenchScores) => s

  it('produces one battle per shared benchmark, aggregated into canonical pair records', () => {
    const byModel = new Map<string, BenchScores>([
      // x: bravo beats alpha · y: alpha-bravo tie, both beat charlie · z: alpha only (no battle)
      ['alpha', scores({ x: 10, y: 5, z: 7 })],
      ['bravo', scores({ x: 20, y: 5 })],
      ['charlie', scores({ y: 1 })],
    ])
    expect(buildBattles(byModel, ['x', 'y', 'z'])).toEqual<PairRecord[]>([
      { a: 'alpha', b: 'bravo', winsA: 0.5, winsB: 1.5 },
      { a: 'alpha', b: 'charlie', winsA: 1, winsB: 0 },
      { a: 'bravo', b: 'charlie', winsA: 1, winsB: 0 },
    ])
  })

  it('ignores null/undefined scores and benchmarks outside the provided list', () => {
    const byModel = new Map<string, BenchScores>([
      ['alpha', scores({ x: 10, y: null, w: 1 })],
      ['bravo', scores({ x: 3, y: 9, w: 2 })],
    ])
    // y: alpha has null → no battle; w: not in the benchmark list → no battle
    expect(buildBattles(byModel, ['x', 'y'])).toEqual<PairRecord[]>([
      { a: 'alpha', b: 'bravo', winsA: 1, winsB: 0 },
    ])
  })

  it('is invariant to map insertion order', () => {
    const forward = new Map<string, BenchScores>([
      ['alpha', scores({ x: 1, y: 2 })],
      ['bravo', scores({ x: 2, y: 2 })],
      ['charlie', scores({ x: 3 })],
    ])
    const backward = new Map([...forward].reverse())
    expect(buildBattles(backward, ['y', 'x'])).toEqual(buildBattles(forward, ['x', 'y']))
  })
})

describe('fitBradleyTerry', () => {
  it('rates evenly-matched players at exactly the anchor rating', () => {
    const { ratings, converged } = fitBradleyTerry(
      ['alpha', 'bravo'],
      [{ a: 'alpha', b: 'bravo', winsA: 2, winsB: 2 }],
    )
    expect(converged).toBe(true)
    expect(ratings.get('alpha')).toBe(BT_ANCHOR_RATING)
    expect(ratings.get('bravo')).toBe(BT_ANCHOR_RATING)
  })

  it('rates a single tie at exactly the anchor rating', () => {
    const { ratings } = fitBradleyTerry(
      ['alpha', 'bravo'],
      [{ a: 'alpha', b: 'bravo', winsA: 0.5, winsB: 0.5 }],
    )
    expect(ratings.get('alpha')).toBe(BT_ANCHOR_RATING)
    expect(ratings.get('bravo')).toBe(BT_ANCHOR_RATING)
  })

  it('matches the independently-solved MLE for a 3–1 record (Newton-Raphson pinned)', () => {
    // A beats B 3–1; each player has the λ=1 pseudo-tie vs the anchor. Solved
    // independently: pA=1.6071195071426743, pB=0.6222312625511711.
    const { ratings, converged } = fitBradleyTerry(
      ['alpha', 'bravo'],
      [{ a: 'alpha', b: 'bravo', winsA: 3, winsB: 1 }],
      // the default 0.01-Elo tolerance bounds the last STEP, not distance to the
      // fixed point — pin the analytic value under a much tighter stop
      { toleranceElo: 1e-9 },
    )
    expect(converged).toBe(true)
    expect(ratings.get('alpha')).toBeCloseTo(1082.419269, 4)
    expect(ratings.get('bravo')).toBeCloseTo(917.580731, 4)
  })

  it('rates a symmetric round-robin at exactly the anchor rating', () => {
    const pairs: PairRecord[] = [
      { a: 'alpha', b: 'bravo', winsA: 1, winsB: 1 },
      { a: 'alpha', b: 'charlie', winsA: 1, winsB: 1 },
      { a: 'bravo', b: 'charlie', winsA: 1, winsB: 1 },
    ]
    const { ratings } = fitBradleyTerry(['alpha', 'bravo', 'charlie'], pairs)
    for (const slug of ['alpha', 'bravo', 'charlie']) {
      expect(ratings.get(slug)).toBeCloseTo(BT_ANCHOR_RATING, 8)
    }
  })

  it('is invariant to player and pair ordering (bit-identical ratings)', () => {
    const pairs: PairRecord[] = [
      { a: 'alpha', b: 'bravo', winsA: 3, winsB: 1 },
      { a: 'bravo', b: 'charlie', winsA: 2, winsB: 0.5 },
      { a: 'alpha', b: 'charlie', winsA: 1, winsB: 1 },
    ]
    const fitA = fitBradleyTerry(['alpha', 'bravo', 'charlie'], pairs)
    const fitB = fitBradleyTerry(['charlie', 'alpha', 'bravo'], [...pairs].reverse())
    expect(Object.fromEntries(fitB.ratings)).toEqual(Object.fromEntries(fitA.ratings))
  })

  it('gives an undefeated player a finite rating that is monotone in win count', () => {
    const fit3 = fitBradleyTerry(
      ['alpha', 'bravo'],
      [{ a: 'alpha', b: 'bravo', winsA: 3, winsB: 0 }],
    )
    const fit6 = fitBradleyTerry(
      ['alpha', 'bravo'],
      [{ a: 'alpha', b: 'bravo', winsA: 6, winsB: 0 }],
    )
    const r3 = fit3.ratings.get('alpha') ?? Number.NaN
    const r6 = fit6.ratings.get('alpha') ?? Number.NaN
    expect(Number.isFinite(r3)).toBe(true)
    expect(Number.isFinite(r6)).toBe(true)
    expect(r6).toBeGreaterThan(r3)
  })

  it('never lowers a rating when the player gains a win', () => {
    const base: PairRecord[] = [
      { a: 'alpha', b: 'bravo', winsA: 3, winsB: 1 },
      { a: 'bravo', b: 'charlie', winsA: 2, winsB: 1 },
    ]
    const withWin: PairRecord[] = [
      { a: 'alpha', b: 'bravo', winsA: 4, winsB: 1 },
      { a: 'bravo', b: 'charlie', winsA: 2, winsB: 1 },
    ]
    const players = ['alpha', 'bravo', 'charlie']
    const before = fitBradleyTerry(players, base).ratings.get('alpha') ?? Number.NaN
    const after = fitBradleyTerry(players, withWin).ratings.get('alpha') ?? Number.NaN
    expect(after).toBeGreaterThan(before)
  })

  it('rates a zero-battle player at exactly the anchor rating', () => {
    const { ratings } = fitBradleyTerry(
      ['alpha', 'bravo', 'delta'],
      [{ a: 'alpha', b: 'bravo', winsA: 3, winsB: 1 }],
    )
    expect(ratings.get('delta')).toBe(BT_ANCHOR_RATING)
  })

  it('converges on a large random tournament and reports iterations', () => {
    // deterministic LCG so the fixture never varies between runs
    let seed = 42
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const players = Array.from({ length: 500 }, (_, i) => `m${String(i).padStart(3, '0')}`)
    const pairs: PairRecord[] = []
    for (let i = 0; i < 5000; i++) {
      const x = Math.floor(rand() * 500)
      const y = Math.floor(rand() * 500)
      if (x === y) continue
      const [a, b] =
        x < y
          ? [`m${String(x).padStart(3, '0')}`, `m${String(y).padStart(3, '0')}`]
          : [`m${String(y).padStart(3, '0')}`, `m${String(x).padStart(3, '0')}`]
      pairs.push(rand() < 0.5 ? { a, b, winsA: 1, winsB: 0 } : { a, b, winsA: 0, winsB: 1 })
    }
    const fit = fitBradleyTerry(players, pairs)
    expect(fit.converged).toBe(true)
    expect(fit.iterations).toBeGreaterThan(0)
    expect(fit.iterations).toBeLessThan(10_000)
  })

  it('reports converged=false when the iteration cap is too low', () => {
    const fit = fitBradleyTerry(
      ['alpha', 'bravo'],
      [{ a: 'alpha', b: 'bravo', winsA: 3, winsB: 1 }],
      { maxIterations: 1 },
    )
    expect(fit.converged).toBe(false)
  })
})

describe('roundRating', () => {
  it('rounds to one decimal', () => {
    expect(roundRating(1234.567)).toBe(1234.6)
    expect(roundRating(-148.25)).toBe(-148.2)
    expect(roundRating(1000)).toBe(1000)
  })
})
