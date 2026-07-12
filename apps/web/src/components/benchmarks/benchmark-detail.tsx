import {
  CATEGORY_LABELS,
  type CatalogSnapshot,
  fmtParams,
  type SnapshotBenchmark,
} from '@rankedmodel/shared'
import { Link, useNavigate } from '@tanstack/react-router'
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

  return (
    <div className="max-w-[1060px] animate-fadeup px-6 py-5 pb-12">
      <Link to="/benchmarks" className="text-[11.5px] text-mut hover:text-text">
        ← Benchmarks
      </Link>
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
            <div className="mt-3.5 flex h-[90px] items-end gap-[3px]" data-testid="histogram">
              {bins.map((b) => (
                <div
                  key={b.x0}
                  title={`${b.x0.toFixed(0)}–${b.x1.toFixed(0)}: ${b.count}`}
                  className="flex-1 rounded-t-[3px] bg-accdim"
                  style={{
                    height: Math.max(3, Math.round((b.count / maxBin) * 84)),
                    background: b.count > 0 ? 'var(--acc)' : 'var(--bar)',
                    opacity: b.count > 0 ? 0.35 + 0.65 * (b.count / maxBin) : 1,
                  }}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between font-mono text-[9px] text-dim">
              <span>{benchmark.normMin}</span>
              <span>{benchmark.normMax}</span>
            </div>
          </div>

          <div className="rounded-[10px] border border-border bg-card px-4 py-3.5">
            <div className="text-[13px] font-semibold">Score vs. parameters</div>
            <div className="mt-px text-[11px] text-mut">Open-weights models, log-x params</div>
            <svg
              viewBox="0 0 280 170"
              className="mt-2 block h-auto w-full"
              role="img"
              aria-label="Score against parameter count for open models"
              data-testid="params-scatter"
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
              {openWithParams.map((m) => {
                const v = m.bench[benchmark.slug] as number
                const x = 12 + logPos(m.params as number, 1, 1100) * 256
                const y =
                  8 + (1 - (v - benchmark.normMin) / (benchmark.normMax - benchmark.normMin)) * 140
                return (
                  <circle
                    key={m.slug}
                    cx={x.toFixed(1)}
                    cy={Math.max(8, Math.min(148, y)).toFixed(1)}
                    r="4"
                    fill="var(--open)"
                    fillOpacity="0.75"
                    stroke="var(--bg)"
                    strokeWidth="1"
                  >
                    <title>{`${m.name} — ${fmtv(v)} · ${fmtParams(m.params, m.active)}`}</title>
                  </circle>
                )
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}
