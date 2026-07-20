import { describe, expect, it } from 'vitest'
import {
  docsIdx,
  FINETUNE_AXES,
  type FinetuneQuery,
  finetuneAxes,
  selectFinetune,
} from './finetune-select'
import type { BenchmarkBounds } from './scoring'
import type { SnapshotModel } from './snapshot'

const model = (over: Partial<SnapshotModel>): SnapshotModel =>
  ({
    slug: 'x',
    name: 'X',
    org: 'Org',
    orgSlug: 'org',
    family: 'F',
    familySlug: 'f',
    date: '2026-01-01',
    status: 'released',
    openness: 'open-weights',
    open: true,
    predecessor: null,
    params: 7,
    active: null,
    ctxK: 128,
    arch: 'Dense',
    archClass: 'dense',
    license: 'Apache 2.0',
    langCount: null,
    modalities: ['text'],
    caps: {
      reasoning: false,
      coding: false,
      vision: false,
      functionCalling: false,
      toolUse: false,
      agentic: false,
    },
    apiAvailable: true,
    bench: {},
    price: null,
    vramQ4: 4,
    vramFp16: null,
    quants: [],
    tps4090: null,
    tpsNote: null,
    links: {},
    note: '',
    index: 50,
    rank: 1,
    ranked: true,
    categoryIdx: {
      'human-preference': null,
      knowledge: null,
      reasoning: null,
      coding: null,
      math: null,
      vision: null,
      agents: null,
    },
    ...over,
  }) as SnapshotModel

const GPUS = [
  { slug: 'rtx4090', vramGb: 24 },
  { slug: 'h100', vramGb: 80 },
  { slug: 'm3max', vramGb: 96 },
]

const BENCHMARKS: BenchmarkBounds[] = [
  { slug: 'docvqa', category: 'vision', normMin: 50, normMax: 99 },
  { slug: 'chartqa', category: 'vision', normMin: 30, normMax: 95 },
  { slug: 'ifeval', category: 'reasoning', normMin: 20, normMax: 96 },
  { slug: 'mmlu', category: 'knowledge', normMin: 25, normMax: 92 },
]

const query = (over: Partial<FinetuneQuery>): FinetuneQuery => ({
  q: '',
  axes: [],
  trainGpu: 'rtx4090',
  trainCount: 1,
  inferGpu: null,
  method: 'any',
  recipe: 'sft',
  dataset: '10k',
  budgetUsd: null,
  license: 'any',
  size: 'any',
  minCtxK: null,
  arch: 'any',
  org: 'all',
  modalities: [],
  show: 'fits',
  sort: 'best',
  ...over,
})

const small7 = model({ slug: 'small-7b', name: 'Small 7B', index: 60 })
const mid33 = model({
  slug: 'mid-33b',
  name: 'Mid 33B',
  params: 33,
  vramQ4: 19,
  license: 'Llama 3.1 Community License Agreement',
  index: 80,
})
const big70 = model({
  slug: 'big-70b',
  name: 'Big 70B',
  params: 70,
  vramQ4: 42,
  license: 'CC-BY-NC',
  index: 90,
})
const closed = model({ slug: 'closed', openness: 'closed', open: false, params: null })
const noParams = model({ slug: 'no-params', params: null })

