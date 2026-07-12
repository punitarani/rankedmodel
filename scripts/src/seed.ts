import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { normalizeScore } from '@rankedmodel/shared'
import { type DerivedScores, deriveScores } from './derive'
import { type Dataset, loadDataset } from './lib/load'

/**
 * Seed generator (plan commit 11): curated + derived data → literal-value SQL applied
 * via `wrangler d1 execute DB --local|--remote --file` from apps/web (so local state
 * lands in the same .wrangler/state the vite dev server reads).
 *
 * Idempotent full-sync: stable slug-sorted integer ids + `ON CONFLICT(id) DO UPDATE`
 * upserts (never INSERT OR REPLACE — §5.5), then trailing `DELETE ... WHERE id > max`
 * cleanup so removed curated rows disappear. Statements stay far below D1's 100 KB
 * per-statement limit via row chunking.
 */

const CHUNK_ROWS = 40
const MAX_STATEMENT_BYTES = 100_000

const s = (v: string | null | undefined): string =>
  v == null ? 'NULL' : `'${v.replaceAll("'", "''")}'`
const n = (v: number | null | undefined): string => (v == null ? 'NULL' : String(v))
const b = (v: boolean): string => (v ? '1' : '0')
const j = (v: unknown): string => s(JSON.stringify(v))

function upsertStatements(
  table: string,
  columns: string[],
  rows: string[][],
  conflictKey = 'id',
): string[] {
  const out: string[] = []
  const nonKey = columns.filter((c) => c !== conflictKey)
  const setClause = nonKey.map((c) => `${c}=excluded.${c}`).join(', ')
  for (let i = 0; i < rows.length; i += CHUNK_ROWS) {
    const chunk = rows.slice(i, i + CHUNK_ROWS)
    const values = chunk.map((r) => `(${r.join(',')})`).join(',\n')
    const stmt = `INSERT INTO ${table} (${columns.join(', ')}) VALUES\n${values}\nON CONFLICT(${conflictKey}) DO UPDATE SET ${setClause};`
    if (new TextEncoder().encode(stmt).length > MAX_STATEMENT_BYTES) {
      throw new Error(`seed statement for ${table} exceeds D1's 100 KB limit — lower CHUNK_ROWS`)
    }
    out.push(stmt)
  }
  return out
}

