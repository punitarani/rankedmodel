/**
 * Chart math (contract C6) — constants and geometry copied verbatim from the design
 * prototype so rendered charts are pixel-identical. All pure; unit-tested.
 */

/** Quality-vs-price scatter (viewBox 720×320): x = log₁₀(output $/Mtok) over [0.06, 200].
 *  `top` carries a margin (not the prototype's 12) so the frontier cluster and its direct
 *  labels clear the card edge (D22). Bottom stays anchored, so only the labelled top gains air. */
export const SCATTER = {
  viewBox: '0 0 720 320',
  xMin: 0.06,
  xMax: 200,
  left: 46,
  right: 712,
  top: 26,
  bottom: 296,
  xTicks: [0.1, 1, 10, 100],
} as const

export interface ScatterYWindow {
  yMin: number
  yMax: number
  yTicks: number[]
}

/** Fallback window when nothing is plotted (D21: the y-axis is the Frontier Elo rating,
 *  not Arena Elo — arena covers only a sliver of the field; every ranked model has a rating). */
export const INDEX_Y_WINDOW: ScatterYWindow = {
  yMin: 0,
  yMax: 3200,
  yTicks: [800, 1600, 2400],
}

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

/** d3-style "nice" increment: the roundest step (…1,2,5,10…) giving ~`count` intervals over `span`. */
function niceStep(span: number, count: number): number {
  const step0 = span / Math.max(1, count)
  const pow = 10 ** Math.floor(Math.log10(step0))
  const err = step0 / pow
  const factor = err >= Math.sqrt(50) ? 10 : err >= Math.sqrt(10) ? 5 : err >= Math.sqrt(2) ? 2 : 1
  return factor * pow
}

/**
 * Auto-fit the rating y-window to the data it must show (D22/D21): pad the observed
 * [min,max] slightly and lay down ~6 round interior ticks. The Frontier Elo rating has no
 * fixed domain (frontier ≈ 3100, legacy models negative), so the window is purely
 * data-driven — and because it is derived from whatever points are passed, it re-fits when
 * the open/closed legend filters the set. A ~6-interval target keeps a gridline near the
 * frontier so the top cluster stays framed rather than floating above the highest tick.
 * Falls back to INDEX_Y_WINDOW when nothing is plotted.
 */
export function fitYWindow(values: number[]): ScatterYWindow {
  if (values.length === 0) return INDEX_Y_WINDOW
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (min === max) {
    min -= 1
    max += 1
  }
  const pad = Math.max((max - min) * 0.06, 1)
  const lo = Math.floor(min - pad)
  const hi = Math.ceil(max + pad)
  if (hi <= lo) return { yMin: lo, yMax: lo + 1, yTicks: [] }
  const step = niceStep(hi - lo, 6)
  const ticks: number[] = []
  const first = Math.ceil((lo + 1e-9) / step)
  const last = Math.floor((hi - 1e-9) / step)
  for (let k = first; k <= last; k++) {
    const v = Math.round(k * step * 1000) / 1000
    if (v > lo && v < hi) ticks.push(v)
  }
  return { yMin: lo, yMax: hi, yTicks: ticks }
}

export interface ScatterLabelInput {
  x: number
  y: number
  text: string
}

export interface ScatterLabelPlaced {
  x: number
  y: number
  text: string
  anchor: 'start' | 'end'
}

// Calibrated against real getBBox() measurements of the 10px label font (avg 4.97 px/char,
// bbox height 12.92px) — not a guess, so the collision math below matches what actually renders.
const LABEL_CHAR_W = 5.0
const LABEL_LINE_GAP = 13
const LABEL_OFFSET = 8

/**
 * Declutter directly-on-chart scatter labels (D23): the handful of labeled frontier points can
 * have index scores within a fraction of a point of each other (e.g. a model and its "(High)"
 * reasoning-effort sibling), so their natural label position — the dot's own (x, y) — collides.
 * No y-axis rescaling can fix this: separating two such labels by even one text-line's height
 * would require compressing the whole window down to the width of that one cluster, stranding
 * every other point off-window. So this nudges labels apart in screen space only (dots don't
 * move): flip a label to the left of its dot if it would run past the plot's right edge, then
 * greedily push a label down whenever its estimated bounding box would overlap an already-placed
 * one — processing top-to-bottom so a label only ever gets pushed by something already above it.
 */
export function layoutScatterLabels(inputs: ScatterLabelInput[]): ScatterLabelPlaced[] {
  const anchored = inputs.map((p) => {
    const width = p.text.length * LABEL_CHAR_W
    const overflowsRight = p.x + LABEL_OFFSET + width > SCATTER.right - 4
    return overflowsRight
      ? { ...p, x: p.x - LABEL_OFFSET, width, anchor: 'end' as const }
      : { ...p, x: p.x + LABEL_OFFSET, width, anchor: 'start' as const }
  })
  const order = anchored.map((_, i) => i).sort((a, b) => anchored[a].y - anchored[b].y)
  const placed: { x0: number; x1: number; y: number }[] = []
  const out: ScatterLabelPlaced[] = new Array(inputs.length)
  for (const i of order) {
    const lbl = anchored[i]
    const x0 = lbl.anchor === 'end' ? lbl.x - lbl.width : lbl.x
    const x1 = lbl.anchor === 'end' ? lbl.x : lbl.x + lbl.width
    let y = lbl.y
    for (const p of placed) {
      if (x0 < p.x1 && x1 > p.x0 && y < p.y + LABEL_LINE_GAP) y = p.y + LABEL_LINE_GAP
    }
    placed.push({ x0, x1, y })
    out[i] = { x: lbl.x, y, text: lbl.text, anchor: lbl.anchor }
  }
  return out
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

/**
 * Relative bar window over the ratings actually rendered (D21): the Frontier Elo rating
 * has no fixed 0–100 domain, so index bars map the visible field's [min,max] onto 0–100%
 * via normPct. Degenerate/empty inputs get a padded window so widths never divide by zero.
 */
export function ratingWindow(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 }
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (min === max) {
    min -= 1
    max += 1
  }
  return { min, max }
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
