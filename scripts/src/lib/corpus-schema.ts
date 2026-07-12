import type { Dirent } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  ARCH_CLASSES,
  BENCHMARK_CATEGORIES,
  capabilitiesSchema,
  type HardwareProfile,
  hardwareProfileSchema,
  isoDateSchema,
  MODALITIES,
  MODEL_STATUS,
  OPENNESS,
  RESULT_SOURCES,
  slugSchema,
} from '@rankedmodel/shared'
import { z } from 'zod'

/**
 * The research-corpus contract: the intermediate, provenance-carrying format the research
 * pipeline emits and the `generate-dataset` generator consumes. Distinct from the shipped
 * `/data` schemas — agents supply display names, per-field provenance and multi-source
 * benchmark rows; the generator derives slugs, lineage, and the per-benchmark CSV split.
 *
 * Every benchmark row REQUIRES a resolvable `sourceUrl` (z.url) — the citation-required rule
 * is enforced at this boundary, so an unsourceable number cannot enter the corpus.
 */

export const corpusResultSchema = z.object({
  benchmarkSlug: slugSchema,
  score: z.number(),
  source: z.enum(RESULT_SOURCES),
  sourceUrl: z.url(),
  evaluatedAt: isoDateSchema.optional(),
  notes: z.string().optional(),
})

export const corpusPriceSchema = z.object({
  input: z.number().positive(),
  output: z.number().positive(),
  provider: z.string().min(1).optional(),
})

export const corpusModelSchema = z.object({
  /** Optional explicit slug; the generator derives one from `name` (collision-safe) otherwise. */
  slug: slugSchema.optional(),
  name: z.string().min(1),
  /** Organization display name; `orgSlug` is derived unless given. */
  org: z.string().min(1),
  orgSlug: slugSchema.optional(),
  /** Family display name; `familySlug` is derived (org-prefixed on collision) unless given. */
  family: z.string().min(1),
  familySlug: slugSchema.optional(),
  releaseDate: isoDateSchema,
  status: z.enum(MODEL_STATUS).default('released'),
  openness: z.enum(OPENNESS),
  license: z.string().min(1),
  paramsB: z.number().positive().nullable(),
  activeParamsB: z.number().positive().nullable(),
  archClass: z.enum(ARCH_CLASSES),
  archDisplay: z.string().min(1),
  /** Context window in K tokens (D15): 128 = 128K, 2000 = 2M. */
  ctxK: z.number().positive(),
  modalities: z.array(z.enum(MODALITIES)).min(1),
  langCount: z.number().int().positive().nullable(),
  /** The generator reconciles `capabilities.vision` to `modalities.includes('vision')`. */
  capabilities: capabilitiesSchema,
  apiAvailable: z.boolean(),
  price: corpusPriceSchema.nullable(),
  links: z
    .object({
      hf: z.string().min(1).optional(),
      gh: z.string().min(1).optional(),
      docs: z.string().min(1).optional(),
    })
    .default({}),
  note: z.string().min(1),
  quants: z.array(z.string().min(1)).default([]),
  vramQ4Gb: z.number().positive().nullable(),
  vramFp16Gb: z.number().positive().nullable(),
  tps4090: z.number().positive().nullable(),
  tpsNote: z.string().nullable().default(null),
  /** Per-field provenance (audit only; not shipped to /data). e.g. { paramsB: url, releaseDate: url }. */
  specSources: z.record(z.string(), z.string()).optional(),
  /** Alternate names/ids this model was found under (dedup audit; not shipped). */
  aliases: z.array(z.string()).optional(),
  results: z.array(corpusResultSchema).default([]),
})

export const corpusBenchmarkSchema = z
  .object({
    slug: slugSchema,
    name: z.string().min(1),
    category: z.enum(BENCHMARK_CATEGORIES),
    unit: z.string().min(1),
    description: z.string().min(1),
    normMin: z.number(),
    normMax: z.number(),
    higherIsBetter: z.boolean().default(true),
    methodologyUrl: z.url().optional(),
  })
  .refine((b) => b.normMax > b.normMin, {
    message: 'normMax must be greater than normMin',
    path: ['normMax'],
  })

