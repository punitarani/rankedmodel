/**
 * Fine-tune fit & cost engine (contract C8) — formula-derived training VRAM and cost,
 * the /finetune sibling of the C2 inference-fit engine. Pure functions, no curated
 * training data: everything derives from a model's total params (memory) and active
 * params (MoE FLOPs).
 *
 * Memory: `requiredGb` is the EXACT sum of the rendered parts (the UI shows the
 * addition line), so there is no C2-style ×1.08 factor — headroom lives in the
 * verdict thresholds instead (same 0.8/1.0 ratio boundaries as C2). Capacity is
 * `count × vramGb`, assuming FSDP/ZeRO-3 shards weights/grads/optimizer across GPUs;
 * per-GPU activation replication is accepted as noise at this fidelity.
 * Anchored to the QLoRA paper (33B on 24 GB, 65B on 48 GB) and common practice
 * (7B LoRA ≈ 17 GB on a 24 GB card, 7B full ≈ 110–130 GB).
 *
 * Cost: 6·P·T training FLOPs against peak bf16 throughput at a fixed MFU, priced at
 * typical marketplace rental rates (editorial estimates — one table, one edit
 * re-prices everything). GPU-hours are count-independent; wall-clock divides by
 * count UI-side. Method-independent in v1: LoRA's skipped base-weight grads ≈
 * QLoRA's dequantization overhead at this fidelity.
 */

export const TRAIN_METHODS = ['qlora', 'lora', 'full'] as const
export type TrainMethod = (typeof TRAIN_METHODS)[number]

/**
 * Post-training recipes. SFT = plain supervised fine-tuning. DPO adds a frozen
 * reference model — a full bf16 copy for full FT, but FREE for LoRA/QLoRA (the
 * adapter-off base is the reference; the standard TRL/PEFT trick). RL (GRPO-style)
 * additionally needs rollout/KV buffers, and its compute is rollout-dominated.
 */
export const TRAIN_RECIPES = ['sft', 'dpo', 'rl'] as const
export type TrainRecipe = (typeof TRAIN_RECIPES)[number]

export const TRAIN_RECIPE_LABELS: Record<TrainRecipe, string> = {
  sft: 'SFT',
  dpo: 'DPO',
  rl: 'RL (GRPO)',
}

export const FINETUNE_METHOD_LABELS: Record<TrainMethod, string> = {
  qlora: 'QLoRA',
  lora: 'LoRA',
  full: 'Full fine-tune',
}

/** One-word method labels for dense table badges. */
export const FINETUNE_METHOD_SHORT: Record<TrainMethod, string> = {
  qlora: 'QLoRA',
  lora: 'LoRA',
  full: 'Full',
}

/** Fidelity order for picking the best feasible method — distinct from display order. */
export const TRAIN_METHOD_FIDELITY = ['full', 'lora', 'qlora'] as const

export const TRAIN_VERDICTS = ['fits', 'tight', 'wont-fit'] as const
export type TrainVerdict = (typeof TRAIN_VERDICTS)[number]

export const TRAIN_VERDICT_LABELS: Record<TrainVerdict, string> = {
  fits: 'fits',
  tight: 'fits (tight)',
  'wont-fit': "won't fit",
}

// ---- memory model (GB per B params unless noted) ----
/** bf16 base weights (full FT and the frozen LoRA base). */
export const BF16_BYTES_PER_PARAM = 2
/** NF4 4-bit base incl. double-quantization constants (QLoRA paper). */
export const NF4_BYTES_PER_PARAM = 0.55
/** bf16 gradients on trainable params. */
export const GRAD_BYTES_PER_PARAM = 2
/** AdamW state on trainable params: fp32 master copy (4) + m/v moments (8). */
export const ADAMW_BYTES_PER_PARAM = 12
/** LoRA adapter params as a fraction of the base (r≈16–32 on attention+MLP). */
export const LORA_ADAPTER_FRACTION = 0.005
/** Activations scale with model size: grad checkpointing, micro-batch 1, ~2k seq. */
export const ACTIVATIONS_GB_PER_B = 0.05
/** Activation floor — CUDA context + framework buffers dominate small models. */
export const ACTIVATIONS_MIN_GB = 2
/** Frozen bf16 reference model (DPO/RL with full FT; LoRA/QLoRA reuse the frozen base). */
export const REF_MODEL_BYTES_PER_PARAM = 2
/** RL rollout/KV buffers scale with model size, with a small-model floor. */
export const RL_ROLLOUT_GB_PER_B = 0.1
export const RL_ROLLOUT_MIN_GB = 2

