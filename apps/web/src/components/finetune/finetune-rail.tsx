import {
  DATASET_PRESETS,
  type OrgOption,
  SIZE_CLASS_LABELS,
  type SnapshotGpu,
} from '@modelbeats/shared'
import { FilterSelect } from '#/components/filter-select'
import { SearchSelect } from '#/components/search-select'
import { Segmented } from '#/components/segmented'
import { storeFinetuneProfile } from '#/lib/finetune-profile'
import {
  FINETUNE_SEARCH_DEFAULTS,
  type FinetuneSearch,
  TASK_CODES,
  type TaskCode,
} from '#/lib/search'

/** Task-axis chips in decision-relevance order (agents/reasoning/coding lead). */
const TASK_CHIPS: { code: TaskCode; label: string }[] = [
  { code: 'agents', label: 'Agents' },
  { code: 'reason', label: 'Reasoning' },
  { code: 'code', label: 'Coding' },
  { code: 'math', label: 'Math' },
  { code: 'if', label: 'Instruction following' },
  { code: 'know', label: 'Knowledge' },
  { code: 'docs', label: 'Documents' },
  { code: 'vision', label: 'Vision' },
  { code: 'chat', label: 'Chat quality' },
]

const MOD_CHIPS = [
  { code: 'vision', label: 'Vision' },
  { code: 'audio', label: 'Audio' },
  { code: 'video', label: 'Video' },
] as const

function FacetLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[7px] font-mono text-[9.5px] uppercase tracking-[0.07em] text-dim">
      {children}
    </div>
  )
}

function ChipButton({
  active,
  label,
  testid,
  onClick,
}: {
  active: boolean
  label: string
  testid: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="cursor-pointer rounded-[20px] border px-2.5 py-[3px] text-[11px]"
      style={{
        borderColor: active ? 'var(--acc)' : 'var(--border)',
        background: active ? 'var(--accdim)' : 'transparent',
        color: active ? 'var(--acc)' : 'var(--mut)',
      }}
      data-testid={testid}
    >
      {label}
    </button>
  )
}