describe('selectFinetune hard constraints', () => {
  const all = [small7, mid33, big70, closed, noParams]

  it('keeps only open models with known params that fit some method', () => {
    const rows = selectFinetune(all, query({}), GPUS, BENCHMARKS)
    // 24 GB: 7B lora fits, 33B qlora tight, 70B qlora 47.6 GB wont-fit.
    expect(rows.map((r) => r.m.slug)).toEqual(['mid-33b', 'small-7b'])
  })

  it('unknown training GPU → empty, never throws', () => {
    expect(selectFinetune(all, query({ trainGpu: 'nope' }), GPUS, BENCHMARKS)).toEqual([])
  })

  it('trainCount scales capacity: 70B appears on 2×H100 but not 1×RTX 4090', () => {
    const rows = selectFinetune(all, query({ trainGpu: 'h100', trainCount: 2 }), GPUS, BENCHMARKS)
    expect(rows.map((r) => r.m.slug)).toContain('big-70b')
  })

  it('method constraint: full FT on 24 GB excludes everything but nothing at 2×H100 for 7B', () => {
    expect(selectFinetune(all, query({ method: 'full' }), GPUS, BENCHMARKS)).toEqual([])
    const rows = selectFinetune(
      all,
      query({ method: 'full', trainGpu: 'h100', trainCount: 2 }),
      GPUS,
      BENCHMARKS,
    )
    expect(rows.map((r) => r.m.slug)).toEqual(['small-7b']) // 114 GB fits 160 GB
    expect(rows[0]?.best?.method).toBe('full')
  })

  it('license threshold: conditional admits permissive + conditional, drops research-only', () => {
    const rows = selectFinetune(
      all,
      query({ license: 'conditional', trainGpu: 'h100', trainCount: 2 }),
      GPUS,
      BENCHMARKS,
    )
    expect(rows.map((r) => r.m.slug).sort()).toEqual(['mid-33b', 'small-7b'])
    const permissive = selectFinetune(
      all,
      query({ license: 'permissive', trainGpu: 'h100', trainCount: 2 }),
      GPUS,
      BENCHMARKS,
    )
    expect(permissive.map((r) => r.m.slug)).toEqual(['small-7b'])
  })

  it('size and modality filters', () => {
    const audio = model({ slug: 'audio-7b', modalities: ['text', 'audio'] })
    const rows = selectFinetune([small7, audio], query({ modalities: ['audio'] }), GPUS, BENCHMARKS)
    expect(rows.map((r) => r.m.slug)).toEqual(['audio-7b'])
    const sized = selectFinetune([small7, mid33], query({ size: 'm' }), GPUS, BENCHMARKS)
    expect(sized.map((r) => r.m.slug)).toEqual(['mid-33b'])
  })

  it('text query matches name/org/family', () => {
    const rows = selectFinetune(all, query({ q: 'mid' }), GPUS, BENCHMARKS)
    expect(rows.map((r) => r.m.slug)).toEqual(['mid-33b'])
  })

  it('inference check: wont-run excluded, offload-partial kept with verdict', () => {
    const offload = model({ slug: 'offload-24b', params: 24, vramQ4: 26 }) // 28.08/24 = 1.17
    const rows = selectFinetune(
      [small7, big70, offload],
      query({ trainGpu: 'h100', trainCount: 2, inferGpu: 'rtx4090' }),
      GPUS,
      BENCHMARKS,
    )
    // big70: 42 × 1.08 = 45.36 / 24 = 1.89 → wont-run → excluded
    expect(rows.map((r) => r.m.slug).sort()).toEqual(['offload-24b', 'small-7b'])
    expect(rows.find((r) => r.m.slug === 'offload-24b')?.inferFit).toBe('offload-partial')
    expect(rows.find((r) => r.m.slug === 'small-7b')?.inferFit).toBe('fits-comfortably')
  })

  it('budget excludes over-budget rows but passes unknown (Mac) costs', () => {
    const rows = selectFinetune(
      [big70],
      query({ trainGpu: 'h100', trainCount: 2, budgetUsd: 20 }),
      GPUS,
      BENCHMARKS,
    )
    expect(rows).toEqual([]) // 70B × 30.72M tok on H100 ≈ $25.86 > $20
    const ok = selectFinetune(
      [big70],
      query({ trainGpu: 'h100', trainCount: 2, budgetUsd: 30 }),
      GPUS,
      BENCHMARKS,
    )
    expect(ok.map((r) => r.m.slug)).toEqual(['big-70b'])
    const mac = selectFinetune(
      [small7],
      query({ trainGpu: 'm3max', budgetUsd: 1 }),
      GPUS,
      BENCHMARKS,
    )
    expect(mac.map((r) => r.m.slug)).toEqual(['small-7b'])
    expect(mac[0]?.estCostUsd).toBeNull()
  })
})

describe('best method (fidelity order under any)', () => {
  it('7B on 24 GB → LoRA (full wont-fit); 7B on 2×H100 → full', () => {
    const on4090 = selectFinetune([small7], query({}), GPUS, BENCHMARKS)
    expect(on4090[0]?.best?.method).toBe('lora')
    const onH100s = selectFinetune(
      [small7],
      query({ trainGpu: 'h100', trainCount: 2 }),
      GPUS,
      BENCHMARKS,
    )
    expect(onH100s[0]?.best?.method).toBe('full')
  })

  it('33B on 24 GB → QLoRA only', () => {
    const rows = selectFinetune([mid33], query({}), GPUS, BENCHMARKS)
    expect(rows[0]?.best?.method).toBe('qlora')
    expect(rows[0]?.best?.verdict).toBe('tight')
    expect(rows[0]?.methods.map((a) => a.method)).toEqual(['qlora', 'lora', 'full'])
  })
})

