import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type Benchmark,
  benchmarkSchema,
  type Family,
  familySchema,
  type HardwareProfile,
  type Model,
  modelSchema,
  type Organization,
  organizationSchema,
} from '@rankedmodel/shared'
import { type Corpus, type CorpusModel, loadCorpus } from './lib/corpus-schema'
import { toCsv } from './lib/csv'
import { validateData } from './validate'

/**
 * Corpus → /data generator (successor to convert-design-data.ts). Deterministic: the same
 * corpus produces byte-identical /data. Agents only gather + cite into the corpus; ALL
 * relational/global logic lives here — collision-safe slugs, global family lineage, the
 * per-benchmark CSV split (preserving each row's real source + source_url), pricing/throughput
 * derivation, and a self-validation gate so an invalid tree can never be written.
 *
 * Usage: bun scripts/src/generate-dataset.ts [corpusRoot=corpus] [outRoot=data]
 */

const RESULT_HEADER = ['model_slug', 'score', 'source', 'source_url', 'evaluated_at', 'notes']

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** A stable size token for slug disambiguation, e.g. 8 → "8b", 1.5 → "1-5b". */
const sizeToken = (paramsB: number | null): string | null =>
  paramsB == null ? null : `${slugify(String(paramsB))}b`

class GenerationError extends Error {}

type Row = (string | number)[]

interface Generated {
  organizations: Organization[]
  families: Family[]
  models: Model[]
  benchmarks: Benchmark[]
  hardware: HardwareProfile[]
  /** benchmarkSlug → CSV rows (already deterministically sorted). */
  results: Map<string, Row[]>
  pricing: Row[]
  throughput: Row[]
  asOf: string
  asOfIso: string
}

