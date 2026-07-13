/**
 * Chart math (contract C6) — constants and geometry copied verbatim from the design
 * prototype so rendered charts are pixel-identical. All pure; unit-tested.
 */

/** Quality-vs-price scatter (viewBox 720×320): x = log₁₀(output $/Mtok) over [0.06, 200]. */
export const SCATTER = {
  viewBox: '0 0 720 320',
  xMin: 0.06,
  xMax: 200,
  left: 46,
  right: 712,
  top: 12,
  bottom: 296,
  xTicks: [0.1, 1, 10, 100],
} as const

export interface ScatterYWindow {
  yMin: number
  yMax: number
  yTicks: number[]
}

/** The quality-vs-price scatter's y-axis is the overall Index (0–100, universal), not Arena
 *  Elo — arena covers only a sliver of the field, whereas every ranked model has an index. */
export const INDEX_Y_WINDOW: ScatterYWindow = { yMin: 0, yMax: 100, yTicks: [20, 40, 60, 80] }

export function scatterX(outputPrice: number): number {
  const { xMin, xMax, left, right } = SCATTER
  return (
    left +
    ((Math.log10(outputPrice) - Math.log10(xMin)) / (Math.log10(xMax) - Math.log10(xMin))) *
      (right - left)
  )
}

export function scatterY(value: number, window: ScatterYWindow): number {
  const { yMin, yMax } = window
  const { top, bottom } = SCATTER
  return bottom - ((value - yMin) / (yMax - yMin)) * (bottom - top)
}

/** Radar geometry (viewBox 280×260): center (140,126), r 92, six axes from −π/2. */
export const RADAR = { cx: 140, cy: 126, r: 92, axes: 6, rings: [0.25, 0.5, 0.75, 1] } as const

export function radarPoint(axisIndex: number, value: number): { x: number; y: number } {
  const ang = -Math.PI / 2 + axisIndex * (Math.PI / 3)
  return {
    x: RADAR.cx + Math.cos(ang) * RADAR.r * value,
    y: RADAR.cy + Math.sin(ang) * RADAR.r * value,
  }
}

export function radarPolygonPoints(values: number[], floor = 0.03): string {
  return values
    .map((v, i) => {
      const p = radarPoint(i, Math.max(floor, v))
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
    })
    .join(' ')
}

export function radarRings(): string[] {
  return RADAR.rings.map((rv) => radarPolygonPoints(new Array(RADAR.axes).fill(rv), 0))
}

export interface RadarAxisMeta {
  x2: string
  y2: string
  lx: string
  ly: string
  anchor: 'start' | 'middle' | 'end'
}

export function radarAxisMeta(axisIndex: number): RadarAxisMeta {
  const ang = -Math.PI / 2 + axisIndex * (Math.PI / 3)
  const edge = radarPoint(axisIndex, 1)
  const lx = RADAR.cx + Math.cos(ang) * (RADAR.r + 14)
  const ly = RADAR.cy + Math.sin(ang) * (RADAR.r + 14)
  const cos = Math.cos(ang)
  return {
    x2: edge.x.toFixed(1),
    y2: edge.y.toFixed(1),
    lx: lx.toFixed(1),
    ly: (ly + 3).toFixed(1),
    anchor: Math.abs(cos) < 0.3 ? 'middle' : cos > 0 ? 'start' : 'end',
  }
}

/** Family sparkline (viewBox 280×64): x 12→268 evenly (single point centers at 140), y 54→10 min-max. */
export function sparklineX(i: number, count: number): number {
  return count === 1 ? 140 : 12 + (i / (count - 1)) * 256
}

export function sparklineY(value: number, min: number, max: number): number {
  return max === min ? 32 : 54 - ((value - min) / (max - min)) * 44
}

export function sparklinePoints(values: number[]): string {
  const min = Math.min(...values)
  const max = Math.max(...values)
  return values
    .map(
      (v, i) => `${sparklineX(i, values.length).toFixed(1)},${sparklineY(v, min, max).toFixed(1)}`,
    )
    .join(' ')
}

/** Release-cadence quarter bars: height = count/max × 62px, floor 4px. */
export function cadenceHeight(count: number, maxCount: number): number {
  return Math.max(4, Math.round((count / Math.max(1, maxCount)) * 62))
}

/** Normalized bar width percent from curated bounds (design bars). */
export function normPct(value: number | null | undefined, min: number, max: number): number {
  if (value == null) return 0
  return Math.round(Math.max(0, Math.min(1, (value - min) / (max - min))) * 100)
}

/** Histogram bins over the curated bounds (benchmark detail distribution). */
export function histogramBins(
  values: number[],
  min: number,
  max: number,
  binCount = 10,
): { x0: number; x1: number; count: number }[] {
  const span = (max - min) / binCount
  const bins = Array.from({ length: binCount }, (_, i) => ({
    x0: min + i * span,
    x1: min + (i + 1) * span,
    count: 0,
  }))
  for (const v of values) {
    const i = Math.min(binCount - 1, Math.max(0, Math.floor((v - min) / span)))
    const bin = bins[i]
    if (bin) bin.count += 1
  }
  return bins
}

/** Position on a log axis, 0–1 (score-vs-params scatter). */
export function logPos(value: number, min: number, max: number): number {
  return (Math.log10(value) - Math.log10(min)) / (Math.log10(max) - Math.log10(min))
}
