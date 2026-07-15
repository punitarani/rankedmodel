import { z } from 'zod'
import { BENCHMARK_CATEGORIES, GPU_KINDS, MODEL_STATUS, OPENNESS, RESULT_SOURCES } from './enums'
import { isoDateSchema, slugSchema } from './schema/common'
import { capabilitiesSchema, modelLinksSchema, priceSchema } from './schema/model'

/**
 * Catalog snapshot (contract C3) — the three-way contract: the publish pipeline writes
 * it to KV (`catalog:v{N}`, immutable), `getCatalog` parses it, every screen's selectors
 * consume it. A superset of the design prototype's `LLMDATA`, with `index`/`rank`/
 * `categoryIdx` precomputed at publish time (arch principle 3). Bounds ship so bar
 * widths stay client-side math.
 */

export const snapshotBenchmarkSchema = z.object({
  slug: slugSchema,
  name: z.string(),
  category: z.enum(BENCHMARK_CATEGORIES),
  unit: z.string(),
  description: z.string(),
  normMin: z.number(),
  normMax: z.number(),
})

export const snapshotGpuSchema = z.object({
  slug: slugSchema,
  name: z.string(),
  kind: z.enum(GPU_KINDS),
  vramGb: z.number(),
})

export const snapshotModelSchema = z.object({
  slug: slugSchema,
  name: z.string(),
  org: z.string(),
  orgSlug: slugSchema,
  family: z.string(),
  familySlug: slugSchema,
  date: isoDateSchema,
  status: z.enum(MODEL_STATUS),
  openness: z.enum(OPENNESS),
  /** Design-parity convenience: openness !== 'closed'. */
  open: z.boolean(),
  predecessor: slugSchema.nullable(),
  params: z.number().nullable(),
  active: z.number().nullable(),
  ctxK: z.number(),
  arch: z.string(),
  archClass: z.string(),
  license: z.string(),
  langCount: z.number().nullable(),
  modalities: z.array(z.string()),
  caps: capabilitiesSchema,
  apiAvailable: z.boolean(),
  /** benchSlug → headline raw score (null = not evaluated). */
  bench: z.record(z.string(), z.number().nullable()),
  /** benchSlug → provenance of the headline score (D8). */
  benchSources: z.record(z.string(), z.enum(RESULT_SOURCES)).default({}),
  price: priceSchema.nullable(),
  vramQ4: z.number().nullable(),
  vramFp16: z.number().nullable(),
  quants: z.array(z.string()),
  tps4090: z.number().nullable(),
  tpsNote: z.string().nullable(),
  /** Reasoning-effort/compute-tier label (e.g. "High", "Max"); null = no such axis. */
  effortLabel: z.string().nullable(),
  isDefaultConfig: z.boolean(),
  isBestConfig: z.boolean(),
  links: modelLinksSchema,
  note: z.string(),
  // publish-time derived (C1/D21)
  /** Frontier Elo rating (D21): Bradley-Terry over pairwise benchmark battles; can be negative. */
  index: z.number(),
  /** Overall rank among rank-eligible models (D20); null when the model is unrated. */
  rank: z.number().int().positive().nullable(),
  /** Has enough benchmark coverage to earn a rank (D20). */
  ranked: z.boolean().default(true),
  categoryIdx: z.record(z.enum(BENCHMARK_CATEGORIES), z.number().nullable()),
})

export const catalogSnapshotSchema = z.object({
  version: z.number().int().positive(),
  asOf: z.string(),
  asOfIso: isoDateSchema,
  benchmarks: z.array(snapshotBenchmarkSchema),
  gpus: z.array(snapshotGpuSchema),
  models: z.array(snapshotModelSchema),
})

export type SnapshotBenchmark = z.infer<typeof snapshotBenchmarkSchema>
export type SnapshotGpu = z.infer<typeof snapshotGpuSchema>
export type SnapshotModel = z.infer<typeof snapshotModelSchema>
export type CatalogSnapshot = z.infer<typeof catalogSnapshotSchema>

/** KV key for an immutable snapshot version. */
export const catalogKey = (version: number): string => `catalog:v${version}`
