import { env } from 'cloudflare:workers'
import {
  type BenchmarkCategory,
  type CatalogSnapshot,
  catalogKey,
  catalogSnapshotSchema,
  HEADLINE_SOURCE_PRECEDENCE,
  pickHeadlineScore,
  type ResultSource,
} from '@rankedmodel/shared'
import { eq } from 'drizzle-orm'
import { getDb, schema } from './db'

/**
 * The catalog spine (plan commit 14, D17): version from D1 meta → immutable KV snapshot
 * → C3 Zod parse. If the KV blob is missing or malformed, the snapshot is rebuilt from
 * D1 (source of truth) — same shape, same parse. Everything downstream consumes this.
 */
export async function loadCatalog(): Promise<CatalogSnapshot> {
  const db = getDb()
  const versionRow = await db
    .select({ value: schema.meta.value })
    .from(schema.meta)
    .where(eq(schema.meta.key, 'data_version'))
    .get()
  if (!versionRow) {
    throw new Error('No published catalog: meta.data_version missing — run publish-data first')
  }
  const version = Number(versionRow.value)

  const cached = await env.CATALOG.get(catalogKey(version), 'json')
  if (cached) {
    const parsed = catalogSnapshotSchema.safeParse(cached)
    if (parsed.success) return parsed.data
    console.warn(`catalog:v${version} in KV failed schema parse — rebuilding from D1`)
  }
  return rebuildFromD1(version)
}

async function rebuildFromD1(version: number): Promise<CatalogSnapshot> {
  const db = getDb()
  const [metaRows, orgs, families, benches, gpus, models, scores, results] = await Promise.all([
    db.select().from(schema.meta).all(),
    db.select().from(schema.organizations).all(),
    db.select().from(schema.modelFamilies).all(),
    db.select().from(schema.benchmarks).all(),
    db.select().from(schema.hardwareProfiles).all(),
    db.select().from(schema.models).all(),
    db.select().from(schema.modelScores).all(),
    db.select().from(schema.benchmarkResults).all(),
  ])

  const metaByKey = new Map(metaRows.map((r) => [r.key, r.value]))
  const orgById = new Map(orgs.map((o) => [o.id, o]))
  const familyById = new Map(families.map((f) => [f.id, f]))
  const scoreByModel = new Map(scores.map((s) => [s.modelId, s]))
  const modelById = new Map(models.map((m) => [m.id, m]))

  // headline score per (model, benchmark) with multi-source precedence
  const rowsByModelBench = new Map<string, { score: number; source: ResultSource }[]>()
  for (const r of results) {
    const key = `${r.modelId}|${r.benchmarkId}`
    if (!rowsByModelBench.has(key)) rowsByModelBench.set(key, [])
    rowsByModelBench.get(key)?.push({ score: r.score, source: r.source })
  }
  const benchMapFor = (modelId: number): Record<string, number | null> => {
    const out: Record<string, number | null> = {}
    for (const b of benches) {
      const rows = rowsByModelBench.get(`${modelId}|${b.id}`)
      if (rows) out[b.slug] = pickHeadlineScore(rows)
    }
    return out
  }
  const benchSourcesFor = (modelId: number): Record<string, ResultSource> => {
    const out: Record<string, ResultSource> = {}
    for (const b of benches) {
      const rows = rowsByModelBench.get(`${modelId}|${b.id}`)
      if (!rows || rows.length === 0) continue
      const sorted = [...rows].sort(
        (a, z) =>
          HEADLINE_SOURCE_PRECEDENCE.indexOf(a.source) -
          HEADLINE_SOURCE_PRECEDENCE.indexOf(z.source),
      )
      const head = sorted[0]
      if (head) out[b.slug] = head.source
    }
    return out
  }

  const snapshot: CatalogSnapshot = {
    version,
    asOf: metaByKey.get('as_of') ?? 'unknown',
    asOfIso: metaByKey.get('as_of_iso') ?? '1970-01-01',
    benchmarks: benches.map((b) => ({
      slug: b.slug,
      name: b.name,
      category: b.category,
      unit: b.unit,
      description: b.description,
      normMin: b.normMin,
      normMax: b.normMax,
    })),
    gpus: gpus.map((g) => ({ slug: g.slug, name: g.name, kind: g.kind, vramGb: g.vramGb })),
    models: [...models]
      .sort((a, z) => a.slug.localeCompare(z.slug))
      .map((m) => {
        const score = scoreByModel.get(m.id)
        const categoryIdx: Record<BenchmarkCategory, number | null> = {
          'human-preference': score?.humanPreferenceIndex ?? null,
          knowledge: score?.knowledgeIndex ?? null,
          reasoning: score?.reasoningIndex ?? null,
          coding: score?.codingIndex ?? null,
          math: score?.mathIndex ?? null,
          vision: score?.visionIndex ?? null,
          agents: score?.agentsIndex ?? null,
        }
        return {
          slug: m.slug,
          name: m.name,
          org: orgById.get(m.orgId)?.name ?? '',
          orgSlug: orgById.get(m.orgId)?.slug ?? '',
          family: familyById.get(m.familyId)?.name ?? '',
          familySlug: familyById.get(m.familyId)?.slug ?? '',
          date: m.releaseDate,
          status: m.status,
          openness: m.openness,
          open: m.openness !== 'closed',
          predecessor: m.predecessorId ? (modelById.get(m.predecessorId)?.slug ?? null) : null,
          params: m.paramsTotalB,
          active: m.paramsActiveB,
          ctxK: m.contextLength / 1000,
          arch: m.archDisplay,
          archClass: m.archClass,
          license: m.license,
          langCount: m.langCount,
          modalities: m.modalities,
          caps: m.capabilities,
          apiAvailable: m.apiAvailable,
          bench: benchMapFor(m.id),
          benchSources: benchSourcesFor(m.id),
          price: null, // filled from pricing below
          vramQ4: m.vramQ4Gb,
          vramFp16: m.vramFp16Gb,
          quants: m.quants,
          tps4090: null, // filled from throughput below
          tpsNote: m.tpsNote,
          links: m.links,
          note: m.note,
          index: score?.overallIndex ?? 0,
          rank: score?.rankOverall ?? 0,
          categoryIdx,
        }
      }),
  }

  // pricing + rtx4090 throughput enrichments (separate queries keep the join simple)
  const [pricing, throughput, quantRows, hardwareRows] = await Promise.all([
    db.select().from(schema.modelPricing).all(),
    db.select().from(schema.throughputEstimates).all(),
    db.select().from(schema.quantizations).all(),
    db.select().from(schema.hardwareProfiles).all(),
  ])
  const modelSlugById = new Map(models.map((m) => [m.id, m.slug]))
  const bySlug = new Map(snapshot.models.map((m) => [m.slug, m]))
  for (const p of pricing) {
    const m = bySlug.get(modelSlugById.get(p.modelId) ?? '')
    if (m && !m.price) m.price = { input: p.inputPerMtok, output: p.outputPerMtok }
  }
  const rtx4090 = hardwareRows.find((h) => h.slug === 'rtx4090')
  const quantById = new Map(quantRows.map((q) => [q.id, q]))
  for (const t of throughput) {
    if (t.hardwareId !== rtx4090?.id || t.framework !== 'llama.cpp') continue
    const quant = quantById.get(t.quantizationId)
    if (quant?.method !== 'GGUF Q4') continue
    const m = bySlug.get(modelSlugById.get(t.modelId) ?? '')
    if (m) m.tps4090 = t.tokensPerSec
  }

  return catalogSnapshotSchema.parse(snapshot)
}