export function generateSeedSql(ds: Dataset, derived: DerivedScores): string[] {
  const stmts: string[] = []

  // stable ids: slug-sorted per entity
  const orgs = [...ds.organizations].sort((a, z) => a.slug.localeCompare(z.slug))
  const families = [...ds.families].sort((a, z) => a.slug.localeCompare(z.slug))
  const models = [...ds.models].sort((a, z) => a.slug.localeCompare(z.slug))
  const benchmarks = [...ds.benchmarks].sort((a, z) => a.slug.localeCompare(z.slug))
  const gpus = [...ds.hardware].sort((a, z) => a.slug.localeCompare(z.slug))
  const orgId = new Map(orgs.map((o, i) => [o.slug, i + 1]))
  const familyId = new Map(families.map((f, i) => [f.slug, i + 1]))
  const modelId = new Map(models.map((m, i) => [m.slug, i + 1]))
  const benchId = new Map(benchmarks.map((x, i) => [x.slug, i + 1]))
  const gpuId = new Map(gpus.map((g, i) => [g.slug, i + 1]))

  stmts.push(
    ...upsertStatements(
      'organizations',
      ['id', 'slug', 'name', 'type', 'country', 'url', 'description'],
      orgs.map((o, i) => [
        String(i + 1),
        s(o.slug),
        s(o.name),
        s(o.type),
        s(o.country),
        s(o.url),
        s(o.description),
      ]),
    ),
  )

  stmts.push(
    ...upsertStatements(
      'model_families',
      ['id', 'slug', 'org_id', 'name', 'description'],
      families.map((f, i) => [
        String(i + 1),
        s(f.slug),
        String(orgId.get(f.orgSlug)),
        s(f.name),
        s(f.description),
      ]),
    ),
  )

  stmts.push(
    ...upsertStatements(
      'models',
      [
        'id',
        'slug',
        'org_id',
        'family_id',
        'name',
        'release_date',
        'status',
        'predecessor_id',
        'openness',
        'license',
        'license_url',
        'params_total_b',
        'params_active_b',
        'arch_class',
        'arch_display',
        'context_length',
        'max_output_tokens',
        'modalities',
        'lang_count',
        'is_reasoning',
        'supports_function_calling',
        'supports_tool_use',
        'agent_optimized',
        'capabilities',
        'api_available',
        'links',
        'note',
        'quants',
        'vram_q4_gb',
        'vram_fp16_gb',
        'tps_note',
        'updated_at',
      ],
      models.map((m, i) => [
        String(i + 1),
        s(m.slug),
        String(orgId.get(m.orgSlug)),
        String(familyId.get(m.familySlug)),
        s(m.name),
        s(m.releaseDate),
        s(m.status),
        m.predecessor ? String(modelId.get(m.predecessor)) : 'NULL',
        s(m.openness),
        s(m.license),
        'NULL',
        n(m.paramsB),
        n(m.activeParamsB),
        s(m.archClass),
        s(m.archDisplay),
        String(m.ctxK * 1000), // D15: curated K-tokens → absolute
        'NULL',
        j(m.modalities),
        n(m.langCount),
        b(m.capabilities.reasoning),
        b(m.capabilities.functionCalling),
        b(m.capabilities.toolUse),
        b(m.capabilities.agentic),
        j(m.capabilities),
        b(m.apiAvailable),
        j(m.links),
        s(m.note),
        j(m.quants),
        n(m.vramQ4Gb),
        n(m.vramFp16Gb),
        s(m.tpsNote),
        s(derived.computedFor),
      ]),
    ),
  )

  stmts.push(
    ...upsertStatements(
      'benchmarks',
      [
        'id',
        'slug',
        'name',
        'category',
        'unit',
        'description',
        'methodology_url',
        'norm_min',
        'norm_max',
        'higher_is_better',
        'is_active',
      ],
      benchmarks.map((x, i) => [
        String(i + 1),
        s(x.slug),
        s(x.name),
        s(x.category),
        s(x.unit),
        s(x.description),
        s(x.methodologyUrl),
        n(x.normMin),
        n(x.normMax),
        b(x.higherIsBetter),
        '1',
      ]),
    ),
  )

  stmts.push(
    ...upsertStatements(
      'hardware_profiles',
      ['id', 'slug', 'name', 'kind', 'vram_gb', 'notes'],
      gpus.map((g, i) => [String(i + 1), s(g.slug), s(g.name), s(g.kind), n(g.vramGb), s(g.notes)]),
    ),
  )

  // quantizations: rows from each model's quants list, minVram curated onto GGUF Q4
  const BITS: Record<string, number> = {
    'GGUF Q4': 4.5,
    'GGUF Q8': 8.5,
    MXFP4: 4,
    NVFP4: 4,
    FP8: 8,
    AWQ: 4,
    GPTQ: 4,
    EXL2: 4.5,
    MLX: 4.5,
    '1.58-bit dynamic': 1.58,
    '1.8-bit dynamic': 1.8,
  }
  const quantId = new Map<string, number>() // `${modelSlug}|${method}` → id
  const quantRows: string[][] = []
  for (const m of models) {
    for (const method of m.quants) {
      const id = quantRows.length + 1
      quantId.set(`${m.slug}|${method}`, id)
      quantRows.push([
        String(id),
        String(modelId.get(m.slug)),
        s(method),
        n(BITS[method] ?? null),
        'NULL',
        method === 'GGUF Q4' ? n(m.vramQ4Gb) : 'NULL',
        'NULL',
        'NULL',
        'NULL',
      ])
    }
  }
  stmts.push(
    ...upsertStatements(
      'quantizations',
      [
        'id',
        'model_id',
        'method',
        'bits',
        'disk_size_gb',
        'min_vram_gb',
        'min_ram_gb',
        'quality_note',
        'download_url',
      ],
      quantRows,
    ),
  )

  // benchmark_results with publish-time score_normalized (C1)
  const boundsBySlug = new Map(benchmarks.map((x) => [x.slug, x]))
  const resultRows: string[][] = []
  const sortedResultEntries = [...ds.results.entries()].sort(([a], [z]) => a.localeCompare(z))
  for (const [benchSlug, rows] of sortedResultEntries) {
    const bench = boundsBySlug.get(benchSlug)
    if (!bench) continue
    const sorted = [...rows].sort(
      (a, z) => a.modelSlug.localeCompare(z.modelSlug) || a.source.localeCompare(z.source),
    )
    for (const r of sorted) {
      const norm = normalizeScore(
        {
          slug: bench.slug,
          category: bench.category,
          normMin: bench.normMin,
          normMax: bench.normMax,
        },
        r.score,
      )
      resultRows.push([
        String(resultRows.length + 1),
        String(modelId.get(r.modelSlug)),
        String(benchId.get(benchSlug)),
        n(r.score),
        n(norm),
        s(r.evaluatedAt),
        s(r.source),
        s(r.sourceUrl),
        'NULL',
        '0',
        s(r.notes),
      ])
    }
  }
  stmts.push(
    ...upsertStatements(
      'benchmark_results',
      [
        'id',
        'model_id',
        'benchmark_id',
        'score',
        'score_normalized',
        'evaluated_at',
        'source',
        'source_url',
        'settings',
        'is_verified',
        'notes',
      ],
      resultRows,
    ),
  )

  const pricingRows = [...ds.pricing]
    .sort((a, z) => a.modelSlug.localeCompare(z.modelSlug) || a.provider.localeCompare(z.provider))
    .map((p, i) => [
      String(i + 1),
      String(modelId.get(p.modelSlug)),
      s(p.provider),
      n(p.inputPerMtok),
      n(p.outputPerMtok),
      s(p.effectiveDate ?? derived.computedFor),
    ])
  stmts.push(
    ...upsertStatements(
      'model_pricing',
      ['id', 'model_id', 'provider', 'input_per_mtok', 'output_per_mtok', 'effective_date'],
      pricingRows,
    ),
  )

  const throughputRows = [...ds.throughput]
    .sort(
      (a, z) =>
        a.modelSlug.localeCompare(z.modelSlug) ||
        a.hardwareSlug.localeCompare(z.hardwareSlug) ||
        a.framework.localeCompare(z.framework),
    )
    .map((t, i) => [
      String(i + 1),
      String(modelId.get(t.modelSlug)),
      String(quantId.get(`${t.modelSlug}|${t.quantMethod}`)),
      String(gpuId.get(t.hardwareSlug)),
      s(t.framework),
      n(t.tokensPerSec),
      n(t.contextTested),
      s(t.source),
      s(t.sourceUrl),
    ])
  stmts.push(
    ...upsertStatements(
      'throughput_estimates',
      [
        'id',
        'model_id',
        'quantization_id',
        'hardware_id',
        'framework',
        'tokens_per_sec',
        'context_tested',
        'source',
        'source_url',
      ],
      throughputRows,
    ),
  )

  const scoreRows = derived.models.map((d) => [
    String(modelId.get(d.slug)),
    n(d.overallIndex),
    String(d.rankOverall),
    'NULL',
    n(d.categoryIdx['human-preference']),
    n(d.categoryIdx.knowledge),
    n(d.categoryIdx.reasoning),
    n(d.categoryIdx.coding),
    n(d.categoryIdx.math),
    n(d.categoryIdx.vision),
    n(d.categoryIdx.agents),
    n(d.arenaElo),
    s(derived.computedFor),
  ])
  stmts.push(
    ...upsertStatements(
      'model_scores',
      [
        'model_id',
        'overall_index',
        'rank_overall',
        'rank_delta_30d',
        'human_preference_index',
        'knowledge_index',
        'reasoning_index',
        'coding_index',
        'math_index',
        'vision_index',
        'agents_index',
        'arena_elo',
        'computed_at',
      ],
      scoreRows,
      'model_id',
    ),
  )

  // cleanup: drop rows beyond current counts (children before parents)
  stmts.push(
    `DELETE FROM throughput_estimates WHERE id > ${throughputRows.length};`,
    `DELETE FROM benchmark_results WHERE id > ${resultRows.length};`,
    `DELETE FROM model_pricing WHERE id > ${pricingRows.length};`,
    `DELETE FROM model_scores WHERE model_id > ${models.length};`,
    `DELETE FROM quantizations WHERE id > ${quantRows.length};`,
    `DELETE FROM models WHERE id > ${models.length};`,
    `DELETE FROM model_families WHERE id > ${families.length};`,
    `DELETE FROM benchmarks WHERE id > ${benchmarks.length};`,
    `DELETE FROM hardware_profiles WHERE id > ${gpus.length};`,
    `DELETE FROM organizations WHERE id > ${orgs.length};`,
  )

  return stmts
}