export function generate(corpus: Corpus): Generated {
  if (corpus.errors.length) {
    throw new GenerationError(
      `corpus has ${corpus.errors.length} validation error(s):\n  ${corpus.errors.slice(0, 40).join('\n  ')}`,
    )
  }
  if (!corpus.meta) throw new GenerationError('corpus/meta.json is missing or invalid')

  // Deterministic processing order: org, then explicit-or-derived slug, then name.
  const orderKey = (m: CorpusModel) =>
    `${m.orgSlug ?? slugify(m.org)} ${m.slug ?? slugify(m.name)} ${m.name}`
  const models = [...corpus.models].sort((a, b) => orderKey(a).localeCompare(orderKey(b)))

  // ---- Organizations: slug from corpus override or slugify(name); assert 1:1 name↔slug. ----
  const orgMetaByName = new Map(corpus.organizations.map((o) => [o.name, o]))
  const orgSlugByName = new Map<string, string>()
  const orgNameBySlug = new Map<string, string>()
  const orgUse = (name: string): string => {
    const existing = orgSlugByName.get(name)
    if (existing) return existing
    const slug = orgMetaByName.get(name)?.slug ?? slugify(name)
    const clash = orgNameBySlug.get(slug)
    if (clash && clash !== name) {
      throw new GenerationError(
        `organization slug collision: '${name}' and '${clash}' both map to '${slug}' — add an explicit slug in organizations.json`,
      )
    }
    orgSlugByName.set(name, slug)
    orgNameBySlug.set(slug, name)
    return slug
  }
  for (const m of models) orgUse(m.org)
  const organizations: Organization[] = [...orgSlugByName.entries()]
    .map(([name, slug]) => {
      const meta = orgMetaByName.get(name)
      return organizationSchema.parse({
        slug,
        name,
        type: meta?.type ?? 'company',
        ...(meta?.country ? { country: meta.country } : {}),
        ...(meta?.url ? { url: meta.url } : {}),
        ...(meta?.description ? { description: meta.description } : {}),
      })
    })
    .sort((a, b) => a.slug.localeCompare(b.slug))

  // ---- Families: globally-unique slug; org-prefix on cross-org collision. ----
  const familySlugByKey = new Map<string, string>() // `${orgSlug}::${familyName}` → slug
  const familyKeyBySlug = new Map<string, string>()
  const familyForModel = (m: CorpusModel, orgSlug: string): string => {
    const key = `${orgSlug}::${m.family}`
    const cached = familySlugByKey.get(key)
    if (cached) return cached
    const base = m.familySlug ?? slugify(m.family)
    let slug = base
    let n = 2
    while (familyKeyBySlug.has(slug) && familyKeyBySlug.get(slug) !== key) {
      slug = n === 2 ? `${orgSlug}-${base}` : `${orgSlug}-${base}-${n}`
      n++
    }
    familySlugByKey.set(key, slug)
    familyKeyBySlug.set(slug, key)
    return slug
  }

  // ---- Model slugs: explicit or slugify(name); disambiguate on collision (size → date → n). ----
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  const takenSlugs = new Set<string>()
  const assignSlug = (m: CorpusModel): string => {
    const base = m.slug ?? slugify(m.name)
    if (!takenSlugs.has(base)) {
      takenSlugs.add(base)
      return base
    }
    const st = sizeToken(m.paramsB)
    const cands = [
      st ? `${base}-${st}` : null,
      `${base}-${m.releaseDate.slice(0, 7)}`,
      `${base}-${m.releaseDate}`,
    ].filter((s): s is string => s != null && slugRegex.test(s))
    for (const c of cands) {
      if (!takenSlugs.has(c)) {
        takenSlugs.add(c)
        return c
      }
    }
    let n = 2
    let c = `${base}-${n}`
    while (takenSlugs.has(c)) c = `${base}-${++n}`
    takenSlugs.add(c)
    return c
  }

  interface Resolved {
    m: CorpusModel
    slug: string
    orgSlug: string
    familySlug: string
  }
  const resolved: Resolved[] = models.map((m) => {
    const orgSlug = m.orgSlug ?? orgSlugByName.get(m.org) ?? slugify(m.org)
    return { m, slug: assignSlug(m), orgSlug, familySlug: familyForModel(m, orgSlug) }
  })

  const families: Family[] = [...familySlugByKey.entries()]
    .map(([key, slug]) => {
      const [orgSlug, name] = key.split('::') as [string, string]
      return familySchema.parse({ slug, name, orgSlug })
    })
    .sort((a, b) => a.slug.localeCompare(b.slug))

  // ---- Predecessors: per-family, nearest strictly-older; same-day = size variants (no pred). ----
  const byFamily = new Map<string, Resolved[]>()
  for (const r of resolved) {
    if (!byFamily.has(r.familySlug)) byFamily.set(r.familySlug, [])
    byFamily.get(r.familySlug)?.push(r)
  }
  const predecessorOf = new Map<string, string | null>()
  for (const group of byFamily.values()) {
    const sorted = [...group].sort((a, b) => a.m.releaseDate.localeCompare(b.m.releaseDate))
    sorted.forEach((r, i) => {
      let pred: string | null = null
      for (let j = i - 1; j >= 0; j--) {
        const cand = sorted[j] as Resolved
        if (cand.m.releaseDate < r.m.releaseDate) {
          pred = cand.slug
          break
        }
      }
      predecessorOf.set(r.slug, pred)
    })
  }

  // ---- Models ----
  const generatedModels: Model[] = resolved
    .map(({ m, slug, orgSlug, familySlug }) => {
      const hasVision = m.modalities.includes('vision')
      const quants = [...m.quants]
      if (m.tps4090 != null && !quants.includes('GGUF Q4')) quants.unshift('GGUF Q4')
      if (m.activeParamsB != null && m.paramsB != null && m.activeParamsB > m.paramsB) {
        throw new GenerationError(
          `${slug}: activeParamsB ${m.activeParamsB} exceeds paramsB ${m.paramsB}`,
        )
      }
      if (m.vramQ4Gb != null && m.vramFp16Gb != null && m.vramQ4Gb >= m.vramFp16Gb) {
        throw new GenerationError(
          `${slug}: vramQ4Gb ${m.vramQ4Gb} must be below vramFp16Gb ${m.vramFp16Gb}`,
        )
      }
      return modelSchema.parse({
        slug,
        name: m.name,
        orgSlug,
        familySlug,
        releaseDate: m.releaseDate,
        status: m.status,
        predecessor: predecessorOf.get(slug) ?? null,
        openness: m.openness,
        license: m.license,
        paramsB: m.paramsB,
        activeParamsB: m.activeParamsB,
        archClass: m.archClass,
        archDisplay: m.archDisplay,
        ctxK: m.ctxK,
        modalities: m.modalities,
        langCount: m.langCount,
        capabilities: { ...m.capabilities, vision: hasVision },
        apiAvailable: m.apiAvailable,
        price: m.price ? { input: m.price.input, output: m.price.output } : null,
        links: m.links,
        note: m.note.replace(/\s+/g, ' ').trim(),
        quants,
        vramQ4Gb: m.vramQ4Gb,
        vramFp16Gb: m.vramFp16Gb,
        tps4090: m.tps4090,
        tpsNote: m.tpsNote,
      })
    })
    .sort((a, b) => a.slug.localeCompare(b.slug))

  // ---- Benchmarks ----
  const benchSlugs = new Set(corpus.benchmarks.map((b) => b.slug))
  const benchmarks: Benchmark[] = corpus.benchmarks
    .map((b) =>
      benchmarkSchema.parse({
        slug: b.slug,
        name: b.name,
        category: b.category,
        unit: b.unit,
        description: b.description,
        normMin: b.normMin,
        normMax: b.normMax,
        higherIsBetter: b.higherIsBetter,
        ...(b.methodologyUrl ? { methodologyUrl: b.methodologyUrl } : {}),
      }),
    )
    .sort((a, b) => a.slug.localeCompare(b.slug))
  const benchBySlug = new Map(benchmarks.map((b) => [b.slug, b]))

  // ---- Results: per-benchmark CSV split, preserving real source + source_url. ----
  const rawRows = new Map<string, Row[]>()
  const observed = new Map<string, { min: number; max: number }>()
  const seenModelSource = new Map<string, Set<string>>()
  for (const r of resolved) {
    for (const row of r.m.results) {
      if (!benchSlugs.has(row.benchmarkSlug)) {
        throw new GenerationError(
          `${r.slug}: result references unknown benchmark '${row.benchmarkSlug}' (not in benchmarks.json)`,
        )
      }
      const dedup = seenModelSource.get(row.benchmarkSlug) ?? new Set<string>()
      const key = `${r.slug}::${row.source}`
      if (dedup.has(key)) continue // keep first (model, source) row (deterministic order)
      dedup.add(key)
      seenModelSource.set(row.benchmarkSlug, dedup)
      const rows = rawRows.get(row.benchmarkSlug) ?? []
      rows.push([
        r.slug,
        row.score,
        row.source,
        row.sourceUrl,
        row.evaluatedAt ?? '',
        row.notes ?? '',
      ])
      rawRows.set(row.benchmarkSlug, rows)
      const o = observed.get(row.benchmarkSlug)
      observed.set(
        row.benchmarkSlug,
        o
          ? { min: Math.min(o.min, row.score), max: Math.max(o.max, row.score) }
          : { min: row.score, max: row.score },
      )
    }
  }

  // Bound-fit guard: every observed score must sit inside the validator tolerance window.
  for (const [slug, o] of observed) {
    const b = benchBySlug.get(slug)
    if (!b) continue
    const span = b.normMax - b.normMin
    const lo = b.normMin - span * 0.5
    const hi = b.normMax + span * 0.1
    if (o.min < lo || o.max > hi) {
      throw new GenerationError(
        `benchmark '${slug}': observed scores [${o.min}, ${o.max}] fall outside tolerance [${lo}, ${hi}] for bounds [${b.normMin}, ${b.normMax}] — widen the curated bounds`,
      )
    }
  }

  const results = new Map<string, Row[]>()
  for (const [slug, rows] of rawRows) {
    results.set(
      slug,
      [...rows].sort(
        (a, b) =>
          String(a[0]).localeCompare(String(b[0])) || String(a[2]).localeCompare(String(b[2])),
      ),
    )
  }

  // ---- Pricing (priced models only; bidirectional invariant holds by construction) ----
  const pricing: Row[] = resolved
    .filter((r) => r.m.price)
    .map((r) => {
      const p = r.m.price as { input: number; output: number; provider?: string }
      return [r.slug, p.provider ?? r.orgSlug, p.input, p.output, r.m.releaseDate]
    })
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))

  // ---- Throughput (measured RTX 4090 Q4 llama.cpp rows) ----
  const throughput: Row[] = resolved
    .filter((r) => r.m.tps4090 != null)
    .map((r) => [r.slug, 'GGUF Q4', 'rtx4090', 'llama.cpp', r.m.tps4090 as number, '', '', ''])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))

  const asOfIso = new Date(`${corpus.meta.asOf} UTC`).toISOString().slice(0, 10)

  return {
    organizations,
    families,
    models: generatedModels,
    benchmarks,
    hardware: corpus.hardware,
    results,
    pricing,
    throughput,
    asOf: corpus.meta.asOf,
    asOfIso,
  }
}

