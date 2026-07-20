import {
  FINETUNE_AXES,
  FINETUNE_AXIS_LABELS,
  FINETUNE_METHOD_LABELS,
  FIT_VERDICT_LABELS,
  type FinetuneAxis,
  type FinetuneRow as FinetuneRowData,
  type FitVerdict,
  fmtParams,
  LICENSE_CLASS_LABELS,
  type LicenseClass,
  type MethodAssessment,
  RECIPE_COST_MULTIPLIER,
  TRAIN_EPOCHS,
  TRAIN_RECIPE_LABELS,
  TRAIN_VERDICT_LABELS,
  type TrainRecipe,
  type TrainVerdict,
} from '@modelbeats/shared'
import { Link } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import { InlineBar } from '#/components/charts/inline-bar'
import { ModelTag } from '#/components/model-tag'

/** Train verdict → token color (C8 grades in the design language). */
const TRAIN_VERDICT_COLOR: Record<TrainVerdict, string> = {
  fits: 'var(--open)',
  tight: 'var(--acc)',
  'wont-fit': 'var(--dim)',
}

/** Inference verdict → token color (identical to the hardware page's C2 mapping). */
const FIT_VERDICT_COLOR: Record<FitVerdict, string> = {
  'fits-comfortably': 'var(--open)',
  'fits-tight': 'var(--acc)',
  'offload-partial': 'var(--closed)',
  'wont-run': 'var(--dim)',
}

const LICENSE_COLOR: Record<LicenseClass, string> = {
  permissive: 'var(--open)',
  conditional: 'var(--acc)',
  'research-only': 'var(--closed)',
  proprietary: 'var(--dim)',
}

/** Axis labels as the /finetune page names them (honest mappings spelled out). */
const AXIS_DETAIL_LABELS: Record<FinetuneAxis, string> = {
  ...FINETUNE_AXIS_LABELS,
  'human-preference': 'Chat quality (human preference)',
  docs: 'Documents (derived)',
  if: 'Instruction following (IFEval)',
}

const fmtGb = (n: number) => `${n.toFixed(1)}`

const fmtTokens = (n: number) =>
  n >= 1e9
    ? `${(n / 1e9).toFixed(1)}B`
    : n >= 1e6
      ? `${(n / 1e6).toFixed(1)}M`
      : `${Math.round(n / 1e3)}k`

const fmtUsd = (n: number) => (n >= 100 ? `$${Math.round(n)}` : `$${n.toFixed(2)}`)

const fmtHours = (h: number) => (h >= 10 ? h.toFixed(0) : h.toFixed(1))

function TrainVerdictChip({ method, verdict }: { method: string; verdict: TrainVerdict }) {
  return (
    <span
      className="whitespace-nowrap rounded-[4px] border border-border px-[7px] py-0.5 font-mono text-[10px]"
      style={{ color: TRAIN_VERDICT_COLOR[verdict] }}
      data-testid={`train-verdict-${method}`}
    >
      {TRAIN_VERDICT_LABELS[verdict]}
    </span>
  )
}

function LicenseChip({ license }: { license: LicenseClass }) {
  return (
    <span
      className="whitespace-nowrap rounded-[4px] border border-border px-[7px] py-0.5 font-mono text-[10px]"
      style={{ color: LICENSE_COLOR[license] }}
    >
      {LICENSE_CLASS_LABELS[license]}
    </span>
  )
}

/** `weights 18.2 + adapters 0.3 + grads 0.3 + optimizer 2.0 + activations 2.0 = 22.8 GB`. */
function memoryFormula(a: MethodAssessment): string {
  const parts = [
    `weights ${fmtGb(a.parts.weightsGb)}`,
    ...(a.parts.adapterGb != null ? [`adapters ${fmtGb(a.parts.adapterGb)}`] : []),
    `grads ${fmtGb(a.parts.gradientsGb)}`,
    `optimizer ${fmtGb(a.parts.optimizerGb)}`,
    `activations ${fmtGb(a.parts.activationsGb)}`,
    ...(a.parts.referenceGb != null ? [`reference ${fmtGb(a.parts.referenceGb)}`] : []),
    ...(a.parts.rolloutGb != null ? [`rollouts ${fmtGb(a.parts.rolloutGb)}`] : []),
  ]
  return `${parts.join(' + ')} = ${fmtGb(a.requiredGb)} GB`
}