export async function seed(root: string, target: '--local' | '--remote'): Promise<void> {
  const ds = await loadDataset(root)
  if (ds.errors.length > 0) {
    throw new Error(`dataset invalid (${ds.errors.length} errors) — run validate-data first`)
  }
  const derived = await deriveScores(root)
  const sql = generateSeedSql(ds, derived).join('\n\n')

  const webDir = resolve(import.meta.dirname, '..', '..', 'apps', 'web')
  const tmpDir = join(webDir, '.wrangler', 'tmp')
  mkdirSync(tmpDir, { recursive: true })
  const sqlPath = join(tmpDir, 'rankedmodel-seed.sql')
  writeFileSync(sqlPath, sql)

  const envFlag =
    target === '--remote' && process.env.RANKEDMODEL_ENV
      ? ['--env', process.env.RANKEDMODEL_ENV]
      : []
  const res = spawnSync(
    'bunx',
    ['wrangler', 'd1', 'execute', 'DB', target, `--file=${sqlPath}`, '-y', ...envFlag],
    { cwd: webDir, stdio: 'inherit' },
  )
  if (res.status !== 0) throw new Error(`wrangler d1 execute failed (exit ${res.status})`)
  console.log(`✓ seeded ${target === '--local' ? 'local' : 'REMOTE'} D1 from ${root}/`)
}

if (import.meta.main) {
  const target = process.argv.includes('--remote') ? '--remote' : '--local'
  const root = process.argv[2]?.startsWith('--') ? 'data' : (process.argv[2] ?? 'data')
  await seed(root, target)
}
