import { type CatalogSnapshot, fmtDate } from '@rankedmodel/shared'
import { Link } from '@tanstack/react-router'
import { CadenceBars } from '#/components/charts/cadence-bars'
import { normPct, ratingWindow } from '#/components/charts/scales'
import { dashboardStats, rankedByRank } from './dashboard-data'

/** Design's Releases variant: month-grouped feed + cadence + open-vs-closed frontier. */
export function ReleasesTab({ catalog }: { catalog: CatalogSnapshot }) {
  const stats = dashboardStats(catalog)
  // Frontier bars map the ranked field's Elo range onto 0–100% (D21).
  const eloWindow = ratingWindow(rankedByRank(catalog).map((m) => m.index))

  // month-grouped feed: 22 most recent (design)
  const feed: { month: string; items: typeof catalog.models }[] = []
  for (const m of [...catalog.models].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 22)) {
    const month = fmtDate(m.date)
    let group = feed.find((g) => g.month === month)
    if (!group) {
      group = { month, items: [] }
      feed.push(group)
    }
    group.items.push(m)
  }

  // quarters: 'YYYY Qn' → design label 'YY Qn. Empty quarters are zero-filled so the axis
  // stays contiguous (real history opens with a 2020 Q3/Q4 gap that would otherwise compress).
  const counts = new Map<string, number>()
  let minQ = Number.POSITIVE_INFINITY
  let maxQ = Number.NEGATIVE_INFINITY
  for (const m of catalog.models) {
    const [y, mo] = m.date.split('-') as [string, string]
    const qi = Number(y) * 4 + Math.floor((Number(mo) - 1) / 3)
    counts.set(`${y} Q${(qi % 4) + 1}`, (counts.get(`${y} Q${(qi % 4) + 1}`) ?? 0) + 1)
    minQ = Math.min(minQ, qi)
    maxQ = Math.max(maxQ, qi)
  }
  const quarters =
    maxQ >= minQ
      ? Array.from({ length: maxQ - minQ + 1 }, (_, i) => {
          const qi = minQ + i
          const key = `${Math.floor(qi / 4)} Q${(qi % 4) + 1}`
          return { label: key.replace('20', "'"), count: counts.get(key) ?? 0, latest: qi === maxQ }
        })
      : []

  // Open-vs-closed frontier is the top RANKED model on each side, compared on the universal
  // index (arena covers only a sliver of the field — D20). Empty only if nothing is ranked.
  const frontier = [
    { label: 'Closed frontier', m: stats.closedBest, color: 'var(--closed)' },
    { label: 'Open frontier', m: stats.openBest, color: 'var(--open)' },
  ].filter((f) => f.m != null)

  const gapNote =
    stats.gapIndex != null
      ? stats.gapIndex <= 0
        ? `The open frontier (${stats.openBest?.name}) now leads the closed frontier on the overall rating.`
        : `The open frontier trails by ${stats.gapIndex} Elo points — the gap between the best open and best closed model.`
      : ''

  return (
    <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
      {/* feed */}
      <div
        className="rounded-[10px] border border-border bg-card py-1.5"
        data-testid="release-feed"
      >
        {feed.map((g) => (
          <div key={g.month}>
            <div className="px-[18px] pt-3.5 pb-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-dim">
              {g.month}
            </div>
            {g.items.map((m) => (
              <Link
                key={m.slug}
                to="/models/$slug"
                params={{ slug: m.slug }}
                className="flex cursor-pointer items-center gap-3 border-l-2 border-transparent px-[18px] py-[9px] text-text no-underline hover:bg-hover hover:no-underline"
              >
                <span
                  className="size-[7px] flex-none rounded-full"
                  style={{ background: m.open ? 'var(--open)' : 'var(--closed)' }}
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">
                    {m.name} <span className="text-xs font-normal text-mut">· {m.org}</span>
                  </span>
                  <span className="mt-px block overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] text-mut">
                    {m.note}
                  </span>
                </span>
                <span className="ml-auto flex-none text-right">
                  <span className="block font-mono text-[11.5px]">{m.index.toFixed(1)}</span>
                  <span className="block font-mono text-[9.5px] text-dim">ELO</span>
                </span>
              </Link>
            ))}
          </div>
        ))}
      </div>

      {/* right rail */}
      <div className="flex flex-col gap-3.5">
        <div className="rounded-[10px] border border-border bg-card px-4 py-3.5">
          <div className="text-[13px] font-semibold">Release cadence</div>
          <div className="mt-px text-[11px] text-mut">Tracked releases per quarter</div>
          <CadenceBars quarters={quarters} />
        </div>
        <div className="rounded-[10px] border border-border bg-card px-4 py-3.5">
          <div className="text-[13px] font-semibold">Open vs closed frontier</div>
          <div className="mt-px text-[11px] text-mut">Best overall Elo by camp</div>
          <div className="mt-3 flex flex-col gap-2.5" data-testid="frontier">
            {frontier.map((f) => (
              <div key={f.label}>
                <div className="flex items-baseline text-xs">
                  <span className="font-semibold">{f.label}</span>
                  <span className="ml-auto font-mono text-[11px] text-mut">
                    {f.m?.name} · {f.m?.index.toFixed(1)}
                  </span>
                </div>
                <div className="mt-[5px] h-[5px] overflow-hidden rounded-[3px] bg-bar">
                  <div
                    className="h-full"
                    style={{
                      width: `${normPct(f.m?.index, eloWindow.min, eloWindow.max)}%`,
                      background: f.color,
                    }}
                  />
                </div>
              </div>
            ))}
            <div className="text-[11.5px] leading-normal text-mut" data-testid="gap-note">
              {gapNote}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
