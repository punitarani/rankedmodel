import {
  DATASET_PRESETS,
  type FinetuneAxis,
  type FinetuneQuery,
  isTrainableCheckpoint,
  selectFinetune,
  selectOrgs,
} from '@modelbeats/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { FilterSelect } from '#/components/filter-select'
import { FinetuneRail } from '#/components/finetune/finetune-rail'
import { FinetuneRow } from '#/components/finetune/finetune-row'
import { catalogQueryOptions } from '#/lib/catalog'
import { type FinetuneSearch, TASK_CODES, type TaskCode } from '#/lib/search'

/** URL params → the shared selector's query shape (C8). Pure — resolves sentinels only. */
function buildFinetuneQuery(search: FinetuneSearch): FinetuneQuery {
  return {
    q: search.q,
    axes: search.task
      .split(',')
      .filter((c): c is TaskCode => c in TASK_CODES)
      .map((c) => TASK_CODES[c] as FinetuneAxis),
    trainGpu: search.tgpu,
    trainCount: search.tn,
    // 'same' resolves here (not in the URL) so the link stays stable when tgpu changes.
    inferGpu: search.igpu === 'none' ? null : search.igpu === 'same' ? search.tgpu : search.igpu,
    method: search.method,
    recipe: search.recipe,
    dataset: search.data,
    budgetUsd: search.budget === 'any' ? null : search.budget,
    license: search.lic === 'research' ? 'research-only' : search.lic,
    size: search.size,
    minCtxK: search.ctx === 'any' ? null : search.ctx,
    arch: search.arch,
    org: search.org,
    modalities: search.mod
      .split(',')
      .filter((m): m is 'vision' | 'audio' | 'video' => ['vision', 'audio', 'video'].includes(m)),
    sort: search.sort,
  }
}

/** One-param relaxations offered when the current constraints match nothing. */
function relaxCandidates(
  search: FinetuneSearch,
): { label: string; patch: Partial<FinetuneSearch> }[] {
  const out: { label: string; patch: Partial<FinetuneSearch> }[] = []
  if (search.budget !== 'any')
    out.push({ label: 'Remove the budget cap', patch: { budget: 'any' } })
  if (search.method !== 'any')
    out.push({ label: 'Allow any training method', patch: { method: 'any' } })
  if (search.lic !== 'any') out.push({ label: 'Allow any license', patch: { lic: 'any' } })
  if (search.mod !== '') out.push({ label: 'Drop the modality requirement', patch: { mod: '' } })
  if (search.size !== 'any') out.push({ label: 'Allow any parameter size', patch: { size: 'any' } })
  if (search.ctx !== 'any')
    out.push({ label: 'Drop the context-window floor', patch: { ctx: 'any' } })
  if (search.arch !== 'any') out.push({ label: 'Allow any architecture', patch: { arch: 'any' } })
  if (search.org !== 'all') out.push({ label: 'Include every organization', patch: { org: 'all' } })
  if (search.recipe !== 'sft')
    out.push({ label: 'Use plain SFT instead', patch: { recipe: 'sft' } })
  if (search.igpu !== 'none')
    out.push({ label: 'Skip the inference check', patch: { igpu: 'none' } })
  const bumped = ({ 1: 2, 2: 4, 4: 8 } as const)[search.tn as 1 | 2 | 4]
  if (bumped) out.push({ label: `Train on ${bumped} GPUs instead`, patch: { tn: bumped } })
  return out
}

