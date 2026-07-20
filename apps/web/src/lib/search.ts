import { z } from 'zod'

/**
 * URL search-param conventions (contract C4): every param is optional-with-fallback —
 * `.default()` covers absence, `.catch()` covers invalid values, so bad URLs degrade to
 * defaults instead of throwing. Plain Zod v4 schemas plug straight into validateSearch
 * via Standard Schema (the @tanstack/zod-adapter would drag in a second zod major and
 * collapse search typing — deliberately not used).
 */

export const openFilterParam = z.enum(['all', 'open', 'closed']).default('all').catch('all')

export const textQueryParam = z.string().max(80).default('').catch('')

export const orgParam = z.string().max(60).default('all').catch('all')

/** Sort param constrained to a route's sortable keys (with optional `-` prefix, C4). */
export function sortParam(keys: readonly string[], def: string) {
  const re = new RegExp(`^-?(${keys.join('|')})$`)
  return z.string().regex(re).default(def).catch(def)
}

/**
 * Rankings sort keys: the fixed columns (name/params/ctx/index) plus ANY kebab-case
 * benchmark slug — the catalog is data-driven and count-varying (D18), so this can't be a
 * static enum. `selectRankings`'s sort switch already degrades an unrecognized key via
 * `m.bench[key] ?? -1e9`, so accepting any slug-shaped string here is safe; a slug that
 * doesn't exist in the current catalog just sorts everything to the bottom.
 */
export const RANKINGS_SORT_KEYS = ['name', 'params', 'ctx', 'index', '[a-z][a-z0-9-]*'] as const

/**
 * Ordered candidate benchmarks for the default `/rankings` columns. Real-world coverage is
 * heterogeneous and era-split — the older majority reports MMLU/GSM8K/HumanEval while the
 * current frontier reports GPQA/AIME/SWE-bench/HLE — so a single "best per category" pick
 * leaves flagship rows empty. This spans both baskets; `resolveRankingsColumns` keeps only
 * the candidates that clear a coverage floor in the live catalog, so near-empty columns
 * (arena 13, tau-bench 9, mmmu 46 in the current data) never ship as walls of em-dashes.
 * Category subpages (`/rankings/$category`) show that category's benchmarks by coverage.
 */
export const CORE_RANKINGS_CANDIDATES = [
  'mmlu', // knowledge (classic)
  'gpqa', // reasoning (modern)
  'hle', // reasoning (frontier)
  'math', // math (classic)
  'aime', // math (modern)
  'humaneval', // coding (classic)
  'livecodebench', // coding (modern)
  'swe-bench', // coding (agentic)
  'mmmu', // vision
] as const

/** Short column labels for the rankings CORE candidates (fallback: the benchmark's name). */
export const CORE_RANKINGS_LABELS: Record<string, string> = {
  mmlu: 'MMLU',
  gpqa: 'GPQA',
  hle: 'HLE',
  math: 'MATH',
  aime: 'AIME',
  humaneval: 'HEval',
  livecodebench: 'LCB',
  'swe-bench': 'SWE',
  mmmu: 'MMMU',
}

/** A benchmark needs at least this many scored models to earn a default/category column. */
export const RANKINGS_COLUMN_MIN_COVERAGE = 20

/** Compact capability codes in URLs (C4 `?caps=fc,tools`) → shared CapabilityKey. */
export const CAP_CODES = {
  reason: 'reasoning',
  vision: 'vision',
  fc: 'functionCalling',
  tools: 'toolUse',
  agent: 'agentic',
} as const

export const sizeParam = z
  .enum(['any', 's', 'm', 'l', 'xl', 'undisclosed'])
  .default('any')
  .catch('any')

export const gpuParam = z.string().max(40).default('none').catch('none')

export const capsParam = z
  .string()
  .regex(/^(reason|vision|fc|tools|agent)(,(reason|vision|fc|tools|agent))*$/)
  .default('')
  .catch('')

export const explorerSortParam = z
  .enum(['index', 'date', 'params', 'cheap'])
  .default('index')
  .catch('index')

export const explorerSearchSchema = z.object({
  q: textQueryParam,
  open: openFilterParam,
  org: orgParam,
  size: sizeParam,
  gpu: gpuParam,
  caps: capsParam,
  sort: explorerSortParam,
})

export const EXPLORER_SEARCH_DEFAULTS = {
  q: '',
  open: 'all',
  org: 'all',
  size: 'any',
  gpu: 'none',
  caps: '',
  sort: 'index',
} as const