// ---- cost model ----
/** Training FLOPs per param per token: forward 2 + backward 4 (Kaplan et al.). */
export const TRAIN_FLOPS_PER_PARAM_TOKEN = 6
/** Model FLOPs utilization — 0.3–0.4 is typical for a tuned SFT run. */
export const TRAIN_MFU = 0.35
/** Average SFT sample length in tokens (prompt + response). */
export const TOKENS_PER_SAMPLE = 1024
/** Standard instruction-tuning epoch count. */
export const TRAIN_EPOCHS = 3
/**
 * Recipe compute multipliers over SFT (rough, documented). DPO forwards the chosen +
 * rejected pair through both the policy (train) and the frozen reference (forward-only),
 * ≈2.5× SFT. GRPO-style RL is rollout-generation-dominated: with a representative G≈8
 * sampled completions per prompt (generation ≈2 FLOPs/param/token + training ≈6), total
 * ≈8× SFT. These are order-of-magnitude estimates surfaced as such in the UI.
 */
export const RECIPE_COST_MULTIPLIER: Record<TrainRecipe, number> = { sft: 1, dpo: 2.5, rl: 8 }

export interface TrainMemoryParts {
  weightsGb: number
  /** LoRA/QLoRA only: bf16 adapter weights. */
  adapterGb?: number
  optimizerGb: number
  gradientsGb: number
  activationsGb: number
  /** DPO/RL with full FT only: frozen bf16 reference model. */
  referenceGb?: number
  /** RL only: rollout generation + KV buffers. */
  rolloutGb?: number
}

export interface MethodAssessment {
  method: TrainMethod
  /** Invariant: the exact sum of `parts` — the UI renders them as an addition line. */
  requiredGb: number
  verdict: TrainVerdict
  parts: TrainMemoryParts
}

function activationsGb(paramsB: number): number {
  return Math.max(ACTIVATIONS_MIN_GB, ACTIVATIONS_GB_PER_B * paramsB)
}

/**
 * Memory breakdown per method × recipe. Trainable params = all (full) or the LoRA
 * adapter. DPO/RL need a frozen reference model: a second bf16 copy under full FT,
 * but zero extra under LoRA/QLoRA (adapter-off forward through the shared base).
 */
export function trainMemoryParts(
  method: TrainMethod,
  paramsB: number,
  recipe: TrainRecipe = 'sft',
): TrainMemoryParts {
  const referenceGb =
    recipe !== 'sft' && method === 'full' ? REF_MODEL_BYTES_PER_PARAM * paramsB : undefined
  const rolloutGb =
    recipe === 'rl' ? Math.max(RL_ROLLOUT_MIN_GB, RL_ROLLOUT_GB_PER_B * paramsB) : undefined
  if (method === 'full') {
    return {
      weightsGb: BF16_BYTES_PER_PARAM * paramsB,
      gradientsGb: GRAD_BYTES_PER_PARAM * paramsB,
      optimizerGb: ADAMW_BYTES_PER_PARAM * paramsB,
      activationsGb: activationsGb(paramsB),
      ...(referenceGb != null && { referenceGb }),
      ...(rolloutGb != null && { rolloutGb }),
    }
  }
  const adapterB = LORA_ADAPTER_FRACTION * paramsB
  const baseBytes = method === 'qlora' ? NF4_BYTES_PER_PARAM : BF16_BYTES_PER_PARAM
  return {
    weightsGb: baseBytes * paramsB,
    adapterGb: BF16_BYTES_PER_PARAM * adapterB,
    gradientsGb: GRAD_BYTES_PER_PARAM * adapterB,
    optimizerGb: ADAMW_BYTES_PER_PARAM * adapterB,
    activationsGb: activationsGb(paramsB),
    ...(rolloutGb != null && { rolloutGb }),
  }
}

