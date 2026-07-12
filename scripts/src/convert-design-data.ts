import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type ArchClass,
  BENCHMARK_CATEGORIES,
  type Benchmark,
  type BenchmarkCategory,
  benchmarkSchema,
  type Family,
  familySchema,
  type GpuKind,
  hardwareProfileSchema,
  type Model,
  modelSchema,
  type Organization,
  organizationSchema,
} from '@rankedmodel/shared'
import { toCsv } from './lib/csv'

/**
 * One-off converter (plan commit 8): design prototype dataset → curated /data tree.
 * Kept for provenance/reproducibility; after this commit /data is hand-curated and this
 * script is never run again. Deterministic: same input → byte-identical output.
 */

// ---------- design-data types (shape of llm-data.js) ----------
interface DesignBenchmark {
  id: string
  name: string
  cat: string
  unit: string
  max: number
  min: number
  desc: string
}
interface DesignGpu {
  id: string
  name: string
  vram: number
  kind: string
}
interface DesignModel {
  id: string
  name: string
  org: string
  family: string
  date: string
  params: number | null
  active: number | null
  ctx: number
  arch: string
  license: string
  open: boolean
  modal: string[]
  caps: Partial<Record<'fc' | 'reason' | 'code' | 'vision' | 'tools' | 'agent', 0 | 1>>
  langs?: number
  quants?: string[]
  vramQ4?: number | null
  vramFp16?: number | null
  tps4090?: number | null
  tpsNote?: string
  price: { i: number; o: number } | null
  api?: 0 | 1
  hf?: string | null
  gh?: string | null
  docs?: string | null
  bench: Record<string, number | null>
  note: string
}
interface DesignData {
  BENCHMARKS: DesignBenchmark[]
  MODELS: DesignModel[]
  GPUS: DesignGpu[]
  ASOF: string
}

// ---------- mappings ----------
const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const ORG_TYPES: Record<string, Organization['type']> = {
  openai: 'lab',
  anthropic: 'lab',
  deepseek: 'lab',
  'mistral-ai': 'lab',
  xai: 'lab',
  'zhipu-ai': 'lab',
  'moonshot-ai': 'lab',
  minimax: 'lab',
  stepfun: 'lab',
  ai2: 'lab',
  'nous-research': 'community',
  'hugging-face': 'community',
}

const CATEGORY_BY_LABEL: Record<string, BenchmarkCategory> = Object.fromEntries(
  BENCHMARK_CATEGORIES.map((c) => [c, c]),
)
CATEGORY_BY_LABEL['Human preference'] = 'human-preference'
CATEGORY_BY_LABEL.Knowledge = 'knowledge'
CATEGORY_BY_LABEL.Reasoning = 'reasoning'
CATEGORY_BY_LABEL.Coding = 'coding'
CATEGORY_BY_LABEL.Math = 'math'
CATEGORY_BY_LABEL.Vision = 'vision'
CATEGORY_BY_LABEL.Agents = 'agents'

function archClassOf(arch: string): ArchClass {
  const a = arch.toLowerCase()
  if (a.includes('mamba') || a.includes('hybrid')) return 'hybrid'
  if (a.includes('moe')) return 'moe'
  return 'dense'
}

const GPU_KIND: Record<string, GpuKind> = {
  consumer: 'consumer',
  mac: 'mac',
  datacenter: 'datacenter',
}

