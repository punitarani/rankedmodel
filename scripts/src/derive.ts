import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type BenchmarkBounds,
  type BenchmarkCategory,
  type BenchScores,
  buildBattles,
  categoryFractions,
  computeMovers,
  fitBradleyTerry,
  isRankEligible,
  type Mover,
  pickHeadlineScore,
  type ResultSource,
  rankByIndex,
  roundRating,
  toIndexScale,
} from '@modelbeats/shared'
import { loadDataset } from './lib/load'
import { validateData } from './validate'

/**
 * Publish-time derivation (C1/D21): validate must have passed first. Emits
 * data/derived/scores.json — committed, deterministic (no wall-clock timestamps;
 * `computedFor` is the dataset's as-of date), reviewable as a diff.
 */

export interface DerivedModelScore {
  slug: string
  /** Frontier Elo rating (D21): Bradley-Terry over pairwise benchmark battles, 1 decimal. */
  overallIndex: number
  /** Overall rank among rank-eligible models (D20); null when the model is unrated. */
  rankOverall: number | null
  /** Has enough benchmark coverage to earn a rank (D20). */
  ranked: boolean
  arenaElo: number | null
  categoryIdx: Record<BenchmarkCategory, number | null>
}

export interface DerivedScores {
  computedFor: string
  models: DerivedModelScore[]
  movers: Mover[]
}

export async function deriveScores(root: string): Promise<DerivedScores> {
  const ds = await loadDataset(root)
  if (ds.errors.length > 0) {
    throw new Error(`dataset has ${ds.errors.length} validation errors — run validate first`)
  }

  const bounds: BenchmarkBounds[] = ds.benchmarks.map((b) => ({
    slug: b.slug,
    category: b.category,
    normMin: b.normMin,
    normMax: b.normMax,
  }))

  // headline score per (model, benchmark) with source precedence (shared pickHeadlineScore)
  const rowsByModel = new Map<string, Map<string, { score: number; source: ResultSource }[]>>()
  for (const [benchSlug, rows] of ds.results) {
    for (const r of rows) {
      let byBench = rowsByModel.get(r.modelSlug)
      if (!byBench) {
        byBench = new Map()
        rowsByModel.set(r.modelSlug, byBench)
      }
      const list = byBench.get(benchSlug)
      if (list) list.push(r)
      else byBench.set(benchSlug, [r])
    }
  }
  const headline = new Map<string, Record<string, number>>()
  for (const [modelSlug, byBench] of rowsByModel) {
    const scores: Record<string, number> = {}
    for (const [benchSlug, rows] of byBench) {
      const score = pickHeadlineScore(rows)
      if (score != null) scores[benchSlug] = score
    }
    headline.set(modelSlug, scores)
  }

  // Frontier Elo (D21, D26 category-attenuated battles): pairwise battles → Bradley-Terry fit.
  const headlineByModel = new Map<string, BenchScores>(
    ds.models.map((m) => [m.slug, headline.get(m.slug) ?? {}]),
  )
  const battles = buildBattles(
    headlineByModel,
    ds.benchmarks.map((b) => ({ slug: b.slug, category: b.category })),
  )
  const fit = fitBradleyTerry([...headlineByModel.keys()], battles)
  if (!fit.converged) {
    throw new Error(`Bradley-Terry fit did not converge within ${fit.iterations} iterations`)
  }

  const indexed = ds.models.map((m) => {
    const scores = headline.get(m.slug) ?? {}
    return {
      model: m,
      scores,
      index: roundRating(fit.ratings.get(m.slug) ?? 0),
      ranked: isRankEligible(scores, bounds),
    }
  })

  // Rank only rank-eligible models (D20); unrated models get no rank.
  const ranks = rankByIndex(
    indexed.filter((x) => x.ranked).map((x) => ({ slug: x.model.slug, index: x.index })),
  )

  const models: DerivedModelScore[] = indexed
    .map(({ model, scores, index, ranked }) => {
      const fractions = categoryFractions(scores, bounds)
      const categoryIdx = Object.fromEntries(
        Object.entries(fractions).map(([cat, f]) => [cat, toIndexScale(f)]),
      ) as Record<BenchmarkCategory, number | null>
      return {
        slug: model.slug,
        overallIndex: index,
        rankOverall: ranked ? (ranks.get(model.slug) ?? null) : null,
        ranked,
        arenaElo: scores.arena ?? null,
        categoryIdx,
      }
    })
    .sort((a, b) => a.slug.localeCompare(b.slug))

  const indexBySlug = new Map(indexed.map((x) => [x.model.slug, x.index]))
  const rankedBySlug = new Map(indexed.map((x) => [x.model.slug, x.ranked]))
  const movers = computeMovers(
    ds.models.map((m) => ({
      slug: m.slug,
      name: m.name,
      predecessor: m.predecessor,
      index: indexBySlug.get(m.slug) ?? 0,
      ranked: rankedBySlug.get(m.slug) ?? false,
    })),
  )

  return { computedFor: ds.meta?.asOfIso ?? 'unknown', models, movers }
}

if (import.meta.main) {
  const root = process.argv[2] ?? 'data'
  // deriveScores itself only checks loadDataset's schema-level errors — full cross-file
  // validation (unknown slugs, duplicate results, price mismatches, …) belongs to
  // validateData. publish-data.ts already runs it first; this CLI entrypoint can be
  // invoked standalone, so it must guard itself the same way.
  const report = await validateData(root)
  if (report.errors.length > 0) {
    console.error(`✗ ${report.errors.length} validation error(s) in ${root}/ — run validate first:`)
    for (const e of report.errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  const derived = await deriveScores(root)
  const outDir = join(root, 'derived')
  await mkdir(outDir, { recursive: true })
  await writeFile(join(outDir, 'scores.json'), `${JSON.stringify(derived, null, 2)}\n`)
  const top = derived.models.find((m) => m.rankOverall === 1)
  console.log(
    `✓ derived ${derived.models.length} model scores → ${outDir}/scores.json · #1 ${top?.slug} (${top?.overallIndex}) · ${derived.movers.length} movers`,
  )
}
