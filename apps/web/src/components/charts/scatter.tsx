import type * as React from 'react'
import { useState } from 'react'
import { ChartTipBox, useChartTip } from './chart-tip'
import { layoutScatterLabels, SCATTER, type ScatterYWindow, scatterX, scatterY } from './scales'

export interface ScatterPoint {
  slug: string
  name: string
  outputPrice: number
  /** Frontier Elo rating (D21) — the universal quality signal on the y-axis. */
  index: number
  open: boolean
  labeled?: boolean
}

const VB_W = 720
const VB_H = 320
/** Nearest-point capture radius in viewBox units (≈ px at rendered size). */
const NEAR = 24

/** Quality-vs-price scatter (design dashboard, viewBox 720×320, log-x). */
export function QualityPriceScatter({
  points,
  yWindow,
  onSelect,
}: {
  points: ScatterPoint[]
  yWindow: ScatterYWindow
  onSelect?: (slug: string) => void
}) {
  const { containerRef, tip, show, showAt, hide } = useChartTip()
  const [hovered, setHovered] = useState<string | null>(null)

  const positions = points.map((p) => ({
    p,
    x: scatterX(p.outputPrice),
    y: scatterY(p.index, yWindow),
  }))

  const tipContent = (p: ScatterPoint) => (
    <>
      <div className="font-sans font-semibold text-text">{p.name}</div>
      <div className="mt-px text-mut">
        <span
          className="mr-1.5 inline-block size-[7px] rounded-full"
          style={{ background: p.open ? 'var(--open)' : 'var(--closed)' }}
        />
        Elo {p.index.toFixed(1)} · ${p.outputPrice}/M out
      </div>
    </>
  )

  /** Nearest point within capture range of the pointer (dense-scatter rule:
   *  the pointer only has to be closest, not dead-center on a 10px dot). */
  const locate = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const vx = ((e.clientX - rect.left) / rect.width) * VB_W
    const vy = ((e.clientY - rect.top) / rect.height) * VB_H
    let best: (typeof positions)[number] | null = null
    let bestD = NEAR * NEAR
    for (const c of positions) {
      const d = (c.x - vx) ** 2 + (c.y - vy) ** 2
      if (d <= bestD) {
        bestD = d
        best = c
      }
    }
    return best ? { ...best, rect } : null
  }

  const clear = () => {
    setHovered(null)
    hide()
  }

  return (
    <div ref={containerRef} className="relative">
      {/* biome-ignore lint/a11y/useSemanticElements: SVG chart with interactive child links — role=img would make them presentational and <fieldset> is not an SVG element */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the svg onClick is a pointer-only nearest-point convenience; keyboard users activate the focusable <a> point links inside, which carry the same navigation */}
      <svg
        viewBox={SCATTER.viewBox}
        className={`mt-2 block h-auto w-full ${hovered ? 'cursor-pointer' : ''}`}
        role="group"
        aria-label="Overall index against output price (log scale)"
        onPointerMove={(e) => {
          const hit = locate(e)
          if (!hit) {
            if (hovered) clear()
            return
          }
          if (hit.p.slug !== hovered) {
            setHovered(hit.p.slug)
            showAt(
              hit.rect.left + (hit.x / VB_W) * hit.rect.width,
              hit.rect.top + (hit.y / VB_H) * hit.rect.height - 7,
              tipContent(hit.p),
            )
          }
        }}
        onPointerLeave={clear}
        onClick={(e) => {
          // direct hits on a point's <a> handle themselves
          if (!onSelect || (e.target as Element).closest('a')) return
          const hit = locate(e as unknown as React.PointerEvent<SVGSVGElement>)
          if (hit) onSelect(hit.p.slug)
        }}
      >
        {yWindow.yTicks.map((tick) => {
          const y = scatterY(tick, yWindow)
          return (
            <g key={tick}>
              <line
                x1={SCATTER.left}
                x2={SCATTER.right}
                y1={y.toFixed(1)}
                y2={y.toFixed(1)}
                stroke="var(--border)"
                strokeWidth="1"
              />
              <text
                x={SCATTER.left - 6}
                y={(y + 3).toFixed(1)}
                textAnchor="end"
                fontSize="10"
                fill="var(--dim)"
                fontFamily="var(--font-mono)"
                data-testid="y-tick"
              >
                {tick}
              </text>
            </g>
          )
        })}
        {SCATTER.xTicks.map((price) => (
          <text
            key={price}
            x={scatterX(price).toFixed(1)}
            y="314"
            textAnchor="middle"
            fontSize="10"
            fill="var(--dim)"
            fontFamily="var(--font-mono)"
          >
            ${price}
          </text>
        ))}
        {positions.map(({ p, x, y }) => {
          const active = hovered === p.slug
          const label = `${p.name} — Elo ${p.index.toFixed(1)} · $${p.outputPrice}/M out`
          const dotProps = {
            cx: x.toFixed(1),
            cy: y.toFixed(1),
            r: active ? 6.5 : 5,
            fill: p.open ? 'var(--open)' : 'var(--closed)',
            fillOpacity: active ? 1 : 0.75,
            stroke: active ? 'var(--text)' : 'var(--bg)',
            strokeWidth: 1,
            // Glide points to their new coordinates when the y-window auto-refits (zoom / legend filter).
            className:
              'motion-safe:transition-[cx,cy,r] motion-safe:duration-200 motion-safe:ease-out',
            'data-testid': 'scatter-point',
          }
          return onSelect ? (
            // SVG <a>: real link semantics; click is intercepted for SPA navigation.
            <a
              key={p.slug}
              href={`/models/${p.slug}`}
              aria-label={label}
              className="cursor-pointer"
              onClick={(e) => {
                e.preventDefault()
                onSelect(p.slug)
              }}
              onFocus={(e) => {
                setHovered(p.slug)
                show(e.currentTarget, tipContent(p))
              }}
              onBlur={clear}
            >
              <circle {...dotProps} />
            </a>
          ) : (
            <g key={p.slug} aria-label={label}>
              <circle {...dotProps} />
            </g>
          )
        })}
        {(() => {
          const labeled = points.filter((p) => p.labeled)
          const laidOut = layoutScatterLabels(
            labeled.map((p) => ({
              x: scatterX(p.outputPrice),
              y: scatterY(p.index, yWindow) + 3,
              text: p.name,
            })),
          )
          return labeled.map((p, i) => {
            const lbl = laidOut[i]
            return (
              <text
                key={`label-${p.slug}`}
                x={lbl.x.toFixed(1)}
                y={lbl.y.toFixed(1)}
                textAnchor={lbl.anchor}
                fontSize="10"
                fill="var(--mut)"
                pointerEvents="none"
                className="motion-safe:transition-[x,y] motion-safe:duration-200 motion-safe:ease-out"
              >
                {p.name}
              </text>
            )
          })
        })()}
      </svg>
      <ChartTipBox tip={tip} />
    </div>
  )
}
