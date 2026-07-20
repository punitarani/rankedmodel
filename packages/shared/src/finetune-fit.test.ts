import { describe, expect, it } from 'vitest'
import {
  assessTrainMethod,
  assessTrainMethods,
  DATASET_PRESETS,
  estimateTrainCost,
  GPU_TRAIN_ECON,
  TOKENS_PER_SAMPLE,
  TRAIN_EPOCHS,
  TRAIN_METHODS,
  trainMemoryParts,
  trainVerdict,
} from './finetune-fit'

function sum(parts: ReturnType<typeof trainMemoryParts>): number {
  return (
    parts.weightsGb +
    (parts.adapterGb ?? 0) +
    parts.optimizerGb +
    parts.gradientsGb +
    parts.activationsGb +
    (parts.referenceGb ?? 0) +
    (parts.rolloutGb ?? 0)
  )
}

describe('trainMemoryParts / assessTrainMethod (C8 memory model)', () => {
  it.each(
    TRAIN_METHODS.flatMap((m) => [7, 33, 70, 1040].map((p) => [m, p] as const)),
  )('requiredGb is the exact sum of parts (%s, %dB)', (method, paramsB) => {
    const a = assessTrainMethod(method, paramsB, 80)
    expect(a.requiredGb).toBeCloseTo(sum(a.parts), 10)
  })

  it('full 7B ≈ 114 GB (2P + 2P + 12P + activations floor)', () => {
    expect(assessTrainMethod('full', 7, 80).requiredGb).toBeCloseTo(114, 10)
  })

  it('LoRA 7B ≈ 16.56 GB — fits a 24 GB card (community anchor)', () => {
    const a = assessTrainMethod('lora', 7, 24)
    expect(a.requiredGb).toBeCloseTo(16.56, 10)
    expect(a.verdict).toBe('fits')
  })

  it('QLoRA 33B ≈ 22.79 GB — tight on a 24 GB card (QLoRA-paper anchor)', () => {
    const a = assessTrainMethod('qlora', 33, 24)
    expect(a.requiredGb).toBeCloseTo(22.79, 10)
    expect(a.verdict).toBe('tight')
  })

  it('QLoRA 65B ≈ 44.2 GB — tight on a single 48 GB GPU (QLoRA-paper anchor)', () => {
    const a = assessTrainMethod('qlora', 65, 48)
    expect(a.requiredGb).toBeCloseTo(44.2, 10)
    expect(a.verdict).toBe('tight')
  })

  it('full 70B ≈ 1123.5 GB — wont-fit on 8×H100 (640), tight on 8×H200 (1128)', () => {
    expect(assessTrainMethod('full', 70, 8 * 80).verdict).toBe('wont-fit')
    const h200s = assessTrainMethod('full', 70, 8 * 141)
    expect(h200s.requiredGb).toBeCloseTo(1123.5, 10)
    expect(h200s.verdict).toBe('tight')
  })

  it('activations floor: 2 GB below 40B, scaling above', () => {
    expect(trainMemoryParts('qlora', 7).activationsGb).toBe(2)
    expect(trainMemoryParts('qlora', 70).activationsGb).toBeCloseTo(3.5, 10)
  })

  it('adapterGb present only for lora/qlora', () => {
    expect(trainMemoryParts('full', 7).adapterGb).toBeUndefined()
    expect(trainMemoryParts('lora', 7).adapterGb).toBeCloseTo(0.07, 10)
    expect(trainMemoryParts('qlora', 7).adapterGb).toBeCloseTo(0.07, 10)
  })

  it('verdict boundaries at ratios 0.8 and 1.0', () => {
    expect(trainVerdict(80, 100)).toBe('fits')
    expect(trainVerdict(80.001, 100)).toBe('tight')
    expect(trainVerdict(100, 100)).toBe('tight')
    expect(trainVerdict(100.001, 100)).toBe('wont-fit')
  })

  it('assessTrainMethods returns all three in display order', () => {
    expect(assessTrainMethods(7, 24).map((a) => a.method)).toEqual(['qlora', 'lora', 'full'])
  })
})