export function FinetuneRail({
  search,
  navigateSearch,
  gpus,
  orgs,
}: {
  search: FinetuneSearch
  navigateSearch: (patch: Partial<FinetuneSearch>) => void
  gpus: SnapshotGpu[]
  orgs: OrgOption[]
}) {
  const activeTasks = search.task.split(',').filter((c): c is TaskCode => c in TASK_CODES)
  const activeMods = search.mod
    .split(',')
    .filter((m): m is 'vision' | 'audio' | 'video' => ['vision', 'audio', 'video'].includes(m))
  const trainGpu = gpus.find((g) => g.slug === search.tgpu)
  const trainCount = search.tn

  const setHardware = (patch: Partial<Pick<FinetuneSearch, 'tgpu' | 'tn' | 'igpu'>>) => {
    navigateSearch(patch)
    storeFinetuneProfile({
      tgpu: patch.tgpu ?? search.tgpu,
      tn: patch.tn ?? search.tn,
      igpu: patch.igpu ?? search.igpu,
    })
  }

  const toggleTask = (code: TaskCode) => {
    const next = activeTasks.includes(code)
      ? activeTasks.filter((c) => c !== code)
      : [...activeTasks, code]
    navigateSearch({ task: next.join(',') })
  }

  const toggleMod = (code: 'vision' | 'audio' | 'video') => {
    const next = activeMods.includes(code)
      ? activeMods.filter((c) => c !== code)
      : [...activeMods, code]
    navigateSearch({ mod: next.join(',') })
  }

  return (
    <div className="flex w-full flex-col gap-4 border-b border-border px-4 pt-[18px] pb-6 md:sticky md:top-[49px] md:h-[calc(100vh-49px)] md:w-[228px] md:flex-none md:overflow-y-auto md:border-r md:border-b-0 md:pb-8">
      <input
        type="text"
        value={search.q}
        onChange={(e) => navigateSearch({ q: e.target.value })}
        placeholder="Filter models…"
        className="rounded-md border border-border bg-panel2 px-[9px] py-1.5 text-xs text-text outline-none focus:border-acc"
        data-testid="finetune-filter"
      />
      <div>
        <FacetLabel>Task priorities</FacetLabel>
        <div className="flex flex-wrap gap-[5px]">
          {TASK_CHIPS.map((chip) => (
            <ChipButton
              key={chip.code}
              active={activeTasks.includes(chip.code)}
              label={chip.label}
              testid={`task-${chip.code}`}
              onClick={() => toggleTask(chip.code)}
            />
          ))}
        </div>
        <div className="mt-[5px] text-[10.5px] leading-[1.45] text-dim">
          Chat quality ≈ human preference; Documents and Instruction following are derived from
          benchmark baskets.
        </div>
      </div>
      <div>
        <FacetLabel>Training hardware</FacetLabel>
        <FilterSelect
          value={search.tgpu}
          onValueChange={(tgpu) => setHardware({ tgpu })}
          options={gpus.map((g) => ({ value: g.slug, label: g.name }))}
          aria-label="Training GPU"
          testid="finetune-tgpu"
          className="w-full"
        />
        <div className="mt-1.5">
          <Segmented
            grow
            value={String(search.tn) as '1' | '2' | '4' | '8'}
            options={[
              { value: '1', label: '1×' },
              { value: '2', label: '2×' },
              { value: '4', label: '4×' },
              { value: '8', label: '8×' },
            ]}
            onChange={(tn) => setHardware({ tn: Number(tn) as FinetuneSearch['tn'] })}
          />
        </div>
        {trainGpu && (
          <div
            className="mt-[5px] font-mono text-[10.5px] text-dim"
            data-testid="finetune-capacity"
          >
            {trainCount} × {trainGpu.vramGb} GB = {trainCount * trainGpu.vramGb} GB usable
          </div>
        )}
      </div>
      <div>
        <FacetLabel>Inference hardware</FacetLabel>
        <FilterSelect
          value={search.igpu}
          onValueChange={(igpu) => setHardware({ igpu })}
          options={[
            { value: 'same', label: 'Same as training' },
            { value: 'none', label: 'None (API / cloud)' },
            ...gpus.map((g) => ({ value: g.slug, label: g.name })),
          ]}
          aria-label="Inference GPU"
          testid="finetune-igpu"
          className="w-full"
        />
        <div className="mt-[5px] text-[10.5px] leading-[1.45] text-dim">
          Drops models whose Q4 quant won’t run on the serving hardware.
        </div>
      </div>
      <div>
        <FacetLabel>Recipe</FacetLabel>
        <Segmented
          grow
          value={search.recipe}
          options={[
            { value: 'sft', label: 'SFT' },
            { value: 'dpo', label: 'DPO' },
            { value: 'rl', label: 'RL' },
          ]}
          onChange={(recipe) => navigateSearch({ recipe })}
        />
        <div className="mt-[5px] text-[10.5px] leading-[1.45] text-dim">
          DPO adds a reference model; RL (GRPO-style) adds rollout memory and compute.
        </div>
      </div>
      <div>
        <FacetLabel>Training method</FacetLabel>
        <Segmented
          grow
          value={search.method}
          options={[
            { value: 'any', label: 'Any' },
            { value: 'qlora', label: 'QLoRA' },
            { value: 'lora', label: 'LoRA' },
            { value: 'full', label: 'Full' },
          ]}
          onChange={(method) => navigateSearch({ method })}
        />
      </div>
      <div>
        <FacetLabel>Dataset size</FacetLabel>
        <FilterSelect
          value={search.data}
          onValueChange={(data) => navigateSearch({ data: data as FinetuneSearch['data'] })}
          options={DATASET_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
          aria-label="Dataset size preset"
          testid="finetune-data"
          className="w-full"
        />
      </div>
      <div>
        <FacetLabel>Training budget</FacetLabel>
        <FilterSelect
          value={String(search.budget)}
          onValueChange={(budget) =>
            navigateSearch({
              budget:
                budget === 'any'
                  ? 'any'
                  : (Number(budget) as Exclude<FinetuneSearch['budget'], 'any'>),
            })
          }
          options={[
            { value: 'any', label: 'Any budget' },
            { value: '50', label: 'Under $50' },
            { value: '200', label: 'Under $200' },
            { value: '1000', label: 'Under $1,000' },
            { value: '5000', label: 'Under $5,000' },
          ]}
          aria-label="Training budget cap"
          testid="finetune-budget"
          className="w-full"
        />
      </div>
      <div>
        <FacetLabel>License</FacetLabel>
        <FilterSelect
          value={search.lic}
          onValueChange={(lic) => navigateSearch({ lic: lic as FinetuneSearch['lic'] })}
          options={[
            { value: 'any', label: 'Any license' },
            { value: 'permissive', label: 'Permissive only' },
            { value: 'conditional', label: 'Up to conditional' },
            { value: 'research', label: 'Include research-only' },
          ]}
          aria-label="License class filter"
          testid="finetune-license"
          className="w-full"
        />
      </div>
      <div>
        <FacetLabel>Total parameters</FacetLabel>
        <FilterSelect
          value={search.size}
          onValueChange={(size) => navigateSearch({ size: size as FinetuneSearch['size'] })}
          options={[
            { value: 'any', label: 'Any size' },
            { value: 's', label: SIZE_CLASS_LABELS.s },
            { value: 'm', label: SIZE_CLASS_LABELS.m },
            { value: 'l', label: SIZE_CLASS_LABELS.l },
            { value: 'xl', label: SIZE_CLASS_LABELS.xl },
          ]}
          aria-label="Filter by parameter size class"
          testid="finetune-size"
          className="w-full"
        />
      </div>
      <div>
        <FacetLabel>Context window</FacetLabel>
        <FilterSelect
          value={String(search.ctx)}
          onValueChange={(ctx) =>
            navigateSearch({
              ctx: ctx === 'any' ? 'any' : (Number(ctx) as Exclude<FinetuneSearch['ctx'], 'any'>),
            })
          }
          options={[
            { value: 'any', label: 'Any length' },
            { value: '32', label: '≥ 32K tokens' },
            { value: '128', label: '≥ 128K tokens' },
            { value: '1000', label: '≥ 1M tokens' },
          ]}
          aria-label="Minimum context window"
          testid="finetune-ctx"
          className="w-full"
        />
      </div>
      <div>
        <FacetLabel>Architecture</FacetLabel>
        <FilterSelect
          value={search.arch}
          onValueChange={(arch) => navigateSearch({ arch: arch as FinetuneSearch['arch'] })}
          options={[
            { value: 'any', label: 'Any architecture' },
            { value: 'dense', label: 'Non-MoE (dense / hybrid)' },
            { value: 'moe', label: 'MoE only' },
          ]}
          aria-label="Architecture filter"
          testid="finetune-arch"
          className="w-full"
        />
      </div>
      <div>
        <FacetLabel>Organization</FacetLabel>
        <SearchSelect
          value={search.org}
          onValueChange={(org) => navigateSearch({ org })}
          options={[
            { value: 'all', label: 'All orgs' },
            ...orgs.map((o) => ({ value: o.slug, label: o.name })),
          ]}
          aria-label="Filter by organization"
          searchPlaceholder="Search organizations…"
          testid="finetune-org"
          className="w-full"
        />
      </div>
      <div>
        <FacetLabel>Required modalities</FacetLabel>
        <div className="flex flex-wrap gap-[5px]">
          {MOD_CHIPS.map((chip) => (
            <ChipButton
              key={chip.code}
              active={activeMods.includes(chip.code)}
              label={chip.label}
              testid={`mod-${chip.code}`}
              onClick={() => toggleMod(chip.code)}
            />
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => navigateSearch({ ...FINETUNE_SEARCH_DEFAULTS })}
        className="cursor-pointer self-start text-[11.5px] text-mut underline"
      >
        Reset filters
      </button>
      <div className="text-[10.5px] leading-[1.45] text-dim">
        Open-weight models only — closed API models can’t have their weights tuned; hosted
        fine-tuning APIs are out of scope.
      </div>
    </div>
  )
}