export const corpusOrgSchema = z.object({
  name: z.string().min(1),
  slug: slugSchema.optional(),
  type: z.enum(['lab', 'company', 'community']).optional(),
  country: z.string().min(2).optional(),
  url: z.url().optional(),
  description: z.string().optional(),
})

export const corpusMetaSchema = z.object({
  /** Human as-of date, e.g. "July 2026". `asOfIso` is derived by the generator. */
  asOf: z.string().min(1),
})

export type CorpusModel = z.infer<typeof corpusModelSchema>
export type CorpusBenchmark = z.infer<typeof corpusBenchmarkSchema>
export type CorpusOrg = z.infer<typeof corpusOrgSchema>
export type CorpusMeta = z.infer<typeof corpusMetaSchema>

export interface Corpus {
  models: CorpusModel[]
  benchmarks: CorpusBenchmark[]
  organizations: CorpusOrg[]
  hardware: HardwareProfile[]
  meta: CorpusMeta | null
  errors: string[]
}

async function walkJson(dir: string): Promise<string[]> {
  const out: string[] = []
  const entries: Dirent[] = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const e of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walkJson(p)))
    else if (e.isFile() && e.name.endsWith('.json')) out.push(p)
  }
  return out
}

/** Load and Zod-parse the whole corpus, collecting errors instead of throwing (like loadDataset). */
export async function loadCorpus(root: string): Promise<Corpus> {
  const errors: string[] = []
  const corpus: Corpus = {
    models: [],
    benchmarks: [],
    organizations: [],
    hardware: [],
    meta: null,
    errors,
  }

  const readJson = async (rel: string): Promise<unknown | undefined> => {
    try {
      return JSON.parse(await readFile(join(root, rel), 'utf8'))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        errors.push(`${rel}: ${(e as Error).message}`)
      }
      return undefined
    }
  }

  // models/**/*.json
  for (const abs of await walkJson(join(root, 'models'))) {
    const rel = abs.slice(root.length + 1)
    let json: unknown
    try {
      json = JSON.parse(await readFile(abs, 'utf8'))
    } catch (e) {
      errors.push(`${rel}: invalid JSON — ${(e as Error).message}`)
      continue
    }
    const res = corpusModelSchema.safeParse(json)
    if (res.success) corpus.models.push(res.data)
    else {
      for (const issue of res.error.issues) {
        errors.push(`${rel}: ${issue.path.join('.') || '(root)'} — ${issue.message}`)
      }
    }
  }

  const benchesJson = await readJson('benchmarks.json')
  if (benchesJson !== undefined) {
    const res = corpusBenchmarkSchema.array().safeParse(benchesJson)
    if (res.success) corpus.benchmarks = res.data
    else
      for (const issue of res.error.issues)
        errors.push(`benchmarks.json: ${issue.path.join('.')} — ${issue.message}`)
  }

  const orgsJson = await readJson('organizations.json')
  if (orgsJson !== undefined) {
    const res = corpusOrgSchema.array().safeParse(orgsJson)
    if (res.success) corpus.organizations = res.data
    else
      for (const issue of res.error.issues)
        errors.push(`organizations.json: ${issue.path.join('.')} — ${issue.message}`)
  }

  const hwJson = await readJson('hardware.json')
  if (hwJson !== undefined) {
    const res = hardwareProfileSchema.array().safeParse(hwJson)
    if (res.success) corpus.hardware = res.data
    else
      for (const issue of res.error.issues)
        errors.push(`hardware.json: ${issue.path.join('.')} — ${issue.message}`)
  }

  const metaJson = await readJson('meta.json')
  if (metaJson !== undefined) {
    const res = corpusMetaSchema.safeParse(metaJson)
    if (res.success) corpus.meta = res.data
    else
      for (const issue of res.error.issues)
        errors.push(`meta.json: ${issue.path.join('.')} — ${issue.message}`)
  }

  return corpus
}
