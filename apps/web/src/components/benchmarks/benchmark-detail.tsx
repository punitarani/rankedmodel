import {
  CATEGORY_LABELS,
  type CatalogSnapshot,
  fmtParams,
  type SnapshotBenchmark,
} from '@rankedmodel/shared'
import { useNavigate } from '@tanstack/react-router'
import type * as React from 'react'
import { useState } from 'react'
import { BackLink } from '#/components/back-link'
import { ChartTipBox, useChartTip } from '#/components/charts/chart-tip'
import { InlineBar } from '#/components/charts/inline-bar'
import { histogramBins, logPos, normPct } from '#/components/charts/scales'
import { ModelTag } from '#/components/model-tag'

/** Benchmark detail: full leaderboard + distribution + score-vs-params (open models). */
export function BenchmarkDetail({
  benchmark,
  catalog,
}: {
  benchmark: SnapshotBenchmark
  catalog: CatalogSnapshot
}) {
  const navigate = useNavigate()
  const histTip = useChartTip()
  const [hoverBin, setHoverBin] = useState<number | null>(null)
  const scatterTip = useChartTip()
  const [hoverPoint, setHoverPoint] = useState<string | null>(null)
  const field = catalog.models
    .filter((m) => m.bench[benchmark.slug] != null)
    .sort((a, b) => (b.bench[benchmark.slug] as number) - (a.bench[benchmark.slug] as number))
  const fmtv = (v: number) => (benchmark.slug === 'arena' ? String(v) : `${v.toFixed(1)}%`)
  const bins = histogramBins(
    field.map((m) => m.bench[benchmark.slug] as number),
    benchmark.normMin,
    benchmark.normMax,
  )
  const maxBin = Math.max(1, ...bins.map((b) => b.count))
  const openWithParams = field.filter((m) => m.open && m.params != null)
  const paramsPoints = openWithParams.map((m) => {
    const v = m.bench[benchmark.slug] as number
    const rawY = 8 + (1 - (v - benchmark.normMin) / (benchmark.normMax - benchmark.normMin)) * 140
    return {
      m,
      v,
      x: 12 + logPos(m.params as number, 1, 1100) * 256,
      y: Math.max(8, Math.min(148, rawY)),
    }
  })

  /** Nearest point within capture range of the pointer (dense-scatter rule:
   *  the pointer only has to be closest, not dead-center on an 8px dot). */
  const locateParamsPoint = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const vx = ((e.clientX - rect.left) / rect.width) * 280
    const vy = ((e.clientY - rect.top) / rect.height) * 170
    let best: (typeof paramsPoints)[number] | null = null
    let bestD = 16 * 16
    for (const c of paramsPoints) {
      const d = (c.x - vx) ** 2 + (c.y - vy) ** 2
      if (d <= bestD) {
        bestD = d
        best = c
      }
    }
    return best ? { ...best, rect } : null
  }

  return (
    <div className="max-w-[1060px] animate-fadeup px-6 py-5 pb-12">
      <BackLink to="/benchmarks" fallbackLabel="Benchmarks" />
      <div className="mt-2.5 flex flex-wrap items-baseline gap-2.5">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{benchmark.name}</h1>
        <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-dim">
          {CATEGORY_LABELS[benchmark.category]}
        </span>
        <span className="ml-auto font-mono text-[10.5px] text-dim">
          unit {benchmark.unit} · normalized over [{benchmark.normMin}, {benchmark.normMax}]
        </span>
      </div>
      <p className="mt-1.5 max-w-[640px] text-[12.5px] leading-[1.55] text-mut">
        {benchmark.description}
      </p>

      <div className="mt-4 grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
        {/* leaderboard */}
        <div className="overflow-hidden rounded-[10px] border border-border bg-card">
          <div className="grid grid-cols-[34px_minmax(160px,1.6fr)_90px_84px_minmax(90px,1fr)] items-center gap-2 border-b border-border2 px-3.5 py-[9px] font-mono text-[9.5px] uppercase tracking-[0.05em] text-dim">
            <span>#</span>
            <span>Model</span>
            <span>Source</span>
            <span className="text-right">Score</span>
            <span>Normalized</span>
          </div>
          {field.map((m, i) => (
            <button
              key={m.slug}
              type="button"
              onClick={() => navigate({ to: '/models/$slug', params: { slug: m.slug } })}
              className="grid w-full cursor-pointer grid-cols-[34px_minmax(160px,1.6fr)_90px_84px_minmax(90px,1fr)] items-center gap-2 border-b border-border px-3.5 py-[7px] text-left text-[12.5px] hover:bg-hover"
              data-testid="leaderboard-row"
            >
              <span className="font-mono text-[11px] text-dim">{i + 1}</span>
              <span className="flex min-w-0 items-baseline gap-[7px]">
                <span className="overflow-hidden text-ellipsis whitespace-nowrap font-semibold">
                  {m.name}
                </span>
                <ModelTag open={m.open} />
              </span>
              <span
                className="font-mono text-[9.5px] uppercase text-dim"
                data-testid="provenance-badge"
              >
                {m.benchSources[benchmark.slug] ?? '—'}
              </span>
              <span className="text-right font-mono text-[11.5px] font-semibold">
                {fmtv(m.bench[benchmark.slug] as number)}
              </span>
              <InlineBar
                pct={normPct(m.bench[benchmark.slug], benchmark.normMin, benchmark.normMax)}
                color={m.open ? 'var(--open)' : 'var(--closed)'}
              />
            </button>
          ))}
        </div>

        {/* right rail */}
        <div className="flex flex-col gap-3.5">
          <div className="rounded-[10px] border border-border bg-card px-4 py-3.5">
            <div className="text-[13px] font-semibold">Score distribution</div>
            <div className="mt-px text-[11px] text-mut">
              {field.length} tracked results across the normalization window
            </div>
            <div ref={histTip.containerRef} className="relative">
              <div className="mt-3.5 flex h-[90px] items-end gap-[3px]" data-testid="histogram">
                {bins.map((b, i) => (
                  <div
                    key={b.x0}
                    onPointerEnter={(e) => {
                      setHoverBin(i)
                      histTip.show(
                        e.currentTarget,
                        <>
                          <span className="font-sans font-semibold text-text">
                            {b.count} {b.count === 1 ? 'model' : 'models'}
                          </span>
                          <span className="text-mut">
                            {' '}
                            · {b.x0.toFixed(0)}–{b.x1.toFixed(0)}
                          </span>
                        </>,
                      )
                    }}
                    onPointerLeave={() => {
                      setHoverBin(null)
                      histTip.hide()
                    }}
                    className="flex-1 rounded-t-[3px] bg-accdim"
                    style={{
                      height: Math.max(3, Math.round((b.count / maxBin) * 84)),
                      background: b.count > 0 ? 'var(--acc)' : 'var(--bar)',
                      opacity:
                        hoverBin === i && b.count > 0
                          ? 1
                          : b.count > 0
                            ? 0.35 + 0.65 * (b.count / maxBin)
                            : 1,
                    }}
                  />
                ))}
              </div>
              <div className="mt-1 flex justify-between font-mono text-[9px] text-dim">
                <span>{benchmark.normMin}</span>
                <span>{benchmark.normMax}</span>
              </div>
              <ChartTipBox tip={histTip.tip} />
            </div>
          </div>

          <div className="rounded-[10px] border border-border bg-card px-4 py-3.5">
            <div className="text-[13px] font-semibold">Score vs. parameters</div>
            <div className="mt-px text-[11px] text-mut">Open-weights models, log-x params</div>
            <div ref={scatterTip.containerRef} className="relative">
              {/* biome-ignore lint/a11y/useSemanticElements: SVG chart with interactive child links — role=img would make them presentational and <fieldset> is not an SVG element */}
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: the svg onClick is a pointer-only nearest-point convenience; keyboard users activate the focusable <a> point links inside, which carry the same navigation */}
              <svg
                viewBox="0 0 280 170"
                className={`mt-2 block h-auto w-full ${hoverPoint ? 'cursor-pointer' : ''}`}
                role="group"
                aria-label="Score against parameter count for open models"
                data-testid="params-scatter"
                onPointerMove={(e) => {
                  const hit = locateParamsPoint(e)
                  if (!hit) {
                    if (hoverPoint) {
                      setHoverPoint(null)
                      scatterTip.hide()
                    }
                    return
                  }
                  if (hit.m.slug !== hoverPoint) {
                    setHoverPoint(hit.m.slug)
                    scatterTip.showAt(
                      hit.rect.left + (hit.x / 280) * hit.rect.width,
                      hit.rect.top + (hit.y / 170) * hit.rect.height - 6,
                      <>
                        <div className="font-sans font-semibold text-text">{hit.m.name}</div>
                        <div className="mt-px text-mut">
                          {fmtv(hit.v)} · {fmtParams(hit.m.params, hit.m.active)}
                        </div>
                      </>,
                    )
                  }
                }}
                onPointerLeave={() => {
                  setHoverPoint(null)
                  scatterTip.hide()
                }}
                onClick={(e) => {
                  if ((e.target as Element).closest('a')) return
                  const hit = locateParamsPoint(e as unknown as React.PointerEvent<SVGSVGElement>)
                  if (hit) navigate({ to: '/models/$slug', params: { slug: hit.m.slug } })
                }}
              >
                {[1, 10, 100, 1000].map((p) => (
                  <text
                    key={p}
                    x={(12 + logPos(p, 1, 1100) * 256).toFixed(1)}
                    y="166"
                    textAnchor="middle"
                    fontSize="8.5"
                    fill="var(--dim)"
                    fontFamily="var(--font-mono)"
                  >
                    {p}B
                  </text>
                ))}
                {paramsPoints.map(({ m, v, x, y }) => {
                  const active = hoverPoint === m.slug
                  return (
                    // SVG <a>: real link semantics; click is intercepted for SPA navigation.
                    <a
                      key={m.slug}
                      href={`/models/${m.slug}`}
                      aria-label={`${m.name} — ${fmtv(v)} · ${fmtParams(m.params, m.active)}`}
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.preventDefault()
                        navigate({ to: '/models/$slug', params: { slug: m.slug } })
                      }}
                      onFocus={(e) => {
                        setHoverPoint(m.slug)
                        scatterTip.show(
                          e.currentTarget,
                          <>
                            <div className="font-sans font-semibold text-text">{m.name}</div>
                            <div className="mt-px text-mut">
                              {fmtv(v)} · {fmtParams(m.params, m.active)}
                            </div>
                          </>,
                        )
                      }}
                      onBlur={() => {
                        setHoverPoint(null)
                        scatterTip.hide()
                      }}
                    >
                      <circle
                        cx={x.toFixed(1)}
                        cy={y.toFixed(1)}
                        r={active ? 5.5 : 4}
                        fill="var(--open)"
                        fillOpacity={active ? 1 : 0.75}
                        stroke={active ? 'var(--text)' : 'var(--bg)'}
                        strokeWidth="1"
                        data-testid="params-point"
                      />
                    </a>
                  )
                })}
              </svg>
              <ChartTipBox tip={scatterTip.tip} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
