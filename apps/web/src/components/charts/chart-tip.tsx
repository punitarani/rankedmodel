import { type ReactNode, useRef, useState } from 'react'

export interface ChartTip {
  x: number
  y: number
  below: boolean
  content: ReactNode
}

/**
 * Anchored tooltip for the custom SVG charts. `show(el, content)` positions the
 * tip over the element's rendered center — the same call works for pointer
 * hover and keyboard focus — clamped horizontally and flipped below the anchor
 * near the top edge. Render `<ChartTipBox tip={tip} />` inside the same
 * `relative` container that wraps the chart.
 */
export function useChartTip() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<ChartTip | null>(null)

  const show = (target: Element, content: ReactNode) => {
    const box = containerRef.current?.getBoundingClientRect()
    if (!box) return
    const r = target.getBoundingClientRect()
    const x = Math.min(Math.max(r.left + r.width / 2 - box.left, 56), box.width - 56)
    const yTop = r.top - box.top
    const below = yTop < 44
    setTip({ x, y: below ? r.bottom - box.top : yTop, below, content })
  }

  /** Anchor at a client-space point instead of an element — for nearest-point
   *  scatter layers where the hover target is the whole chart surface. */
  const showAt = (clientX: number, clientY: number, content: ReactNode) => {
    const box = containerRef.current?.getBoundingClientRect()
    if (!box) return
    const x = Math.min(Math.max(clientX - box.left, 56), box.width - 56)
    const yTop = clientY - box.top
    const below = yTop < 44
    setTip({ x, y: yTop, below, content })
  }

  return { containerRef, tip, show, showAt, hide: () => setTip(null) }
}

/** The tip itself duplicates the anchor's aria-label, so it is aria-hidden. */
export function ChartTipBox({ tip }: { tip: ChartTip | null }) {
  if (!tip) return null
  return (
    <div
      aria-hidden="true"
      data-testid="chart-tip"
      className={`pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border2 bg-panel2 px-2 py-1 font-mono text-[10.5px] leading-[1.5] shadow-md ${
        tip.below ? 'translate-y-2' : '-translate-y-[calc(100%+8px)]'
      }`}
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.content}
    </div>
  )
}
