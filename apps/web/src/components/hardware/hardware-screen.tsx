import {
  assessFit,
  type CatalogSnapshot,
  FIT_VERDICT_LABELS,
  type FitVerdict,
  fmtParams,
  type SnapshotModel,
} from '@rankedmodel/shared'
import { Link } from '@tanstack/react-router'
import { InlineBar } from '#/components/charts/inline-bar'
import { ModelTag } from '#/components/model-tag'
import { Segmented } from '#/components/segmented'
import { storeProfile } from '#/lib/hardware-profile'
import type { HardwareSearch } from '#/lib/search'

/** Verdict → token color (C2 grades in the design language). */
const VERDICT_COLOR: Record<FitVerdict, string> = {
  'fits-comfortably': 'var(--open)',
  'fits-tight': 'var(--acc)',
  'offload-partial': 'var(--closed)',
  'wont-run': 'var(--dim)',
}
const VERDICT_ORDER: FitVerdict[] = [
  'fits-comfortably',
  'fits-tight',
  'offload-partial',
  'wont-run',
]

function VerdictChip({ verdict }: { verdict: FitVerdict }) {
  return (
    <span
      className="whitespace-nowrap rounded-[4px] border border-border px-[7px] py-0.5 font-mono text-[10px]"
      style={{ color: VERDICT_COLOR[verdict] }}
      data-testid={`verdict-${verdict}`}
    >
      {FIT_VERDICT_LABELS[verdict]}
    </span>
  )
}

