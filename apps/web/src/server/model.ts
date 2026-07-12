import type { InferenceFramework, ResultSource } from '@rankedmodel/shared'
import { eq } from 'drizzle-orm'
import { getDb, schema } from './db'

/**
 * Deep model payload (D17's second read path): full multi-source results with
 * provenance, quantizations, throughput, pricing, family siblings and lineage — the
 * data too heavy for the snapshot at scale (arch §3).
 */

export interface ModelDetail {
  slug: string
  results: {
    benchmarkSlug: string
    score: number
    scoreNormalized: number | null
    source: ResultSource
    sourceUrl: string | null
    evaluatedAt: string | null
    isVerified: boolean
    notes: string | null
  }[]
  quantizations: {
    method: string
    bits: number | null
    minVramGb: number | null
    diskSizeGb: number | null
  }[]
  throughput: {
    hardwareSlug: string
    hardwareName: string
    quantMethod: string
    framework: InferenceFramework
    tokensPerSec: number
    contextTested: number | null
  }[]
  pricing: {
    provider: string
    inputPerMtok: number
    outputPerMtok: number
    effectiveDate: string
  }[]
  lineage: { predecessor: string | null; successors: string[] }
}

export async function loadModel(slug: string): Promise<ModelDetail | null> {
  const db = getDb()
  const model = await db.select().from(schema.models).where(eq(schema.models.slug, slug)).get()
  if (!model) return null

  const [results, quants, tput, pricing, successors, benches, hardware, quantRows] =
    await Promise.all([
      db
        .select()
        .from(schema.benchmarkResults)
        .where(eq(schema.benchmarkResults.modelId, model.id))
        .all(),
      db
        .select()
        .from(schema.quantizations)
        .where(eq(schema.quantizations.modelId, model.id))
        .all(),
      db
        .select()
        .from(schema.throughputEstimates)
        .where(eq(schema.throughputEstimates.modelId, model.id))
        .all(),
      db.select().from(schema.modelPricing).where(eq(schema.modelPricing.modelId, model.id)).all(),
      db
        .select({ slug: schema.models.slug })
        .from(schema.models)
        .where(eq(schema.models.predecessorId, model.id))
        .all(),
      db.select().from(schema.benchmarks).all(),
      db.select().from(schema.hardwareProfiles).all(),
      db
        .select()
        .from(schema.quantizations)
        .where(eq(schema.quantizations.modelId, model.id))
        .all(),
    ])

  const benchSlugById = new Map(benches.map((b) => [b.id, b.slug]))
  const hwById = new Map(hardware.map((h) => [h.id, h]))
  const quantById = new Map(quantRows.map((q) => [q.id, q]))

  const predecessor = model.predecessorId
    ? ((
        await db
          .select({ slug: schema.models.slug })
          .from(schema.models)
          .where(eq(schema.models.id, model.predecessorId))
          .get()
      )?.slug ?? null)
    : null

  return {
    slug: model.slug,
    results: results.map((r) => ({
      benchmarkSlug: benchSlugById.get(r.benchmarkId) ?? '',
      score: r.score,
      scoreNormalized: r.scoreNormalized,
      source: r.source,
      sourceUrl: r.sourceUrl,
      evaluatedAt: r.evaluatedAt,
      isVerified: r.isVerified,
      notes: r.notes,
    })),
    quantizations: quants.map((q) => ({
      method: q.method,
      bits: q.bits,
      minVramGb: q.minVramGb,
      diskSizeGb: q.diskSizeGb,
    })),
    throughput: tput.map((t) => ({
      hardwareSlug: hwById.get(t.hardwareId)?.slug ?? '',
      hardwareName: hwById.get(t.hardwareId)?.name ?? '',
      quantMethod: quantById.get(t.quantizationId)?.method ?? '',
      framework: t.framework,
      tokensPerSec: t.tokensPerSec,
      contextTested: t.contextTested,
    })),
    pricing: pricing.map((p) => ({
      provider: p.provider,
      inputPerMtok: p.inputPerMtok,
      outputPerMtok: p.outputPerMtok,
      effectiveDate: p.effectiveDate,
    })),
    lineage: { predecessor, successors: successors.map((s) => s.slug) },
  }
}
