import { useState } from 'react'
import { ChartTipBox, useChartTip } from './chart-tip'
import { sparklinePoints, sparklineX, sparklineY } from './scales'

export interface SparklineDot {
  value: number
  label: string
  active?: boolean
}

/** Family index-progression sparkline (design model-detail card, viewBox 280×64). */
export function Sparkline({ dots }: { dots: SparklineDot[] }) {
  const { containerRef, tip, show, hide } = useChartTip()
  const [hovered, setHovered] = useState<number | null>(null)
  const values = dots.map((d) => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  return (
    <div ref={containerRef} className="relative">
      <svg
        viewBox="0 0 280 64"
        className="mt-2.5 block h-auto w-full"
        role="img"
        aria-label="Index progression"
      >
        <polyline
          points={sparklinePoints(values)}
          fill="none"
          stroke="var(--acc)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {dots.map((d, i) => {
          const cx = sparklineX(i, dots.length).toFixed(1)
          const cy = sparklineY(d.value, min, max).toFixed(1)
          const lifted = hovered === i
          return (
            <g
              key={d.label}
              onPointerEnter={(e) => {
                setHovered(i)
                show(e.currentTarget, d.label)
              }}
              onPointerLeave={() => {
                setHovered(null)
                hide()
              }}
            >
              {/* transparent hit target — the painted dot alone is a pinpoint */}
              <circle cx={cx} cy={cy} r="11" fill="transparent" />
              <circle
                cx={cx}
                cy={cy}
                r={lifted ? (d.active ? 5 : 4) : d.active ? 4 : 2.5}
                fill={d.active || lifted ? 'var(--acc)' : 'var(--mut)'}
                stroke="var(--card)"
                strokeWidth="1.5"
                data-testid="spark-dot"
              />
            </g>
          )
        })}
      </svg>
      <ChartTipBox tip={tip} />
    </div>
  )
}