describe('axes, docs derivation, and score', () => {
  const docModel = model({
    slug: 'doc-7b',
    bench: { docvqa: 90 },
    modalities: ['text', 'vision'],
    categoryIdx: {
      'human-preference': null,
      knowledge: null,
      reasoning: null,
      coding: 80,
      math: null,
      vision: 75,
      agents: null,
    },
  })

  it('docsIdx = mean of normalized doc benchmarks on the 0–100 scale', () => {
    expect(docsIdx({ docvqa: 90 }, BENCHMARKS)).toBeCloseTo(81.6, 5) // (90−50)/49
    expect(docsIdx({ docvqa: 90, chartqa: 95 }, BENCHMARKS)).toBeCloseTo(90.8, 5) // mean(0.8163, 1)
    expect(docsIdx({ mmlu: 88 }, BENCHMARKS)).toBeNull() // non-doc benchmarks don't count
  })

  it('the if axis derives from IFEval alone', () => {
    const ifModel = model({ slug: 'if-7b', bench: { ifeval: 87 } })
    const axes = finetuneAxes(ifModel, BENCHMARKS)
    expect(axes.if).toBeCloseTo(88.2, 5) // (87−20)/76 → 0.8816 → 88.2 on the index scale
    expect(finetuneAxes(small7, BENCHMARKS).if).toBeNull()
  })

  it('finetuneAxes carries all 9 keys; docs null without doc benchmarks', () => {
    const axes = finetuneAxes(small7, BENCHMARKS)
    expect(Object.keys(axes).sort()).toEqual([...FINETUNE_AXES].sort())
    expect(axes.docs).toBeNull()
    expect(finetuneAxes(docModel, BENCHMARKS).docs).toBeCloseTo(81.6, 5)
  })

  it('score = mean over selected axes where covered; zero coverage → null, sorts last', () => {
    const rows = selectFinetune(
      [docModel, small7],
      query({ axes: ['coding', 'docs'] }),
      GPUS,
      BENCHMARKS,
    )
    expect(rows[0]?.m.slug).toBe('doc-7b')
    expect(rows[0]?.score).toBeCloseTo((80 + 81.6) / 2, 5)
    expect(rows[0]?.coverage).toBe(2)
    expect(rows[1]?.score).toBeNull() // small7 covers neither axis — still listed, after
    expect(rows[1]?.coverage).toBe(0)
  })

  it('coverage tiers beat raw means: 2/2 axes at 80.8 outranks 1/2 axes at 95', () => {
    const cherry = model({
      slug: 'cherry-7b',
      bench: { docvqa: 96.55 }, // → docs 95, coding null
      index: 99,
    })
    const rows = selectFinetune(
      [cherry, docModel],
      query({ axes: ['coding', 'docs'] }),
      GPUS,
      BENCHMARKS,
    )
    expect(rows.map((r) => r.m.slug)).toEqual(['doc-7b', 'cherry-7b'])
  })

  it('empty axes → every score null, ranked models lead by Frontier index', () => {
    const rows = selectFinetune([small7, mid33], query({}), GPUS, BENCHMARKS)
    expect(rows.every((r) => r.score === null)).toBe(true)
    expect(rows.map((r) => r.m.slug)).toEqual(['mid-33b', 'small-7b']) // index 80 > 60
  })
})

