import { type CatalogSnapshot, computeMovers, type SnapshotModel } from '@rankedmodel/shared'

/** Display shaping for the dashboard (design renderVals, snapshot-only per D17). */

/** Rank-eligible models in rank order — the leaderboard's backbone (D20). */
export function rankedByRank(catalog: CatalogSnapshot): SnapshotModel[] {
  return catalog.models
    .filter((m) => m.ranked && m.rank != null)
    .sort((a, b) => (a.rank as number) - (b.rank as number))
}

export function dashboardStats(catalog: CatalogSnapshot) {
  const models = catalog.models
  const openModels = models.filter((m) => m.open)
  const asOf = new Date(`${catalog.asOfIso}T00:00:00Z`).getTime()
  const recent90d = models.filter(
    (m) => (asOf - new Date(`${m.date}T00:00:00Z`).getTime()) / 86_400_000 < 90,
  ).length
  // Frontier leaders are the top RANKED model on each side (index is universal; arena covers
  // only ~13 models, so an arena-based frontier is empty in the common case — D20).
  const ranked = rankedByRank(catalog)
  const openBest = ranked.find((m) => m.open)
  const closedBest = ranked.find((m) => !m.open)
  const gapIndex =
    openBest && closedBest ? Math.round((closedBest.index - openBest.index) * 10) / 10 : null
  return {
    modelCount: models.length,
    orgCount: new Set(models.map((m) => m.orgSlug)).size,
    openCount: openModels.length,
    openPct: Math.round((openModels.length / Math.max(1, models.length)) * 100),
    recent90d,
    gapIndex,
    openBest,
    closedBest,
  }
}

export function latestReleases(catalog: CatalogSnapshot, n = 8): SnapshotModel[] {
  return [...catalog.models].sort((a, b) => b.date.localeCompare(a.date)).slice(0, n)
}

/** Top models by overall index (rank-eligible only) — the dashboard leaderboard rail. */
export function leaderboardTop(catalog: CatalogSnapshot, n = 8): SnapshotModel[] {
  return rankedByRank(catalog).slice(0, n)
}

export function dashboardMovers(catalog: CatalogSnapshot) {
  return computeMovers(
    catalog.models.map((m) => ({
      slug: m.slug,
      name: m.name,
      predecessor: m.predecessor,
      index: m.index,
      ranked: m.ranked,
    })),
  )
}

/** Priced, rank-eligible models with an index — the points of the quality-vs-price scatter. */
export function scatterModels(catalog: CatalogSnapshot): SnapshotModel[] {
  return catalog.models.filter((m) => m.price != null && m.ranked)
}

/**
 * Scatter points worth labeling directly on the chart: the top few points by index (the
 * frontier) plus the top open-weights point if it didn't already make that cut — derived
 * from live data instead of a fixed slug list (D-real).
 */
export function scatterLabeled(catalog: CatalogSnapshot, topN = 5): Set<string> {
  const byIndex = [...scatterModels(catalog)].sort((a, b) => b.index - a.index)
  const labeled = new Set(byIndex.slice(0, topN).map((m) => m.slug))
  const topOpen = byIndex.find((m) => m.open)
  if (topOpen) labeled.add(topOpen.slug)
  return labeled
}