// ---------- conversion ----------
export async function convertDesignData(sourceJs: string, outRoot: string): Promise<void> {
  const code = await readFile(sourceJs, 'utf8')
  // llm-data.js assigns to window.LLMDATA via an IIFE — evaluate with a stub window.
  const win: { LLMDATA?: DesignData } = {}
  new Function('window', code)(win)
  const data = win.LLMDATA
  if (!data) throw new Error('llm-data.js did not set window.LLMDATA')

  await rm(outRoot, { recursive: true, force: true })
  const writeJson = async (rel: string, value: unknown) => {
    const path = join(outRoot, rel)
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
  }
  const writeText = async (rel: string, text: string) => {
    const path = join(outRoot, rel)
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, text.endsWith('\n') ? text : `${text}\n`)
  }

  // organizations
  const orgNames = [...new Set(data.MODELS.map((m) => m.org))].sort()
  const orgs: Organization[] = orgNames.map((name) => {
    const slug = slugify(name)
    return organizationSchema.parse({ slug, name, type: ORG_TYPES[slug] ?? 'company' })
  })
  for (const o of orgs) await writeJson(`organizations/${o.slug}.json`, o)

  // families (unique per (org, family) — family names are globally unique in this dataset)
  const famKeys = new Map<string, Family>()
  for (const m of data.MODELS) {
    const slug = slugify(m.family)
    if (!famKeys.has(slug)) {
      famKeys.set(slug, familySchema.parse({ slug, name: m.family, orgSlug: slugify(m.org) }))
    }
  }
  const families = [...famKeys.values()].sort((a, b) => a.slug.localeCompare(b.slug))
  for (const f of families) await writeJson(`families/${f.slug}.json`, f)

  // predecessors: within each family, stable-sort by (date, original index) — this is
  // exactly the design prototype's `sort by date` over insertion order, so lineage-based
  // movers (C1) reproduce the design.
  const byFamily = new Map<string, DesignModel[]>()
  data.MODELS.forEach((m) => {
    const k = slugify(m.family)
    if (!byFamily.has(k)) byFamily.set(k, [])
    byFamily.get(k)?.push(m)
  })
  const predecessorOf = new Map<string, string | null>()
  for (const group of byFamily.values()) {
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date))
    sorted.forEach((m, i) => {
      // Nearest strictly-older family member: same-day releases are size variants
      // (Qwen3 235B/32B/8B, Llama 3.1 405B/8B, ...), not successions.
      let pred: string | null = null
      for (let j = i - 1; j >= 0; j--) {
        const candidate = sorted[j] as DesignModel
        if (candidate.date < m.date) {
          pred = candidate.id
          break
        }
      }
      predecessorOf.set(m.id, pred)
    })
  }

  // models
  const models: Model[] = data.MODELS.map((m) => {
    const caps = {
      reasoning: !!m.caps.reason,
      coding: !!m.caps.code,
      vision: !!m.caps.vision,
      functionCalling: !!m.caps.fc,
      toolUse: !!m.caps.tools,
      agentic: !!m.caps.agent,
    }
    const links: Model['links'] = {}
    if (m.hf) links.hf = m.hf
    if (m.gh) links.gh = m.gh
    if (m.docs) links.docs = m.docs
    return modelSchema.parse({
      slug: m.id,
      name: m.name,
      orgSlug: slugify(m.org),
      familySlug: slugify(m.family),
      releaseDate: m.date,
      status: 'released',
      predecessor: predecessorOf.get(m.id) ?? null,
      openness: m.open ? 'open-weights' : 'closed',
      license: m.license,
      paramsB: m.params,
      activeParamsB: m.active,
      archClass: archClassOf(m.arch),
      archDisplay: m.arch,
      ctxK: m.ctx,
      modalities: m.modal,
      langCount: m.langs ?? null,
      capabilities: caps,
      apiAvailable: !!m.api,
      price: m.price ? { input: m.price.i, output: m.price.o } : null,
      links,
      note: m.note,
      quants: m.quants ?? [],
      vramQ4Gb: m.vramQ4 ?? null,
      vramFp16Gb: m.vramFp16 ?? null,
      tps4090: m.tps4090 ?? null,
      tpsNote: m.tpsNote ?? null,
    })
  })
  for (const m of models) await writeJson(`models/${m.orgSlug}/${m.slug}.json`, m)

  // benchmarks (design min/max are the curated normalization bounds, D2)
  const benchmarks: Benchmark[] = data.BENCHMARKS.map((b) => {
    const category = CATEGORY_BY_LABEL[b.cat]
    if (!category) throw new Error(`unknown benchmark category label '${b.cat}'`)
    return benchmarkSchema.parse({
      slug: b.id,
      name: b.name,
      category,
      unit: b.unit,
      description: b.desc,
      normMin: b.min,
      normMax: b.max,
      higherIsBetter: true,
    })
  })
  for (const b of benchmarks) await writeJson(`benchmarks/${b.slug}.json`, b)

  // results: one CSV per benchmark, rows in MODELS file order (deterministic)
  const header = ['model_slug', 'score', 'source', 'source_url', 'evaluated_at', 'notes']
  for (const b of data.BENCHMARKS) {
    const rows = data.MODELS.filter((m) => m.bench[b.id] != null).map((m) => [
      m.id,
      m.bench[b.id] as number,
      'curated',
      '',
      '',
      '',
    ])
    await writeText(`results/${b.id}.csv`, toCsv(header, rows))
  }

  // hardware
  const gpus = data.GPUS.map((g) =>
    hardwareProfileSchema.parse({
      slug: g.id,
      name: g.name,
      kind: GPU_KIND[g.kind],
      vramGb: g.vram,
    }),
  )
  await writeJson('hardware/profiles.json', gpus)

  // pricing: first-party provider = org slug; effective_date = release date
  await writeText(
    'pricing/api-pricing.csv',
    toCsv(
      ['model_slug', 'provider', 'input_per_mtok', 'output_per_mtok', 'effective_date'],
      data.MODELS.filter((m) => m.price).map((m) => [
        m.id,
        slugify(m.org),
        (m.price as { i: number }).i,
        (m.price as { o: number }).o,
        m.date,
      ]),
    ),
  )

  // throughput: measured RTX 4090 numbers are Q4 + llama.cpp per the design's caption
  await writeText(
    'throughput/estimates.csv',
    toCsv(
      [
        'model_slug',
        'quant_method',
        'hardware_slug',
        'framework',
        'tokens_per_sec',
        'context_tested',
        'source',
        'source_url',
      ],
      data.MODELS.filter((m) => m.tps4090 != null).map((m) => [
        m.id,
        'GGUF Q4',
        'rtx4090',
        'llama.cpp',
        m.tps4090 as number,
        '',
        'design-prototype',
        '',
      ]),
    ),
  )

  // meta
  const asOfIso = new Date(`${data.ASOF} UTC`).toISOString().slice(0, 10)
  await writeJson('meta.json', { asOf: data.ASOF, asOfIso })

  console.log(
    `converted: ${models.length} models · ${orgs.length} orgs · ${families.length} families · ${benchmarks.length} benchmarks · ${gpus.length} gpus (source models: ${data.MODELS.length})`,
  )
}

if (import.meta.main) {
  const source = process.argv[2] ?? 'docs/design-handoff/project/data/llm-data.js'
  const out = process.argv[3] ?? 'data'
  await convertDesignData(source, out)
}
