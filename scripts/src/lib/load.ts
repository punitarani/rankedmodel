import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type Benchmark,
  benchmarkSchema,
  type DatasetMeta,
  datasetMetaSchema,
  type Family,
  familySchema,
  type HardwareProfile,
  hardwareProfileSchema,
  type Model,
  modelSchema,
  type Organization,
  organizationSchema,
  type PricingRow,
  pricingRowSchema,
  type ResultRow,
  resultRowSchema,
  type ThroughputRow,
  throughputRowSchema,
} from '@rankedmodel/shared'
import type { z } from 'zod'
import { parseCsv } from './csv'

/** The whole curated dataset, loaded and Zod-parsed. Collects errors instead of throwing. */
export interface Dataset {
  organizations: Organization[]
  families: Family[]
  models: Model[]
  /** modelDirOrg[slug] = the {org} directory a model file was found under. */
  modelDirOrg: Map<string, string>
  benchmarks: Benchmark[]
  /** results[benchmarkSlug] = parsed rows from data/results/{benchmarkSlug}.csv */
  results: Map<string, ResultRow[]>
  hardware: HardwareProfile[]
  pricing: PricingRow[]
  throughput: ThroughputRow[]
  meta: DatasetMeta | null
  errors: string[]
}

async function listDir(path: string): Promise<string[]> {
  try {
    return (await readdir(path)).sort()
  } catch {
    return []
  }
}

export async function loadDataset(root: string): Promise<Dataset> {
  const errors: string[] = []
  const ds: Dataset = {
    organizations: [],
    families: [],
    models: [],
    modelDirOrg: new Map(),
    benchmarks: [],
    results: new Map(),
    hardware: [],
    pricing: [],
    throughput: [],
    meta: null,
    errors,
  }

  const parseJsonFile = async <S extends z.ZodType>(
    rel: string,
    schema: S,
  ): Promise<z.output<S> | null> => {
    let raw: string
    try {
      raw = await readFile(join(root, rel), 'utf8')
    } catch {
      errors.push(`${rel}: file missing or unreadable`)
      return null
    }
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch (e) {
      errors.push(`${rel}: invalid JSON — ${(e as Error).message}`)
      return null
    }
    const res = schema.safeParse(json)
    if (!res.success) {
      for (const issue of res.error.issues) {
        errors.push(`${rel}: ${issue.path.join('.') || '(root)'} — ${issue.message}`)
      }
      return null
    }
    return res.data
  }

  const parseCsvFile = async <S extends z.ZodType>(
    rel: string,
    schema: S,
    coerce: (row: Record<string, string>) => unknown,
  ): Promise<z.output<S>[]> => {
    let raw: string
    try {
      raw = await readFile(join(root, rel), 'utf8')
    } catch {
      errors.push(`${rel}: file missing or unreadable`)
      return []
    }
    let rows: Record<string, string>[]
    try {
      rows = parseCsv(raw)
    } catch (e) {
      errors.push(`${rel}: ${(e as Error).message}`)
      return []
    }
    const out: z.output<S>[] = []
    rows.forEach((row, i) => {
      const res = schema.safeParse(coerce(row))
      if (res.success) out.push(res.data)
      else {
        for (const issue of res.error.issues) {
          errors.push(`${rel}: row ${i + 2} ${issue.path.join('.')} — ${issue.message}`)
        }
      }
    })
    return out
  }

  // organizations/*.json, families/*.json, benchmarks/*.json
  for (const f of await listDir(join(root, 'organizations'))) {
    const v = await parseJsonFile(`organizations/${f}`, organizationSchema)
    if (v) ds.organizations.push(v)
  }
  for (const f of await listDir(join(root, 'families'))) {
    const v = await parseJsonFile(`families/${f}`, familySchema)
    if (v) ds.families.push(v)
  }
  for (const f of await listDir(join(root, 'benchmarks'))) {
    const v = await parseJsonFile(`benchmarks/${f}`, benchmarkSchema)
    if (v) ds.benchmarks.push(v)
  }

  // models/{org}/*.json
  for (const orgDir of await listDir(join(root, 'models'))) {
    for (const f of await listDir(join(root, 'models', orgDir))) {
      const v = await parseJsonFile(`models/${orgDir}/${f}`, modelSchema)
      if (v) {
        ds.models.push(v)
        ds.modelDirOrg.set(v.slug, orgDir)
      }
    }
  }

  // results/{benchmark}.csv
  const num = (s: string | undefined) => (s == null || s === '' ? undefined : Number(s))
  const str = (s: string | undefined) => (s == null || s === '' ? undefined : s)
  for (const f of await listDir(join(root, 'results'))) {
    if (!f.endsWith('.csv')) continue
    const benchSlug = f.slice(0, -4)
    const rows = await parseCsvFile(`results/${f}`, resultRowSchema, (r) => ({
      modelSlug: r.model_slug,
      score: num(r.score),
      source: r.source,
      sourceUrl: str(r.source_url),
      evaluatedAt: str(r.evaluated_at),
      notes: str(r.notes),
    }))
    ds.results.set(benchSlug, rows)
  }

  // hardware/profiles.json (array)
  const hw = await parseJsonFile('hardware/profiles.json', hardwareProfileSchema.array())
  if (hw) ds.hardware = hw

  // pricing/api-pricing.csv
  ds.pricing = await parseCsvFile('pricing/api-pricing.csv', pricingRowSchema, (r) => ({
    modelSlug: r.model_slug,
    provider: r.provider,
    inputPerMtok: num(r.input_per_mtok),
    outputPerMtok: num(r.output_per_mtok),
    effectiveDate: str(r.effective_date),
  }))

  // throughput/estimates.csv
  ds.throughput = await parseCsvFile('throughput/estimates.csv', throughputRowSchema, (r) => ({
    modelSlug: r.model_slug,
    quantMethod: r.quant_method,
    hardwareSlug: r.hardware_slug,
    framework: r.framework,
    tokensPerSec: num(r.tokens_per_sec),
    contextTested: num(r.context_tested),
    source: str(r.source),
    sourceUrl: str(r.source_url),
  }))

  ds.meta = await parseJsonFile('meta.json', datasetMetaSchema)

  return ds
}