export type ExplorerSearch = z.infer<typeof explorerSearchSchema>

/** Compact task-axis codes in URLs (C4 `?task=code,docs`) → shared FinetuneAxis. */
export const TASK_CODES = {
  agents: 'agents',
  reason: 'reasoning',
  code: 'coding',
  math: 'math',
  if: 'if', // derived instruction-following axis (IFEval, C8)
  know: 'knowledge',
  docs: 'docs', // derived document-understanding axis (C8)
  vision: 'vision',
  chat: 'human-preference', // chat quality (arena/preference scores)
} as const
export type TaskCode = keyof typeof TASK_CODES

const TASK_CODE_RE =
  /^(agents|reason|code|math|if|know|docs|vision|chat)(,(agents|reason|code|math|if|know|docs|vision|chat))*$/

export const finetuneSearchSchema = z.object({
  q: textQueryParam,
  task: z.string().regex(TASK_CODE_RE).default('').catch(''),
  tgpu: z.string().max(40).default('rtx4090').catch('rtx4090'),
  /** GPU count. A NUMBER, not a numeric-string enum: the router's search parser turns
   *  numeric-looking params into JS numbers on read and JSON-quotes strings that look
   *  numeric on write (`tn=%224%22`) — numbers round-trip clean (`tn=4`, like `vram=24`). */
  tn: z
    .union([z.literal(1), z.literal(2), z.literal(4), z.literal(8)])
    .default(1)
    .catch(1),
  /** 'same' (= training GPU) | 'none' (API/cloud, skip check) | a gpu slug. */
  igpu: z.string().max(40).default('same').catch('same'),
  method: z.enum(['any', 'qlora', 'lora', 'full']).default('any').catch('any'),
  /** Post-training recipe: SFT, DPO (preference), or GRPO-style RL. */
  recipe: z.enum(['sft', 'dpo', 'rl']).default('sft').catch('sft'),
  data: z.enum(['1k', '10k', '100k', '1m']).default('10k').catch('10k'),
  /** Budget cap in USD — numeric for the same round-trip reason as `tn`. */
  budget: z
    .union([z.literal('any'), z.literal(50), z.literal(200), z.literal(1000), z.literal(5000)])
    .default('any')
    .catch('any'),
  lic: z.enum(['any', 'permissive', 'conditional', 'research']).default('any').catch('any'),
  size: sizeParam,
  /** Minimum context window in K tokens (numeric for clean round-trips, like tn). */
  ctx: z
    .union([z.literal('any'), z.literal(32), z.literal(128), z.literal(1000)])
    .default('any')
    .catch('any'),
  /** 'dense' = anything non-MoE (dense/SSM/hybrid); 'moe' = MoE only. */
  arch: z.enum(['any', 'dense', 'moe']).default('any').catch('any'),
  org: orgParam,
  mod: z
    .string()
    .regex(/^(vision|audio|video)(,(vision|audio|video))*$/)
    .default('')
    .catch(''),
  /** 'fits' hides models too big for the chosen hardware; 'all' shows them as won't-fit. */
  show: z.enum(['fits', 'all']).default('fits').catch('fits'),
  sort: z.enum(['best', 'cost', 'vram', 'params', 'date']).default('best').catch('best'),
})

export const FINETUNE_SEARCH_DEFAULTS = {
  q: '',
  task: '',
  tgpu: 'rtx4090',
  tn: 1,
  igpu: 'same',
  method: 'any',
  recipe: 'sft',
  data: '10k',
  budget: 'any',
  lic: 'any',
  size: 'any',
  ctx: 'any',
  arch: 'any',
  org: 'all',
  mod: '',
  show: 'fits',
  sort: 'best',
} as const

export type FinetuneSearch = z.infer<typeof finetuneSearchSchema>

export const hardwareSearchSchema = z.object({
  mode: z.enum(['gpu', 'model']).default('gpu').catch('gpu'),
  gpu: z.string().max(40).default('rtx4090').catch('rtx4090'),
  vram: z.number().positive().max(2048).default(24).catch(24),
  show: z.enum(['all', 'fits']).default('all').catch('all'),
  model: z.string().max(60).default('llama-3-3-70b').catch('llama-3-3-70b'),
})

export const HARDWARE_SEARCH_DEFAULTS = {
  mode: 'gpu',
  gpu: 'rtx4090',
  vram: 24,
  show: 'all',
  model: 'llama-3-3-70b',
} as const

export type HardwareSearch = z.infer<typeof hardwareSearchSchema>