export function FinetuneRow({
  row,
  rank,
  capacityGb,
  trainCount,
  recipe,
  selectedAxes,
  inferGpuName,
  datasetLabel,
  expanded,
  onToggle,
}: {
  row: FinetuneRowData
  rank: number
  capacityGb: number
  trainCount: number
  recipe: TrainRecipe
  selectedAxes: FinetuneAxis[]
  inferGpuName: string | null
  datasetLabel: string
  expanded: boolean
  onToggle: () => void
}) {
  const { m, best, methods, cost, license, axes, inferFit, score, coverage } = row
  const regionId = `finetune-why-${m.slug}`
  const ratio = best ? best.requiredGb / capacityGb : 0
  const detailAxes = selectedAxes.length > 0 ? selectedAxes : FINETUNE_AXES

  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={regionId}
        className="grid w-full cursor-pointer grid-cols-[28px_minmax(200px,1.6fr)_70px_80px_minmax(150px,1fr)_80px_minmax(140px,1fr)_24px] items-center gap-2 px-3.5 py-[7px] text-left text-[12.5px] hover:bg-hover"
        data-testid="finetune-row"
      >
        <span className="font-mono text-[10.5px] text-dim">{rank}</span>
        <span className="flex min-w-0 items-baseline gap-[7px]">
          <span className="overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-text">
            {m.name}
          </span>
          <ModelTag open={m.open} />
          <LicenseChip license={license} />
        </span>
        <span className="text-right font-mono text-[11px] text-mut">
          {fmtParams(m.params, m.active)}
        </span>
        <span
          className="font-mono text-[10.5px]"
          style={{ color: best ? TRAIN_VERDICT_COLOR[best.verdict] : 'var(--dim)' }}
        >
          {best ? FINETUNE_METHOD_LABELS[best.method] : '—'}
        </span>
        <span className="flex items-center gap-2" title={`ratio ${(ratio * 100).toFixed(0)}%`}>
          <InlineBar
            pct={Math.min(100, Math.round(ratio * 100))}
            color={best ? TRAIN_VERDICT_COLOR[best.verdict] : undefined}
            height={5}
            className="flex-1"
          />
          <span className="whitespace-nowrap font-mono text-[10.5px] text-mut">
            {best ? `${fmtGb(best.requiredGb)} / ${capacityGb} GB` : '—'}
          </span>
        </span>
        <span className="text-right font-mono text-[11px]">
          {row.estCostUsd != null ? fmtUsd(row.estCostUsd) : '—'}
        </span>
        <span className="flex items-center gap-2">
          {selectedAxes.length > 0 ? (
            <>
              <span className="flex flex-1 gap-1">
                {selectedAxes.map((axis) => (
                  <span
                    key={axis}
                    className="flex-1"
                    title={`${AXIS_DETAIL_LABELS[axis]}: ${axes[axis]?.toFixed(1) ?? '—'}`}
                  >
                    <InlineBar pct={axes[axis] ?? 0} height={4} />
                  </span>
                ))}
              </span>
              <span className="whitespace-nowrap font-mono text-[11px] font-semibold">
                {score != null ? score.toFixed(1) : '—'}
                <span
                  className="ml-1 font-normal text-dim"
                  title={`Scored on ${coverage} of ${selectedAxes.length} selected axes`}
                >
                  {coverage}/{selectedAxes.length}
                </span>
              </span>
            </>
          ) : (
            <span
              className="ml-auto font-mono text-[11px]"
              style={{ color: m.ranked ? 'var(--text)' : 'var(--mut)' }}
              title={m.ranked ? 'Frontier Elo rating' : 'Too few benchmark results to rank'}
            >
              {Object.keys(m.bench).length > 0 ? m.index.toFixed(1) : '—'}
            </span>
          )}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`size-3.5 text-dim transition-transform ${expanded ? 'rotate-180' : ''}`}
          strokeWidth={1.75}
        />
      </button>

      {expanded && (
        <section
          id={regionId}
          aria-label={`${m.name} fine-tune breakdown`}
          className="flex flex-col gap-4 border-t border-border2 bg-panel2/40 px-3.5 py-4 pl-[44px]"
          data-testid="finetune-why"
        >
          <div>
            <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.07em] text-dim">
              Training fit · {TRAIN_RECIPE_LABELS[recipe]} on {capacityGb} GB
            </div>
            <div className="flex flex-col gap-1.5">
              {methods.map((a) => (
                <div key={a.method} className="flex flex-wrap items-center gap-2">
                  <span className="w-[96px] text-[11.5px] font-semibold">
                    {FINETUNE_METHOD_LABELS[a.method]}
                  </span>
                  <TrainVerdictChip method={a.method} verdict={a.verdict} />
                  <span className="font-mono text-[10.5px] text-mut">{memoryFormula(a)}</span>
                  {best?.method === a.method && (
                    <span className="rounded-[4px] bg-accdim px-[7px] py-0.5 font-mono text-[10px] text-acc">
                      max fidelity
                    </span>
                  )}
                </div>
              ))}
            </div>
            {recipe !== 'sft' && (
              <div className="mt-1.5 text-[10.5px] leading-[1.45] text-dim">
                LoRA/QLoRA need no separate {TRAIN_RECIPE_LABELS[recipe]} reference copy — the
                frozen base with adapters disabled serves as the reference model.
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.07em] text-dim">
              Estimated training cost
            </div>
            {cost ? (
              <div className="font-mono text-[10.5px] text-mut" data-testid="finetune-cost-line">
                {datasetLabel} × {TRAIN_EPOCHS} epochs ≈ {fmtTokens(cost.tokens)} tokens
                {recipe !== 'sft' &&
                  ` × ${RECIPE_COST_MULTIPLIER[recipe]} (${TRAIN_RECIPE_LABELS[recipe]})`}{' '}
                → {fmtHours(cost.gpuHours)} GPU-h × ${cost.usdPerHour}/h ≈{' '}
                <span className="font-semibold text-text">{fmtUsd(cost.usd)}</span>
                {trainCount > 1 && (
                  <>
                    {' '}
                    (~{fmtHours(cost.gpuHours / trainCount)} h wall-clock on {trainCount} GPUs)
                  </>
                )}
                {' · '}
                <Link to="/methodology" className="text-mut underline">
                  estimate — see methodology
                </Link>
              </div>
            ) : (
              <div className="text-[11px] text-dim" data-testid="finetune-cost-line">
                — no rental estimate for local Apple hardware; the fit math above still applies.
              </div>
            )}
          </div>

          {inferFit && inferGpuName && (
            <div>
              <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.07em] text-dim">
                Inference check · {inferGpuName}
              </div>
              <span
                className="whitespace-nowrap rounded-[4px] border border-border px-[7px] py-0.5 font-mono text-[10px]"
                style={{ color: FIT_VERDICT_COLOR[inferFit] }}
                data-testid={`infer-verdict-${inferFit}`}
              >
                Q4 · {FIT_VERDICT_LABELS[inferFit]}
              </span>
            </div>
          )}

          <div>
            <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.07em] text-dim">
              Task quality {selectedAxes.length > 0 ? '(selected axes)' : '(all axes)'}
            </div>
            <div className="flex max-w-[440px] flex-col gap-1">
              {detailAxes.map((axis) => (
                <div key={axis} className="flex items-center gap-2">
                  <span className="w-[190px] text-[11px] text-mut">{AXIS_DETAIL_LABELS[axis]}</span>
                  <InlineBar pct={axes[axis] ?? 0} height={4} className="flex-1" />
                  <span className="w-[36px] text-right font-mono text-[10.5px]">
                    {axes[axis] != null ? axes[axis]?.toFixed(1) : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <LicenseChip license={license} />
            <span className="min-w-0 flex-1 truncate text-[10.5px] text-dim" title={m.license}>
              {m.license}
            </span>
          </div>

          <div>
            <Link to="/models/$slug" params={{ slug: m.slug }} className="text-[11.5px]">
              Model page →
            </Link>
          </div>
        </section>
      )}
    </div>
  )
}
