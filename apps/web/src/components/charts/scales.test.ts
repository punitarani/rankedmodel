import { describe, expect, it } from 'vitest'
import {
  cadenceHeight,
  histogramBins,
  logPos,
  normPct,
  radarAxisMeta,
  radarPolygonPoints,
  radarRings,
  scatterX,
  scatterY,
  sparklinePoints,
  sparklineX,
  sparklineY,
} from './scales'

describe('scatter scales (C6)', () => {
  it('maps the price domain edges onto the design pixel range', () => {
    expect(scatterX(0.06)).toBeCloseTo(46, 6)
    expect(scatterX(200)).toBeCloseTo(712, 6)
  })
  it('maps the index y-window edges: yMin → 296 (bottom), yMax → 12 (top)', () => {
    const w = { yMin: 0, yMax: 100, yTicks: [] }
    expect(scatterY(0, w)).toBeCloseTo(296, 6)
    expect(scatterY(100, w)).toBeCloseTo(12, 6)
  })
  it('log placement: $1 sits left of the midpoint between $0.06 and $200', () => {
    const mid = (46 + 712) / 2
    expect(scatterX(1)).toBeLessThan(mid)
    expect(scatterX(10)).toBeGreaterThan(mid)
  })
})

describe('radar geometry (C6)', () => {
  it('first axis points straight up from center', () => {
    const meta = radarAxisMeta(0)
    expect(Number(meta.x2)).toBeCloseTo(140, 1)
    expect(Number(meta.y2)).toBeCloseTo(126 - 92, 1)
    expect(meta.anchor).toBe('middle')
  })
  it('east-side axes anchor start, west-side anchor end', () => {
    expect(radarAxisMeta(1).anchor).toBe('start') // 30° east
    expect(radarAxisMeta(5).anchor).toBe('end') // west
  })
  it('draws four rings of six points each', () => {
    const rings = radarRings()
    expect(rings).toHaveLength(4)
    expect(rings[0]?.split(' ')).toHaveLength(6)
  })
  it('floors polygon values at 0.03 so zero-data axes stay visible', () => {
    const pts = radarPolygonPoints([0, 0, 0, 0, 0, 0])
    expect(pts.split(' ')[0]).not.toBe('140.0,126.0')
  })
})

describe('sparkline (C6)', () => {
  it('single point centers at x=140; flat series sits at y=32', () => {
    expect(sparklineX(0, 1)).toBe(140)
    expect(sparklineY(50, 50, 50)).toBe(32)
  })
  it('spans x 12→268 and y 54→10', () => {
    expect(sparklineX(0, 3)).toBe(12)
    expect(sparklineX(2, 3)).toBe(268)
    expect(sparklineY(0, 0, 100)).toBe(54)
    expect(sparklineY(100, 0, 100)).toBe(10)
    expect(sparklinePoints([0, 100])).toBe('12.0,54.0 268.0,10.0')
  })
})

describe('bars', () => {
  it('cadence bars: proportional with a 4px floor', () => {
    expect(cadenceHeight(10, 10)).toBe(62)
    expect(cadenceHeight(0, 10)).toBe(4)
  })
  it('normPct clamps outside curated bounds', () => {
    expect(normPct(70, 40, 100)).toBe(50)
    expect(normPct(10, 40, 100)).toBe(0)
    expect(normPct(null, 40, 100)).toBe(0)
  })
})

describe('histogram + logPos', () => {
  it('bins values over curated bounds with edge clamping', () => {
    const bins = histogramBins([40, 55, 56, 99.9, 100], 40, 100, 6)
    expect(bins).toHaveLength(6)
    expect(bins[0]?.count).toBe(1) // 40
    expect(bins[1]?.count).toBe(2) // 55, 56 (50–60)
    expect(bins[5]?.count).toBe(2) // 99.9 + clamped 100
    expect(bins.reduce((n, b) => n + b.count, 0)).toBe(5)
  })
  it('logPos maps decades evenly', () => {
    expect(logPos(1, 1, 100)).toBe(0)
    expect(logPos(10, 1, 100)).toBeCloseTo(0.5, 10)
    expect(logPos(100, 1, 100)).toBeCloseTo(1, 10)
  })
})