export function FinetuneScreen({
  search,
  navigateSearch,
}: {
  search: FinetuneSearch
  navigateSearch: (patch: Partial<FinetuneSearch>) => void
}) {
  const { data } = useSuspenseQuery(catalogQueryOptions)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Re-run the ranking only when an input actually changes. Router search objects are
  // structurally shared, so `search` identity is stable until a param really changes.
  const rows = useMemo(
    () => selectFinetune(data.models, buildFinetuneQuery(search), data.gpus, data.benchmarks),
    [data.models, data.gpus, data.benchmarks, search],
  )

  // Honest denominator: distinct open weight artifacts (effort/mode variants collapsed).
  const openCount = useMemo(
    () => data.models.filter((m) => isTrainableCheckpoint(m)).length,
    [data.models],
  )
  const orgs = useMemo(
    () => selectOrgs(data.models.filter((m) => isTrainableCheckpoint(m))),
    [data.models],
  )

  // Only computed when the list is empty: one extra selector pass per active constraint.
  const relaxHints = useMemo(() => {
    if (rows.length > 0) return []
    return relaxCandidates(search)
      .map((c) => ({
        ...c,
        count: selectFinetune(
          data.models,
          buildFinetuneQuery({ ...search, ...c.patch }),
          data.gpus,
          data.benchmarks,
        ).length,
      }))
      .filter((c) => c.count > 0)
  }, [rows.length, search, data.models, data.gpus, data.benchmarks])

  const trainGpu = data.gpus.find((g) => g.slug === search.tgpu)
  const trainCount = search.tn
  const capacityGb = (trainGpu?.vramGb ?? 0) * trainCount
  const inferSlug =
    search.igpu === 'none' ? null : search.igpu === 'same' ? search.tgpu : search.igpu
  const inferGpuName = inferSlug
    ? (data.gpus.find((g) => g.slug === inferSlug)?.name ?? null)
    : null
  const selectedAxes = search.task
    .split(',')
    .filter((c): c is TaskCode => c in TASK_CODES)
    .map((c) => TASK_CODES[c] as FinetuneAxis)
  const datasetLabel =
    DATASET_PRESETS.find((p) => p.id === search.data)?.label ?? DATASET_PRESETS[1].label

  return (
    <div className="flex animate-fadeup flex-col md:flex-row md:items-start">
      <FinetuneRail search={search} navigateSearch={navigateSearch} gpus={data.gpus} orgs={orgs} />

      <div className="min-w-0 flex-1 px-6 pt-[18px] pb-10">
        <div className="mb-1">
          <h1 className="text-lg font-semibold tracking-[-0.02em]">
            Which model should you fine-tune?
          </h1>
          <div className="mt-0.5 text-xs text-mut">
            Open-weight models ranked for your constraints — training VRAM per method, estimated
            cost, and task quality. Formula-derived estimates: see{' '}
            <Link to="/methodology">methodology</Link>.
          </div>
        </div>

        <div className="mt-3.5 mb-[13px] flex items-baseline gap-2.5">
          <div className="text-sm font-semibold" data-testid="finetune-count">
            {rows.length} trainable · of {openCount} open models
          </div>
          <div className="ml-auto flex items-center gap-[7px] text-[11.5px] text-mut">
            Sort
            <FilterSelect
              value={search.sort}
              onValueChange={(sort) => navigateSearch({ sort: sort as FinetuneSearch['sort'] })}
              options={[
                { value: 'best', label: 'Best match' },
                { value: 'cost', label: 'Cheapest training' },
                { value: 'vram', label: 'Least VRAM' },
                { value: 'params', label: 'Largest first' },
                { value: 'date', label: 'Newest first' },
              ]}
              aria-label="Sort models"
              testid="finetune-sort"
            />
          </div>
        </div>

        {rows.length > 0 ? (
          <div className="overflow-x-auto rounded-[10px] border border-border bg-card">
            <div style={{ minWidth: 920 }}>
              <div className="grid grid-cols-[28px_minmax(200px,1.6fr)_70px_80px_minmax(150px,1fr)_80px_minmax(140px,1fr)_24px] items-center gap-2 border-b border-border2 px-3.5 py-[9px] font-mono text-[9.5px] uppercase tracking-[0.05em] text-dim">
                <span>#</span>
                <span>Model</span>
                <span className="text-right">Params</span>
                <span>Method</span>
                <span>Train VRAM</span>
                <span className="text-right">Est. cost</span>
                <span>Quality</span>
                <span />
              </div>
              {rows.map((row, i) => (
                <FinetuneRow
                  key={row.m.slug}
                  row={row}
                  rank={i + 1}
                  capacityGb={capacityGb}
                  trainCount={trainCount}
                  recipe={search.recipe}
                  selectedAxes={selectedAxes}
                  inferGpuName={inferGpuName}
                  datasetLabel={datasetLabel}
                  expanded={expanded === row.m.slug}
                  onToggle={() => setExpanded(expanded === row.m.slug ? null : row.m.slug)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div
            className="rounded-[10px] border border-border bg-card px-5 py-6"
            data-testid="finetune-empty"
          >
            <div className="text-[13px] font-semibold">No model fits these constraints.</div>
            {relaxHints.length > 0 ? (
              <div className="mt-2.5 flex flex-col items-start gap-1.5">
                {relaxHints.map((hint) => (
                  <button
                    key={hint.label}
                    type="button"
                    onClick={() => navigateSearch(hint.patch)}
                    className="cursor-pointer text-[11.5px] text-acc underline"
                    data-testid="finetune-relax"
                  >
                    {hint.label} → {hint.count} models
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-[11.5px] text-mut">
                Try resetting the filters from the rail.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