function sumParts(parts: TrainMemoryParts): number {
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

/** ratio = required / capacity: ≤ 0.8 fits · ≤ 1.0 tight · else won't fit (C2 boundaries). */
export function trainVerdict(requiredGb: number, capacityGb: number): TrainVerdict {
  const ratio = requiredGb / capacityGb
  if (ratio <= 0.8) return 'fits'
  if (ratio <= 1.0) return 'tight'
  return 'wont-fit'
}

/** capacityGb = count × vramGb (FSDP/ZeRO-3 sharding — see header). */
export function assessTrainMethod(
  method: TrainMethod,
  paramsB: number,
  capacityGb: number,
  recipe: TrainRecipe = 'sft',
): MethodAssessment {
  const parts = trainMemoryParts(method, paramsB, recipe)
  const requiredGb = sumParts(parts)
  return { method, requiredGb, verdict: trainVerdict(requiredGb, capacityGb), parts }
}

/** All three methods in TRAIN_METHODS display order — the UI always renders all rows. */
export function assessTrainMethods(
  paramsB: number,
  capacityGb: number,
  recipe: TrainRecipe = 'sft',
): MethodAssessment[] {
  return TRAIN_METHODS.map((method) => assessTrainMethod(method, paramsB, capacityGb, recipe))
}

/** Required VRAM for a method × recipe without a capacity/verdict — the honest way to
 *  ask "how much does this need?" (avoids passing a placeholder capacity just to read GB). */
export function trainRequiredGb(
  method: TrainMethod,
  paramsB: number,
  recipe: TrainRecipe = 'sft',
): number {
  return sumParts(trainMemoryParts(method, paramsB, recipe))
}

export interface TrainConfig {
  count: number
  slug: string
  name: string
  vramGb: number
}

/**
 * Smallest curated **rentable** GPU config (count × profile) whose aggregate capacity
 * covers `requiredGb`: fewest GPUs first, then smallest card. Apple/Mac profiles are
 * excluded — a datacenter/consumer config is universally rentable, comparable, and the
 * realistic target for a training suggestion (Mac unified-memory training is a niche the
 * user selects explicitly as their own hardware, not something to recommend). Null =
 * beyond 8× the largest curated card.
 */
export function smallestTrainConfig(
  requiredGb: number,
  gpus: readonly { slug: string; name?: string; vramGb: number; kind?: string }[],
): TrainConfig | null {
  const byVram = gpus.filter((g) => g.kind !== 'mac').sort((a, b) => a.vramGb - b.vramGb)
  for (const count of [1, 2, 4, 8]) {
    for (const g of byVram) {
      if (requiredGb <= count * g.vramGb) {
        return { count, slug: g.slug, name: g.name ?? g.slug, vramGb: g.vramGb }
      }
    }
  }
  return null
}

export interface GpuTrainEcon {
  /** Peak dense bf16 tensor TFLOPS. */
  tflopsBf16: number
  /** Typical marketplace rental rate (editorial estimate). */
  usdPerHour: number
}

/**
 * Training economics per hardware-profile slug. Mac profiles are null: MLX training is
 * viable (the fit math still applies to unified memory) but there is no comparable
 * rental market or MFU story — the UI shows "— (local hardware)".
 */
export const GPU_TRAIN_ECON: Record<string, GpuTrainEcon | null> = {
  rtx3060: { tflopsBf16: 25, usdPerHour: 0.1 },
  rtx4070: { tflopsBf16: 80, usdPerHour: 0.2 },
  rtx3090: { tflopsBf16: 71, usdPerHour: 0.25 },
  rtx4090: { tflopsBf16: 165, usdPerHour: 0.4 },
  rtx5090: { tflopsBf16: 210, usdPerHour: 0.7 },
  m4pro: null,
  m3max: null,
  m3ultra: null,
  a100: { tflopsBf16: 312, usdPerHour: 1.5 },
  h100: { tflopsBf16: 990, usdPerHour: 2.5 },
  h200: { tflopsBf16: 990, usdPerHour: 3.5 },
  b200: { tflopsBf16: 2250, usdPerHour: 5.5 },
}

/** tokens = samples × TOKENS_PER_SAMPLE × TRAIN_EPOCHS. */
export const DATASET_PRESETS = [
  { id: '1k', label: '~1k samples', samples: 1_000, tokens: 3_072_000 },
  { id: '10k', label: '~10k samples', samples: 10_000, tokens: 30_720_000 },
  { id: '100k', label: '~100k samples', samples: 100_000, tokens: 307_200_000 },
  { id: '1m', label: '~1M samples', samples: 1_000_000, tokens: 3_072_000_000 },
] as const
export type DatasetPresetId = (typeof DATASET_PRESETS)[number]['id']

export interface TrainCost {
  /** Count-independent total compute; wall-clock = gpuHours / gpu count. */
  gpuHours: number
  usdPerHour: number
  tokens: number
  usd: number
}

/**
 * flops = 6e9 × effParamsB × tokens × recipe multiplier (effParams = MoE active params,
 * else total); gpuHours = flops / (tflops × 1e12 × MFU × 3600); usd = gpuHours × $/hr.
 * Null when the GPU has no econ row (Mac, unknown slug).
 */
export function estimateTrainCost(
  effParamsB: number,
  tokens: number,
  gpuSlug: string,
  recipe: TrainRecipe = 'sft',
): TrainCost | null {
  const econ = GPU_TRAIN_ECON[gpuSlug]
  if (!econ) return null
  const flops =
    TRAIN_FLOPS_PER_PARAM_TOKEN * effParamsB * 1e9 * tokens * RECIPE_COST_MULTIPLIER[recipe]
  const gpuHours = flops / (econ.tflopsBf16 * 1e12 * TRAIN_MFU * 3600)
  return { gpuHours, usdPerHour: econ.usdPerHour, tokens, usd: gpuHours * econ.usdPerHour }
}