describe('sorts and determinism', () => {
  const models = [small7, mid33]

  it('cost ascending: smaller model trains cheaper', () => {
    const rows = selectFinetune(models, query({ sort: 'cost' }), GPUS, BENCHMARKS)
    expect(rows.map((r) => r.m.slug)).toEqual(['small-7b', 'mid-33b'])
  })

  it('vram ascending by the recommended method requirement', () => {
    const rows = selectFinetune(models, query({ sort: 'vram' }), GPUS, BENCHMARKS)
    // 33B qlora 22.79 vs 7B lora 16.56
    expect(rows.map((r) => r.m.slug)).toEqual(['small-7b', 'mid-33b'])
  })

  it('params descending; date descending', () => {
    const byParams = selectFinetune(models, query({ sort: 'params' }), GPUS, BENCHMARKS)
    expect(byParams.map((r) => r.m.slug)).toEqual(['mid-33b', 'small-7b'])
    const newer = model({ slug: 'newer-7b', date: '2026-06-01' })
    const byDate = selectFinetune([small7, newer], query({ sort: 'date' }), GPUS, BENCHMARKS)
    expect(byDate.map((r) => r.m.slug)).toEqual(['newer-7b', 'small-7b'])
  })

  it('input order never changes output order', () => {
    const forward = selectFinetune([small7, mid33, big70], query({}), GPUS, BENCHMARKS)
    const reversed = selectFinetune([big70, mid33, small7], query({}), GPUS, BENCHMARKS)
    expect(reversed.map((r) => r.m.slug)).toEqual(forward.map((r) => r.m.slug))
  })
})

describe('checkpoint dedupe and new filters', () => {
  it('effort/mode variants collapse to the default config', () => {
    const thinking = model({
      slug: 'q-8b-thinking',
      effortLabel: 'Thinking',
      isDefaultConfig: true,
    })
    const nonThinking = model({
      slug: 'q-8b-non-thinking',
      effortLabel: 'Non-thinking',
      isDefaultConfig: false,
    })
    const rows = selectFinetune([thinking, nonThinking, small7], query({}), GPUS, BENCHMARKS)
    expect(rows.map((r) => r.m.slug).sort()).toEqual(['q-8b-thinking', 'small-7b'])
  })

  it('minimum context window filters on ctxK (inclusive)', () => {
    const longCtx = model({ slug: 'long-7b', ctxK: 1000 })
    const rows = selectFinetune([small7, longCtx], query({ minCtxK: 1000 }), GPUS, BENCHMARKS)
    expect(rows.map((r) => r.m.slug)).toEqual(['long-7b'])
    // boundary: small7's 128K passes a ≥128K floor
    const incl = selectFinetune([small7], query({ minCtxK: 128 }), GPUS, BENCHMARKS)
    expect(incl.map((r) => r.m.slug)).toEqual(['small-7b'])
  })

  it('architecture filter: dense means non-MoE, moe means MoE only', () => {
    const moe = model({ slug: 'moe-30b', params: 30, archClass: 'moe', active: 3 })
    const ssm = model({ slug: 'ssm-7b', archClass: 'ssm' })
    const dense = selectFinetune([small7, moe, ssm], query({ arch: 'dense' }), GPUS, BENCHMARKS)
    expect(dense.map((r) => r.m.slug).sort()).toEqual(['small-7b', 'ssm-7b'])
    const moeOnly = selectFinetune([small7, moe, ssm], query({ arch: 'moe' }), GPUS, BENCHMARKS)
    expect(moeOnly.map((r) => r.m.slug)).toEqual(['moe-30b'])
  })

  it('organization filter matches orgSlug', () => {
    const other = model({ slug: 'other-7b', orgSlug: 'acme', org: 'Acme' })
    const rows = selectFinetune([small7, other], query({ org: 'acme' }), GPUS, BENCHMARKS)
    expect(rows.map((r) => r.m.slug)).toEqual(['other-7b'])
  })

  it('vision counts as a hard modality requirement', () => {
    const vlm = model({ slug: 'vlm-7b', modalities: ['text', 'vision'] })
    const rows = selectFinetune([small7, vlm], query({ modalities: ['vision'] }), GPUS, BENCHMARKS)
    expect(rows.map((r) => r.m.slug)).toEqual(['vlm-7b'])
  })
})

describe('recipes flow through feasibility and cost', () => {
  it('RL rollout memory pushes 33B QLoRA off a 24 GB card', () => {
    const sft = selectFinetune([mid33], query({}), GPUS, BENCHMARKS)
    expect(sft).toHaveLength(1) // 22.79 GB tight
    const rl = selectFinetune([mid33], query({ recipe: 'rl' }), GPUS, BENCHMARKS)
    expect(rl).toHaveLength(0) // + max(2, 3.3) rollout → 26.09 GB won't fit
  })

  it('DPO scales the cost estimate by 2.5×', () => {
    const sft = selectFinetune([small7], query({}), GPUS, BENCHMARKS)
    const dpo = selectFinetune([small7], query({ recipe: 'dpo' }), GPUS, BENCHMARKS)
    expect(dpo[0]?.estCostUsd).toBeCloseTo((sft[0]?.estCostUsd ?? 0) * 2.5, 6)
  })
})