export async function writeDataset(gen: Generated, outRoot: string): Promise<void> {
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

  for (const o of gen.organizations) await writeJson(`organizations/${o.slug}.json`, o)
  for (const f of gen.families) await writeJson(`families/${f.slug}.json`, f)
  for (const m of gen.models) await writeJson(`models/${m.orgSlug}/${m.slug}.json`, m)
  for (const b of gen.benchmarks) await writeJson(`benchmarks/${b.slug}.json`, b)
  for (const [slug, rows] of [...gen.results.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    await writeText(`results/${slug}.csv`, toCsv(RESULT_HEADER, rows))
  }
  await writeText(
    'pricing/api-pricing.csv',
    toCsv(
      ['model_slug', 'provider', 'input_per_mtok', 'output_per_mtok', 'effective_date'],
      gen.pricing,
    ),
  )
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
      gen.throughput,
    ),
  )
  await writeJson('hardware/profiles.json', gen.hardware)
  await writeJson('meta.json', { asOf: gen.asOf, asOfIso: gen.asOfIso })
}

export async function generateDataset(corpusRoot: string, outRoot: string): Promise<void> {
  const corpus = await loadCorpus(corpusRoot)
  const gen = generate(corpus)
  await writeDataset(gen, outRoot)

  // Self-validation gate: an invalid tree can never be emitted.
  const report = await validateData(outRoot)
  if (report.errors.length) {
    console.error(`generated /data failed validation (${report.errors.length} errors):`)
    for (const e of report.errors.slice(0, 40)) console.error(`  ${e}`)
    throw new GenerationError('generated dataset is invalid — see errors above')
  }
  const s = report.stats
  console.log(
    `generated: ${s.models} models · ${s.organizations} orgs · ${s.families} families · ${s.benchmarks} benchmarks · ${s.results} results · ${s.gpus} gpus · ${s.pricing} pricing · ${s.throughput} throughput`,
  )
}

if (import.meta.main) {
  const corpusRoot = process.argv[2] ?? 'corpus'
  const out = process.argv[3] ?? 'data'
  await generateDataset(corpusRoot, out)
}
