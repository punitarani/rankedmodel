import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import {
  type CatalogSnapshot,
  catalogKey,
  catalogSnapshotSchema,
  HEADLINE_SOURCE_PRECEDENCE,
  type ResultSource,
} from '@rankedmodel/shared'
import { deriveScores } from './derive'
import { loadDataset } from './lib/load'

/**
 * Snapshot builder + KV publisher (plan commit 12). Builds the C3 catalog JSON, parses
 * it back through the shared Zod contract (a malformed snapshot cannot ship), enforces
 * the < 1.5 MB gzip budget, writes the immutable `catalog:v{N}` KV key, then bumps
 * `meta.data_version` in D1 — which IS cache invalidation (version-keyed everything).
 */

const SNAPSHOT_GZIP_BUDGET = 1.5 * 1024 * 1024

const WEB_DIR = resolve(import.meta.dirname, '..', '..', 'apps', 'web')

function wrangler(args: string[], opts: { json?: boolean } = {}): string {
  // remote publishes against a named env (deploy.ts sets RANKEDMODEL_ENV)
  const envFlag =
    args.includes('--remote') && process.env.RANKEDMODEL_ENV
      ? ['--env', process.env.RANKEDMODEL_ENV]
      : []
  const res = spawnSync('bunx', ['wrangler', ...args, ...envFlag], {
    cwd: WEB_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', opts.json ? 'ignore' : 'inherit'],
  })
  if (res.status !== 0) {
    throw new Error(`wrangler ${args.slice(0, 3).join(' ')} failed (exit ${res.status})`)
  }
  return res.stdout ?? ''
}

export async function buildSnapshot(root: string, version: number): Promise<CatalogSnapshot> {
  const ds = await loadDataset(root)
  if (ds.errors.length > 0) {
    throw new Error(`dataset invalid (${ds.errors.length} errors) — run validate-data first`)
  }
  const derived = await deriveScores(root)
  const scoreBySlug = new Map(derived.models.map((m) => [m.slug, m]))
  const orgBySlug = new Map(ds.organizations.map((o) => [o.slug, o]))
  const familyBySlug = new Map(ds.families.map((f) => [f.slug, f]))

  // headline scores + their provenance per model (same precedence as derive)
  const bench = new Map<string, Record<string, number | null>>()
  const benchSources = new Map<string, Record<string, ResultSource>>()
  for (const [benchSlug, rows] of ds.results) {
    const byModel = new Map<string, { score: number; source: ResultSource }[]>()
    for (const r of rows) {
      if (!byModel.has(r.modelSlug)) byModel.set(r.modelSlug, [])
      byModel.get(r.modelSlug)?.push({ score: r.score, source: r.source })
    }
    for (const [modelSlug, modelRows] of byModel) {
      const sorted = [...modelRows].sort(
        (a, z) =>
          HEADLINE_SOURCE_PRECEDENCE.indexOf(a.source) -
          HEADLINE_SOURCE_PRECEDENCE.indexOf(z.source),
      )
      const head = sorted[0]
      if (!head) continue
      const scores = bench.get(modelSlug) ?? {}
      scores[benchSlug] = head.score
      bench.set(modelSlug, scores)
      const sources = benchSources.get(modelSlug) ?? {}
      sources[benchSlug] = head.source
      benchSources.set(modelSlug, sources)
    }
  }

  const snapshot: CatalogSnapshot = {
    version,
    asOf: ds.meta?.asOf ?? 'unknown',
    asOfIso: ds.meta?.asOfIso ?? '1970-01-01',
    benchmarks: ds.benchmarks.map((b) => ({
      slug: b.slug,
      name: b.name,
      category: b.category,
      unit: b.unit,
      description: b.description,
      normMin: b.normMin,
      normMax: b.normMax,
    })),
    gpus: ds.hardware.map((g) => ({
      slug: g.slug,
      name: g.name,
      kind: g.kind,
      vramGb: g.vramGb,
    })),
    models: [...ds.models]
      .sort((a, z) => a.slug.localeCompare(z.slug))
      .map((m) => {
        const score = scoreBySlug.get(m.slug)
        if (!score) throw new Error(`no derived score for ${m.slug}`)
        return {
          slug: m.slug,
          name: m.name,
          org: orgBySlug.get(m.orgSlug)?.name ?? m.orgSlug,
          orgSlug: m.orgSlug,
          family: familyBySlug.get(m.familySlug)?.name ?? m.familySlug,
          familySlug: m.familySlug,
          date: m.releaseDate,
          status: m.status,
          openness: m.openness,
          open: m.openness !== 'closed',
          predecessor: m.predecessor,
          params: m.paramsB,
          active: m.activeParamsB,
          ctxK: m.ctxK,
          arch: m.archDisplay,
          archClass: m.archClass,
          license: m.license,
          langCount: m.langCount,
          modalities: m.modalities,
          caps: m.capabilities,
          apiAvailable: m.apiAvailable,
          bench: bench.get(m.slug) ?? {},
          benchSources: benchSources.get(m.slug) ?? {},
          price: m.price,
          vramQ4: m.vramQ4Gb,
          vramFp16: m.vramFp16Gb,
          quants: m.quants,
          tps4090: m.tps4090,
          tpsNote: m.tpsNote,
          links: m.links,
          note: m.note,
          index: score.overallIndex,
          rank: score.rankOverall,
          categoryIdx: score.categoryIdx,
        }
      }),
  }

  // The contract check: a snapshot that doesn't parse cannot ship.
  return catalogSnapshotSchema.parse(snapshot)
}

