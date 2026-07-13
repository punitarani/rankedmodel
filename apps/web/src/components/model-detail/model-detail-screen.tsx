import {
  CAPABILITY_LABELS,
  CATEGORY_LABELS,
  type CapabilityKey,
  type CatalogSnapshot,
  fmtCtx,
  fmtDate,
  fmtPrice,
  fmtScore,
  type SnapshotModel,
} from '@rankedmodel/shared'
import { Link, useNavigate } from '@tanstack/react-router'
import { Check, X } from 'lucide-react'
import { BackLink } from '#/components/back-link'
import { normPct } from '#/components/charts/scales'
import { Sparkline } from '#/components/charts/sparkline'
import { ModelTag } from '#/components/model-tag'

const CAP_ORDER: CapabilityKey[] = [
  'reasoning',
  'coding',
  'vision',
  'functionCalling',
  'toolUse',
  'agentic',
]

const Card = ({
  children,
  className = '',
  ...rest
}: { children: React.ReactNode; className?: string } & Record<`data-${string}`, string>) => (
  <div className={`rounded-[10px] border border-border bg-card ${className}`} {...rest}>
    {children}
  </div>
)

const MicroLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-dim">{children}</div>
)

export function ModelDetailScreen({
  model,
  catalog,
}: {
  model: SnapshotModel
  catalog: CatalogSnapshot
}) {
  const navigate = useNavigate()
  const siblings = catalog.models
    .filter((x) => x.familySlug === model.familySlug)
    .sort((a, b) => a.date.localeCompare(b.date))
  const fits =
    model.vramQ4 == null
      ? []
      : catalog.gpus.filter((g) => g.vramGb >= (model.vramQ4 as number) * 1.08)
  // Compare-against default: the top RANK-ELIGIBLE model, preferring one on the OTHER side of
  // the open/closed line for a meaningful contrast — falls back to the runner-up if this model
  // itself is the #1 (catalog-derived, never a fixed slug, never an unrated model — D20).
  const byRank = catalog.models
    .filter((x) => x.slug !== model.slug && x.ranked && x.rank != null)
    .sort((a, b) => (a.rank as number) - (b.rank as number))
  const compareB = (byRank.find((x) => x.open !== model.open) ?? byRank[0])?.slug ?? model.slug

  const meta = [
    { label: 'Parameters', value: model.params == null ? 'Undisclosed' : `${model.params}B` },
    {
      label: 'Active params',
      value: model.active
        ? `${model.active}B (MoE)`
        : model.params
          ? `${model.params}B (dense)`
          : '—',
    },
    { label: 'Context', value: `${fmtCtx(model.ctxK)} tokens` },
    { label: 'Architecture', value: model.arch },
    { label: 'License', value: model.license },
    { label: 'Languages', value: model.langCount ? `${model.langCount}+` : '—' },
    {
      label: 'API price (in/out)',
      value: model.price ? `$${model.price.input} / $${model.price.output}` : 'No hosted API',
    },
    { label: 'Modalities', value: model.modalities.join(' · ') },
  ]

  const benchRows = catalog.benchmarks
    .filter((b) => model.bench[b.slug] != null)
    .map((b) => {
      const field = catalog.models
        .filter((x) => x.bench[b.slug] != null)
        .sort((x, y) => (y.bench[b.slug] as number) - (x.bench[b.slug] as number))
      const best = field[0] as SnapshotModel
      const rank = field.findIndex((x) => x.slug === model.slug) + 1
      const fmtv = (v: number) => fmtScore(v, b.unit)
      return {
        slug: b.slug,
        name: b.name,
        cat: CATEGORY_LABELS[b.category],
        value: fmtv(model.bench[b.slug] as number),
        rank,
        pct: normPct(model.bench[b.slug], b.normMin, b.normMax),
        bestPct: normPct(best.bench[b.slug], b.normMin, b.normMax),
        bestName: best.slug === model.slug ? 'this model' : best.name,
        bestValue: fmtv(best.bench[b.slug] as number),
        color: rank === 1 ? 'var(--acc)' : model.open ? 'var(--open)' : 'var(--closed)',
      }
    })

  const links: { kind: string; label: string; href: string }[] = []
  if (model.links.hf)
    links.push({
      kind: 'HF',
      label: model.links.hf,
      href: `https://huggingface.co/${model.links.hf}`,
    })
  if (model.links.gh)
    links.push({ kind: 'GH', label: model.links.gh, href: `https://github.com/${model.links.gh}` })
  if (model.links.docs)
    links.push({ kind: 'DOCS', label: model.links.docs, href: `https://${model.links.docs}` })
  if (model.apiAvailable)
    links.push({
      kind: 'API',
      label: `Available via ${model.org} API`,
      href: `https://${model.links.docs ?? ''}`,
    })

  return (
    <div className="max-w-[1060px] animate-fadeup px-6 py-5 pb-12">
      <BackLink to="/models" fallbackLabel="Model explorer" />

      {/* header */}
      <div className="mt-2.5 flex flex-wrap items-start gap-3.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="m-0 text-2xl font-semibold tracking-[-0.02em]">{model.name}</h1>
            <ModelTag open={model.open} size="md" />
          </div>
          <div className="mt-1 text-[13px] text-mut">
            <Link
              to="/organizations/$slug"
              params={{ slug: model.orgSlug }}
              className="text-mut hover:text-text"
            >
              {model.org}
            </Link>
            {' · '}
            <Link
              to="/families/$slug"
              params={{ slug: model.familySlug }}
              className="text-mut hover:text-text"
            >
              {model.family} family
            </Link>
            {' · released '}
            {fmtDate(model.date, true)}
          </div>
          <p className="mt-2 max-w-[620px] text-[12.5px] leading-[1.55] text-text">{model.note}</p>
          <div className="mt-2.5 flex flex-wrap gap-[5px]">
            {CAP_ORDER.map((k) => {
              const has = model.caps[k]
              const CapabilityIcon = has ? Check : X
              return (
                <span
                  key={k}
                  data-testid={`capability-${k}`}
                  className="inline-flex items-center gap-1 rounded-[20px] border px-[9px] py-0.5 text-[10.5px]"
                  style={{
                    color: has ? 'var(--open)' : 'var(--dim)',
                    borderColor: has ? 'var(--open)' : 'var(--border)',
                    background: has ? 'var(--opendim)' : 'transparent',
                  }}
                >
                  <CapabilityIcon aria-hidden="true" className="size-3" strokeWidth={1.75} />
                  {CAPABILITY_LABELS[k]}
                </span>
              )
            })}
          </div>
        </div>
        <div className="ml-auto flex flex-none flex-col items-end gap-2">
          <div className="text-right">
            <div
              className="font-mono text-[26px] font-semibold tracking-[-0.02em]"
              data-testid="model-index"
            >
              {Object.keys(model.bench).length > 0 ? model.index.toFixed(1) : '—'}
            </div>
            <MicroLabel>
              {model.ranked && model.rank != null
                ? `Index · rank #${model.rank}`
                : 'Index · unrated'}
            </MicroLabel>
          </div>
          <button
            type="button"
            onClick={() => navigate({ to: '/compare', search: { m: `${model.slug},${compareB}` } })}
            className="cursor-pointer rounded-md border-none bg-acc px-3.5 py-[7px] text-xs font-semibold text-bg"
            data-testid="compare-this"
          >
            Compare this model
          </button>
        </div>
      </div>

      {/* meta grid */}
      <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-px overflow-hidden rounded-[10px] border border-border bg-border">
        {meta.map((f) => (
          <div key={f.label} className="bg-card px-[13px] py-[11px]">
            <MicroLabel>{f.label}</MicroLabel>
            <div className="mt-[3px] text-[13px] font-medium">{f.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-3.5 grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        {/* benchmarks */}
        <Card className="p-4">
          <div className="text-[13px] font-semibold">Benchmark results</div>
          <div className="mt-px text-[11px] text-mut">
            Bar shows position within the tracked field; marker = field best
          </div>
          <div className="mt-3.5 flex flex-col gap-3">
            {benchRows.map((b) => (
              <div key={b.slug} data-testid={`bench-${b.slug}`}>
                <div className="flex items-baseline gap-2 text-xs">
                  <Link
                    to="/benchmarks/$slug"
                    params={{ slug: b.slug }}
                    className="font-semibold text-text hover:text-acc"
                  >
                    {b.name}
                  </Link>
                  <span className="font-mono text-[9.5px] uppercase text-dim">{b.cat}</span>
                  <span className="ml-auto font-mono text-[11.5px] font-semibold">{b.value}</span>
                  <span className="font-mono text-[10px] text-dim">#{b.rank}</span>
                </div>
                <div className="relative mt-[5px] h-[5px] rounded-[3px] bg-bar">
                  <div
                    className="h-full rounded-[3px]"
                    style={{ background: b.color, width: `${b.pct}%` }}
                  />
                  <div
                    title={`Field best: ${b.bestName} (${b.bestValue})`}
                    className="absolute top-[-2.5px] h-2.5 w-0.5 rounded-[1px] bg-dim"
                    style={{ left: `${b.bestPct}%` }}
                  />
                </div>
                <div className="mt-[3px] text-[10.5px] text-dim">
                  best: {b.bestName} · {b.bestValue}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="flex min-w-0 flex-col gap-3.5">
          {/* run locally / api only */}
          <Card className="px-4 py-3.5" data-testid="hardware-card">
            <div className="text-[13px] font-semibold">Run it locally</div>
            {model.open ? (
              <>
                <div className="mt-[11px] grid grid-cols-2 gap-2">
                  <div>
                    <MicroLabel>VRAM @ Q4</MicroLabel>
                    <div className="mt-0.5 text-sm font-semibold" data-testid="vram-q4">
                      {model.vramQ4 != null ? `${model.vramQ4} GB` : '—'}
                    </div>
                  </div>
                  <div>
                    <MicroLabel>VRAM @ FP16</MicroLabel>
                    <div className="mt-0.5 text-sm font-semibold">
                      {model.vramFp16 != null ? `${model.vramFp16} GB` : '—'}
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <MicroLabel>Fits on (Q4)</MicroLabel>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1" data-testid="fits-chips">
                  {fits.length > 0 ? (
                    fits.map((g) => (
                      <span
                        key={g.slug}
                        className="rounded border border-border px-[7px] py-0.5 text-[10.5px] text-open"
                      >
                        {g.name}
                      </span>
                    ))
                  ) : (
                    <span className="rounded border border-border px-[7px] py-0.5 text-[10.5px] text-mut">
                      Multi-node cluster required
                    </span>
                  )}
                </div>
                <div className="mt-2.5 text-[11px] leading-normal text-mut" data-testid="tps-line">
                  {model.tps4090
                    ? `~${model.tps4090} tok/s on RTX 4090 (Q4, llama.cpp)`
                    : (model.tpsNote ?? 'Throughput data unavailable.')}
                </div>
                <div className="mt-2.5">
                  <MicroLabel>Quantizations</MicroLabel>
                </div>
                <div className="mt-1 font-mono text-[11.5px]">
                  {model.quants.length > 0 ? model.quants.join(' · ') : '—'}
                </div>
              </>
            ) : (
              <>
                <div className="mt-2 text-xs leading-[1.55] text-mut">
                  Closed weights — available via API only. No local deployment.
                </div>
                <div className="mt-[11px] grid grid-cols-2 gap-2">
                  <div>
                    <MicroLabel>Input / M tok</MicroLabel>
                    <div className="mt-0.5 text-sm font-semibold" data-testid="price-in">
                      {model.price ? `$${model.price.input}` : '—'}
                    </div>
                  </div>
                  <div>
                    <MicroLabel>Output / M tok</MicroLabel>
                    <div className="mt-0.5 text-sm font-semibold" data-testid="price-out">
                      {model.price ? `$${model.price.output}` : '—'}
                    </div>
                  </div>
                </div>
              </>
            )}
          </Card>

          {/* family */}
          <Card className="px-4 py-3.5">
            <div className="text-[13px] font-semibold">{model.family} family</div>
            <div className="mt-px text-[11px] text-mut">Index progression across releases</div>
            <Sparkline
              dots={siblings.map((s) => ({
                value: s.index,
                label: `${s.name} · ${s.index.toFixed(1)}`,
                active: s.slug === model.slug,
              }))}
            />
            <div className="mt-2 flex flex-col gap-0.5" data-testid="family-list">
              {siblings.map((s) => (
                <Link
                  key={s.slug}
                  to="/models/$slug"
                  params={{ slug: s.slug }}
                  className={`flex items-baseline gap-2 rounded-md px-2 py-[5px] text-xs text-text no-underline hover:bg-hover hover:no-underline ${
                    s.slug === model.slug ? 'bg-panel2 font-semibold' : ''
                  }`}
                >
                  <span>{s.name}</span>
                  <span className="font-mono text-[10px] text-dim">{fmtDate(s.date)}</span>
                  <span className="ml-auto font-mono text-[11px] text-mut">
                    {s.index.toFixed(1)}
                  </span>
                </Link>
              ))}
            </div>
          </Card>

          {/* resources */}
          <Card className="px-4 py-3.5">
            <div className="mb-[9px] text-[13px] font-semibold">Resources</div>
            <div className="flex flex-col gap-1.5 text-[12.5px]">
              {links.map((l) => (
                <a
                  key={l.kind + l.label}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-baseline gap-2"
                >
                  <span className="w-11 flex-none font-mono text-[10px] text-dim">{l.kind}</span>
                  {l.label}
                </a>
              ))}
              {links.length === 0 && <span className="text-mut">—</span>}
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-3 text-[11px] text-dim">
        API price {fmtPrice(model.price, model.open)} · each benchmark row carries its own source
        badge (see <Link to="/methodology">methodology</Link>)
      </div>
    </div>
  )
}