describe('recipes (DPO/RL memory terms)', () => {
  it('DPO adds a bf16 reference copy under full FT only', () => {
    const full = assessTrainMethod('full', 7, 200, 'dpo')
    expect(full.parts.referenceGb).toBeCloseTo(14, 10)
    expect(full.requiredGb).toBeCloseTo(128, 10) // 114 + 14
    // LoRA/QLoRA reuse the frozen base as the reference — no extra copy
    expect(assessTrainMethod('lora', 7, 24, 'dpo').requiredGb).toBeCloseTo(16.56, 10)
    expect(assessTrainMethod('qlora', 7, 24, 'dpo').parts.referenceGb).toBeUndefined()
  })

  it('RL adds rollout buffers on top: QLoRA-GRPO 7B ≈ 8.41 GB (fits a 12 GB card)', () => {
    const a = assessTrainMethod('qlora', 7, 12, 'rl')
    expect(a.parts.rolloutGb).toBe(2) // floor
    expect(a.requiredGb).toBeCloseTo(8.41, 10)
    expect(a.verdict).toBe('fits') // 8.41/12 ≈ 0.70 ≤ 0.8
  })

  it('full-GRPO 7B ≈ 130 GB — wont-fit 1×H100, fits 2×H100', () => {
    expect(assessTrainMethod('full', 7, 80, 'rl').verdict).toBe('wont-fit')
    const two = assessTrainMethod('full', 7, 160, 'rl')
    expect(two.requiredGb).toBeCloseTo(130, 10) // 114 + 14 ref + 2 rollout
    expect(two.verdict).toBe('tight') // 130/160 = 0.8125
  })

  it('requiredGb stays the exact sum of parts across recipes', () => {
    for (const recipe of ['sft', 'dpo', 'rl'] as const) {
      for (const method of TRAIN_METHODS) {
        const a = assessTrainMethod(method, 70, 320, recipe)
        expect(a.requiredGb).toBeCloseTo(sum(a.parts), 10)
      }
    }
  })
})

describe('estimateTrainCost (C8 cost model)', () => {
  it('7B on the 10k preset with one RTX 4090 ≈ 6.2 GPU-h, ≈ $2.48', () => {
    const preset = DATASET_PRESETS.find((p) => p.id === '10k')
    if (!preset) throw new Error('missing preset')
    const cost = estimateTrainCost(7, preset.tokens, 'rtx4090')
    expect(cost?.gpuHours).toBeCloseTo(6.206, 3)
    expect(cost?.usd).toBeCloseTo(2.48, 2)
    expect(cost?.usdPerHour).toBe(0.4)
    expect(cost?.tokens).toBe(preset.tokens)
  })

  it('Mac and unknown slugs have no cost estimate', () => {
    expect(estimateTrainCost(7, 30_720_000, 'm4pro')).toBeNull()
    expect(estimateTrainCost(7, 30_720_000, 'm3ultra')).toBeNull()
    expect(estimateTrainCost(7, 30_720_000, 'not-a-gpu')).toBeNull()
  })

  it('dataset presets encode samples × 1024 tokens × 3 epochs', () => {
    for (const p of DATASET_PRESETS) {
      expect(p.tokens).toBe(p.samples * TOKENS_PER_SAMPLE * TRAIN_EPOCHS)
    }
    expect(DATASET_PRESETS.find((p) => p.id === '10k')?.tokens).toBe(30_720_000)
  })

  it('recipe multipliers scale compute: DPO ×2, RL ×4', () => {
    const sft = estimateTrainCost(7, 30_720_000, 'rtx4090', 'sft')
    const dpo = estimateTrainCost(7, 30_720_000, 'rtx4090', 'dpo')
    const rl = estimateTrainCost(7, 30_720_000, 'rtx4090', 'rl')
    expect(dpo?.gpuHours).toBeCloseTo((sft?.gpuHours ?? 0) * 2, 6)
    expect(rl?.usd).toBeCloseTo((sft?.usd ?? 0) * 4, 6)
  })

  it('econ table covers exactly the 12 curated hardware profiles', () => {
    expect(Object.keys(GPU_TRAIN_ECON).sort()).toEqual(
      [
        'a100',
        'b200',
        'h100',
        'h200',
        'm3max',
        'm3ultra',
        'm4pro',
        'rtx3060',
        'rtx3090',
        'rtx4070',
        'rtx4090',
        'rtx5090',
      ].sort(),
    )
  })
})