export function currentDataVersion(target: '--local' | '--remote'): number {
  const out = wrangler(
    [
      'd1',
      'execute',
      'DB',
      target,
      '--json',
      '--command',
      "SELECT value FROM meta WHERE key='data_version'",
    ],
    { json: true },
  )
  try {
    const rows = JSON.parse(out)[0]?.results ?? []
    return rows.length > 0 ? Number(rows[0].value) : 0
  } catch {
    return 0
  }
}

export async function publishSnapshot(
  root: string,
  target: '--local' | '--remote',
): Promise<number> {
  const version = currentDataVersion(target) + 1
  const snapshot = await buildSnapshot(root, version)

  const json = JSON.stringify(snapshot)
  const gzBytes = gzipSync(json).length
  if (gzBytes > SNAPSHOT_GZIP_BUDGET) {
    throw new Error(
      `snapshot is ${(gzBytes / 1024).toFixed(0)} KB gzipped — over the 1.5 MB budget (arch §10)`,
    )
  }

  const tmpDir = join(WEB_DIR, '.wrangler', 'tmp')
  mkdirSync(tmpDir, { recursive: true })
  const path = join(tmpDir, `catalog-v${version}.json`)
  writeFileSync(path, json)

  wrangler(['kv', 'key', 'put', '--binding=CATALOG', catalogKey(version), `--path=${path}`, target])
  wrangler([
    'd1',
    'execute',
    'DB',
    target,
    '-y',
    '--command',
    `INSERT INTO meta (key, value) VALUES ('data_version', '${version}'), ('published_at', '${new Date().toISOString()}'), ('as_of', '${snapshot.asOf.replaceAll("'", "''")}'), ('as_of_iso', '${snapshot.asOfIso}') ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
  ])

  console.log(
    `✓ published ${catalogKey(version)} (${(gzBytes / 1024).toFixed(1)} KB gz, ${snapshot.models.length} models) · meta.data_version=${version} [${target === '--local' ? 'local' : 'REMOTE'}]`,
  )
  return version
}

if (import.meta.main) {
  const target = process.argv.includes('--remote') ? '--remote' : '--local'
  const root = process.argv[2]?.startsWith('--') ? 'data' : (process.argv[2] ?? 'data')
  await publishSnapshot(root, target)
}