export function HardwareScreen({
  catalog,
  search,
  navigateSearch,
}: {
  catalog: CatalogSnapshot
  search: HardwareSearch
  navigateSearch: (patch: Partial<HardwareSearch>) => void
}) {
  const manual = search.gpu === 'manual'
  const profile = manual ? undefined : catalog.gpus.find((g) => g.slug === search.gpu)
  const capacity = manual ? search.vram : (profile?.vramGb ?? 0)
  const localModels = catalog.models.filter((m) => m.open && m.vramQ4 != null)

  const setGpu = (gpu: string) => {
    navigateSearch({ gpu })
    if (gpu !== 'manual') storeProfile({ kind: 'profile', slug: gpu })
  }
  const setVram = (vram: number) => {
    navigateSearch({ vram })
    storeProfile({ kind: 'manual', vramGb: vram })
  }

  // forward mode: models × this budget
  const fitRows = localModels
    .map((m) => ({
      m,
      fit: assessFit(
        { openness: m.openness, vramQ4Gb: m.vramQ4, paramsB: m.params },
        Math.max(1, capacity),
      ),
    }))
    .filter((r): r is { m: SnapshotModel; fit: NonNullable<ReturnType<typeof assessFit>> } =>
      Boolean(r.fit),
    )
    .filter((r) => search.show === 'all' || r.fit.fits)
    .sort(
      (a, b) =>
        VERDICT_ORDER.indexOf(a.fit.verdict) - VERDICT_ORDER.indexOf(b.fit.verdict) ||
        a.fit.requiredGb - b.fit.requiredGb,
    )

  // inverse mode: one model × every GPU
  const inverseModel = catalog.models.find((x) => x.slug === search.model)

  return (
    <div className="max-w-[1060px] animate-fadeup px-6 py-5 pb-12">
      <div className="flex flex-wrap items-center gap-2.5">
        <div>
          <h1 className="text-lg font-semibold tracking-[-0.02em]">What can you run?</h1>
          <div className="mt-0.5 text-xs text-mut">
            Curated Q4 VRAM × 1.08 overhead against your usable memory budget — Mac budgets are
            already unified-memory discounted. See <Link to="/methodology">methodology</Link>.
          </div>
        </div>
        <div className="ml-auto">
          <Segmented
            value={search.mode}
            options={[
              { value: 'gpu', label: 'By hardware' },
              { value: 'model', label: 'By model' },
            ]}
            onChange={(mode) => navigateSearch({ mode })}
          />
        </div>
      </div>

      {search.mode === 'gpu' ? (
        <>
          {/* profile picker */}
          <div className="mt-4 flex flex-wrap items-end gap-2.5 rounded-[10px] border border-border bg-card px-4 py-3.5">
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-dim">
                Hardware profile
              </span>
              <select
                value={search.gpu}
                onChange={(e) => setGpu(e.target.value)}
                className="min-w-[220px] rounded-md border border-border bg-panel2 px-2 py-[5px] text-xs outline-none focus:border-acc"
                data-testid="hw-gpu"
              >
                {catalog.gpus.map((g) => (
                  <option key={g.slug} value={g.slug}>
                    {g.name}
                  </option>
                ))}
                <option value="manual">Manual VRAM…</option>
              </select>
            </div>
            {manual && (
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-dim">
                  Usable VRAM / unified memory (GB)
                </span>
                <input
                  type="number"
                  min={1}
                  max={2048}
                  value={search.vram}
                  onChange={(e) => setVram(Number(e.target.value) || 1)}
                  className="w-[120px] rounded-md border border-border bg-panel2 px-2 py-[5px] text-xs outline-none focus:border-acc"
                  data-testid="hw-vram"
                />
              </div>
            )}
            <div className="ml-auto flex items-end gap-3">
              <div className="text-right">
                <div className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-dim">
                  Budget
                </div>
                <div className="font-mono text-lg font-semibold" data-testid="hw-budget">
                  {capacity} GB
                </div>
              </div>
              <Segmented
                value={search.show}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'fits', label: 'Fits' },
                ]}
                onChange={(show) => navigateSearch({ show })}
              />
              {!manual && (
                <Link
                  to="/models"
                  search={{
                    q: '',
                    open: 'all',
                    org: 'all',
                    size: 'any',
                    gpu: search.gpu,
                    caps: '',
                    sort: 'index',
                  }}
                  className="pb-1 text-[11.5px]"
                >
                  Open in explorer →
                </Link>
              )}
            </div>
          </div>

          {/* fit table */}
          <div className="mt-3.5 overflow-x-auto rounded-[10px] border border-border bg-card">
            <div style={{ minWidth: 860 }}>
              <div className="grid grid-cols-[minmax(200px,1.6fr)_80px_90px_110px_minmax(140px,1fr)_120px_90px] items-center gap-2 border-b border-border2 px-3.5 py-[9px] font-mono text-[9.5px] uppercase tracking-[0.05em] text-dim">
                <span>Model</span>
                <span className="text-right">Params</span>
                <span className="text-right">Q4 VRAM</span>
                <span className="text-right">Required ×1.08</span>
                <span>Headroom</span>
                <span>Verdict</span>
                <span className="text-right">Est. tok/s</span>
              </div>
              {fitRows.map(({ m, fit }) => (
                <div
                  key={m.slug}
                  className="grid grid-cols-[minmax(200px,1.6fr)_80px_90px_110px_minmax(140px,1fr)_120px_90px] items-center gap-2 border-b border-border px-3.5 py-[7px] text-[12.5px]"
                  data-testid="fit-row"
                >
                  <span className="flex min-w-0 items-baseline gap-[7px]">
                    <Link
                      to="/models/$slug"
                      params={{ slug: m.slug }}
                      className="overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-text hover:text-acc"
                    >
                      {m.name}
                    </Link>
                    <ModelTag open={m.open} />
                  </span>
                  <span className="text-right font-mono text-[11px] text-mut">
                    {fmtParams(m.params, m.active)}
                  </span>
                  <span className="text-right font-mono text-[11px] text-mut">{m.vramQ4} GB</span>
                  <span className="text-right font-mono text-[11px]">
                    {fit.requiredGb.toFixed(1)} GB
                  </span>
                  <span title={`ratio ${(fit.ratio * 100).toFixed(0)}%`}>
                    <InlineBar
                      pct={Math.min(100, Math.round(fit.ratio * 100))}
                      color={VERDICT_COLOR[fit.verdict]}
                      height={5}
                    />
                  </span>
                  <span>
                    <VerdictChip verdict={fit.verdict} />
                  </span>
                  <span
                    className="text-right font-mono text-[11px] text-mut"
                    title={m.tpsNote ?? undefined}
                  >
                    {search.gpu === 'rtx4090' && m.tps4090 ? `~${m.tps4090}` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2.5 text-[11px] text-dim">
            tok/s shown only where a measured throughput row exists (RTX 4090 · Q4 · llama.cpp). MoE
            models need total-parameter memory; speed tracks active parameters.
          </div>
        </>
      ) : (
        <>
          {/* inverse: what runs model X */}
          <div className="mt-4 flex flex-col gap-1 rounded-[10px] border border-border bg-card px-4 py-3.5">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-dim">
              Model
            </span>
            <select
              value={search.model}
              onChange={(e) => navigateSearch({ model: e.target.value })}
              className="max-w-[320px] rounded-md border border-border bg-panel2 px-2 py-[5px] text-xs outline-none focus:border-acc"
              data-testid="hw-model"
            >
              {catalog.models
                .filter((m) => m.open && m.vramQ4 != null)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((m) => (
                  <option key={m.slug} value={m.slug}>
                    {m.name} — {m.vramQ4} GB @ Q4
                  </option>
                ))}
            </select>
          </div>
          {inverseModel && (
            <div className="mt-3.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {catalog.gpus.map((g) => {
                const fit = assessFit(
                  {
                    openness: inverseModel.openness,
                    vramQ4Gb: inverseModel.vramQ4,
                    paramsB: inverseModel.params,
                  },
                  g.vramGb,
                )
                if (!fit) return null
                return (
                  <div
                    key={g.slug}
                    className="flex items-center gap-2.5 rounded-[10px] border border-border bg-card px-3.5 py-2.5"
                    data-testid={`inverse-${g.slug}`}
                  >
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-semibold">{g.name}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-dim">
                        {g.vramGb} GB budget
                      </div>
                    </div>
                    <span className="ml-auto">
                      <VerdictChip verdict={fit.verdict} />
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
