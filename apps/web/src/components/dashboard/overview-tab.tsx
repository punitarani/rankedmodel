import { type CatalogSnapshot, fmtDate } from '@rankedmodel/shared'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { fitYWindow, normPct, ratingWindow } from '#/components/charts/scales'
import { QualityPriceScatter } from '#/components/charts/scatter'
import { ModelTag } from '#/components/model-tag'
import { SearchSelect } from '#/components/search-select'
import {
  dashboardMovers,
  latestReleases,
  leaderboardTop,
  rankedByRank,
  scatterLabeled,
  scatterModels,
} from './dashboard-data'

export function OverviewTab({ catalog }: { catalog: CatalogSnapshot }) {
  const navigate = useNavigate()
  const ranked = useMemo(() => rankedByRank(catalog), [catalog])
  // Rail bars map the full ranked field's Elo range onto 0–100% (D21) so the frontier
  // renders near-full bars, mirroring the old absolute-index look.
  const eloWindow = useMemo(() => ratingWindow(ranked.map((m) => m.index)), [ranked])
  const defaultOpen = ranked.find((m) => m.open)
  const [qcA, setQcA] = useState(ranked[0]?.slug ?? '')
  const [qcB, setQcB] = useState(defaultOpen?.slug ?? ranked[1]?.slug ?? '')

  // Quality-vs-price scatter: all priced+ranked points, plus a legend that filters the two
  // weight camps. Filtering re-derives the fitted y-window, so hiding a camp auto-zooms the plot.
  const allPoints = useMemo(() => {
    const labeledSlugs = scatterLabeled(catalog)
    return scatterModels(catalog).map((m) => ({
      slug: m.slug,
      name: m.name,
      outputPrice: (m.price as { output: number }).output,
      index: m.index,
      open: m.open,
      labeled: labeledSlugs.has(m.slug),
    }))
  }, [catalog])
  const [showCamp, setShowCamp] = useState({ open: true, closed: true })
  const toggleCamp = (key: 'open' | 'closed') =>
    setShowCamp((s) => {
      const next = { ...s, [key]: !s[key] }
      // Never leave the plot empty — hiding the last visible camp resets to showing both.
      return next.open || next.closed ? next : { open: true, closed: true }
    })
  const scatterPoints = useMemo(
    () => allPoints.filter((p) => (p.open ? showCamp.open : showCamp.closed)),
    [allPoints, showCamp],
  )
  const yWindow = useMemo(() => fitYWindow(scatterPoints.map((p) => p.index)), [scatterPoints])

  const qcOptions = [...catalog.models]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((o) => ({ value: o.slug, label: `${o.name} — ${o.org}` }))

  return (
    <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[minmax(0,1.9fr)_minmax(280px,1fr)]">
      <div className="flex min-w-0 flex-col gap-3.5">
        {/* scatter */}
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <div className="text-[13px] font-semibold">Quality vs. price</div>
            <div className="text-[11px] text-mut">Frontier Elo against output price, log scale</div>
            <div className="ml-auto flex gap-1.5 text-[11px]">
              <LegendToggle
                label="Open weights"
                color="var(--open)"
                active={showCamp.open}
                onClick={() => toggleCamp('open')}
                testid="legend-open"
              />
              <LegendToggle
                label="Closed"
                color="var(--closed)"
                active={showCamp.closed}
                onClick={() => toggleCamp('closed')}
                testid="legend-closed"
              />
            </div>
          </div>
          <QualityPriceScatter
            points={scatterPoints}
            yWindow={yWindow}
            onSelect={(slug) => navigate({ to: '/models/$slug', params: { slug } })}
          />
        </div>

        {/* latest releases */}
        <div className="overflow-hidden rounded-[10px] border border-border bg-card">
          <div className="flex items-baseline px-4 pt-[13px] pb-2.5">
            <div className="text-[13px] font-semibold">Latest releases</div>
            <Link to="/models" className="ml-auto text-[11.5px]">
              Model explorer →
            </Link>
          </div>
          {latestReleases(catalog).map((m) => (
            <Link
              key={m.slug}
              to="/models/$slug"
              params={{ slug: m.slug }}
              className="grid cursor-pointer grid-cols-[92px_minmax(0,1.5fr)_1fr_90px_70px] items-center gap-2.5 border-t border-border px-4 py-2 text-[12.5px] text-text no-underline hover:bg-hover hover:no-underline"
              data-testid="latest-row"
            >
              <span className="font-mono text-[11px] text-dim">{fmtDate(m.date)}</span>
              <span className="overflow-hidden text-ellipsis whitespace-nowrap font-semibold">
                {m.name}
              </span>
              <span className="text-xs text-mut">{m.org}</span>
              <ModelTag open={m.open} />
              <span className="text-right font-mono text-[11.5px]">{m.index.toFixed(1)}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* right rail */}
      <div className="flex min-w-0 flex-col gap-3.5">
        <div className="rounded-[10px] border border-border bg-card px-4 py-3.5">
          <div className="flex items-baseline">
            <div className="text-[13px] font-semibold">Top ranked</div>
            <Link to="/rankings" className="ml-auto text-[11.5px]">
              All rankings →
            </Link>
          </div>
          <div className="mt-[11px] flex flex-col gap-[7px]" data-testid="arena-rail">
            {leaderboardTop(catalog).map((m, i) => (
              <Link
                key={m.slug}
                to="/models/$slug"
                params={{ slug: m.slug }}
                className="cursor-pointer text-text no-underline hover:no-underline"
              >
                <div className="flex items-baseline gap-[7px] text-xs">
                  <span className="w-3.5 font-mono text-[10px] text-dim">{i + 1}</span>
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap font-semibold">
                    {m.name}
                  </span>
                  <span className="ml-auto font-mono text-[11px] text-mut">
                    {m.index.toFixed(1)}
                  </span>
                </div>
                <div className="mt-1 ml-[21px] h-1 overflow-hidden rounded-sm bg-bar">
                  <div
                    className="h-full rounded-sm"
                    style={{
                      width: `${normPct(m.index, eloWindow.min, eloWindow.max)}%`,
                      background: m.open ? 'var(--open)' : 'var(--closed)',
                    }}
                  />
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-[10px] border border-border bg-card px-4 py-3.5">
          <div className="text-[13px] font-semibold">Biggest movers</div>
          <div className="mt-px text-[11px] text-mut">Elo gain over previous family release</div>
          <div className="mt-[11px] flex flex-col gap-[9px]" data-testid="movers">
            {dashboardMovers(catalog).map((mv) => (
              <Link
                key={mv.slug}
                to="/models/$slug"
                params={{ slug: mv.slug }}
                className="flex cursor-pointer items-baseline gap-2 text-xs text-text no-underline hover:no-underline"
              >
                <span className="font-semibold">{mv.name}</span>
                <span className="text-[11px] text-dim">vs {mv.prevName}</span>
                <span className="ml-auto font-mono text-[11px] text-open">+{mv.delta}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-[10px] border border-border bg-card px-4 py-3.5">
          <div className="text-[13px] font-semibold">Quick compare</div>
          <div className="mt-2.5 flex flex-col gap-2">
            <SearchSelect
              value={qcA}
              onValueChange={setQcA}
              options={qcOptions}
              aria-label="Quick compare model A"
              searchPlaceholder="Search models…"
              testid="qc-a"
              className="w-full"
            />
            <SearchSelect
              value={qcB}
              onValueChange={setQcB}
              options={qcOptions}
              aria-label="Quick compare model B"
              searchPlaceholder="Search models…"
              testid="qc-b"
              className="w-full"
            />
            <button
              type="button"
              onClick={() => navigate({ to: '/compare', search: { m: `${qcA},${qcB}` } })}
              className="cursor-pointer rounded-md border-none bg-acc py-[7px] text-xs font-semibold text-bg"
              data-testid="qc-go"
            >
              Compare →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** A legend swatch that doubles as a filter: click toggles its weight camp on the scatter, and
 *  an inactive camp reads as a hollow dot + dimmed label (aria-pressed carries the state). */
function LegendToggle({
  label,
  color,
  active,
  onClick,
  testid,
}: {
  label: string
  color: string
  active: boolean
  onClick: () => void
  testid: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testid}
      className={`flex cursor-pointer items-center gap-[5px] rounded px-1.5 py-0.5 transition-colors hover:bg-hover ${
        active ? 'text-mut' : 'text-dim'
      }`}
    >
      <span
        className="size-2 rounded-full"
        style={active ? { background: color } : { boxShadow: `inset 0 0 0 1.5px ${color}` }}
      />
      {label}
    </button>
  )
}