describe('show mode + big-model visibility', () => {
  const GPUS_FULL = [
    { slug: 'rtx4090', name: 'RTX 4090 24GB', vramGb: 24, kind: 'consumer' },
    { slug: 'b200', name: 'B200 192GB', vramGb: 192, kind: 'datacenter' },
  ]
  const huge = model({ slug: 'huge-2800b', name: 'Huge 2800B', params: 2800, vramQ4: 1400 })
  const mid = model({ slug: 'mid-33b', name: 'Mid 33B', params: 33, vramQ4: 19 })

  it("'fits' mode (default) hides models too big for the hardware", () => {
    const rows = selectFinetune([mid, huge], query({}), GPUS_FULL, BENCHMARKS)
    expect(rows.map((r) => r.m.slug)).toEqual(['mid-33b'])
  })

  it("'all' mode keeps non-fitting models with fits=false + a needed-config hint", () => {
    // 8×B200 = 1536 GB; huge 2800B QLoRA ≈ 1904 GB → exceeds even the largest config
    const rows = selectFinetune(
      [mid, huge],
      query({ show: 'all', trainGpu: 'b200', trainCount: 8 }),
      GPUS_FULL,
      BENCHMARKS,
    )
    expect(rows.map((r) => r.m.slug)).toEqual(['mid-33b', 'huge-2800b']) // fitting first
    const h = rows.find((r) => r.m.slug === 'huge-2800b')
    expect(h?.fits).toBe(false)
    expect(h?.best).toBeNull()
    expect(h?.neededConfig).toBeNull() // exceeds 8× B200
    expect(h?.estCostUsd).toBeNull() // no fitting config → no cost
  })

  it("'all' mode shows a needed config when a bigger rentable one exists", () => {
    // 70B QLoRA ≈ 47.6 GB — won't fit 1×rtx4090, needs 1× B200
    const big70 = model({ slug: 'big-70b', params: 70, vramQ4: 42 })
    const rows = selectFinetune([big70], query({ show: 'all' }), GPUS_FULL, BENCHMARKS)
    expect(rows[0]?.fits).toBe(false)
    expect(rows[0]?.neededConfig).toMatchObject({ count: 1, slug: 'b200' })
    expect(rows[0]?.estCostUsd).not.toBeNull() // priced on the needed config
  })
})

describe('MoE cost basis', () => {
  it('MoE with undisclosed active params → cost null (no 87× overestimate)', () => {
    const moeNullActive = model({
      slug: 'moe-null',
      params: 235,
      active: null,
      archClass: 'moe',
      vramQ4: 133,
    })
    const rows = selectFinetune(
      [moeNullActive],
      query({ trainGpu: 'h100', trainCount: 2 }),
      GPUS,
      BENCHMARKS,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.estCostUsd).toBeNull()
  })

  it('dense model cost uses total params (active is null for dense)', () => {
    const dense = model({ slug: 'dense-7b', params: 7, active: null, archClass: 'dense' })
    const rows = selectFinetune([dense], query({}), GPUS, BENCHMARKS)
    expect(rows[0]?.estCostUsd).not.toBeNull()
  })
})

describe('MoE models', () => {
  const moe = model({ slug: 'moe-235b', params: 235, active: 22, archClass: 'moe', vramQ4: 133 })

  it('memory uses total params, cost uses active params', () => {
    const rows = selectFinetune(
      moe ? [moe] : [],
      query({ trainGpu: 'h100', trainCount: 2 }),
      GPUS,
      BENCHMARKS,
    )
    expect(rows).toHaveLength(1)
    const row = rows[0]
    // qlora memory on 235B total: 129.25 + 2.35 + 2.35 + 14.1 + 11.75 = 159.8 GB → tight on 160
    expect(row?.best?.method).toBe('qlora')
    expect(row?.best?.requiredGb).toBeCloseTo(159.8, 5)
    expect(row?.best?.verdict).toBe('tight')
    // cost from ACTIVE 22B: 6e9 × 22 × 30.72M / (990e12 × 0.35) s ≈ 3.251 GPU-h × $2.50
    expect(row?.cost?.gpuHours).toBeCloseTo(3.251, 3)
    expect(row?.estCostUsd).toBeCloseTo(8.13, 2)
  })
})
