import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Data-QUALITY audit (companion to validate.ts). Where `validate-data` is the structural gate
 * (schema + referential integrity + gross plausibility, must pass to ship), this reports the
 * softer quality signals a schema can't see — provenance depth, vendor-vs-independent divergence,
 * effort-tier ordering, coverage gaps, and census completeness. It reads the provenance-carrying
 * CORPUS (not the shipped /data) because that's where `results[].source/sourceUrl`, `specSources`
 * and `verificationNotes` live. Advisory by default; pass `--strict` to exit non-zero on a HIGH.
 */

const CUTOFF = '2026-01-31' // assistant knowledge cutoff — models past this can't be externally checked
const DIVERGENCE_PT = 4 // self-reported minus independent gap (pts) worth surfacing
const LOW_COVERAGE = 3 // a benchmark with < this many results barely supports cross-model comparison

interface CorpusResult {
  benchmarkSlug: string
  score: number
  source: string
  sourceUrl: string
  evaluatedAt?: string
  notes?: string
}
interface CorpusModel {
  _rel: string
  name: string
  org: string
  family: string
  releaseDate: string
  openness: string
  paramsB: number | null
  activeParamsB: number | null
  ctxK: number
  effortLabel: string | null
  isBestConfig: boolean
  isDefaultConfig: boolean
  price: { input: number; output: number } | null
  modalities: string[]
  specSources?: Record<string, string>
  verificationNotes?: string
  results: CorpusResult[]
}

interface Finding {
  severity: 'high' | 'medium' | 'low' | 'info'
  area: string
  detail: string
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.json') ? [p] : []
  })
}

export function auditCorpus(root: string): { findings: Finding[]; stats: Record<string, number> } {
  const modelsDir = join(root, 'models')
  const models: CorpusModel[] = walk(modelsDir).map((p) => ({
    _rel: p.slice(root.length + 1),
    ...(JSON.parse(readFileSync(p, 'utf8')) as Omit<CorpusModel, '_rel'>),
  }))
  const benchmarks = JSON.parse(readFileSync(join(root, 'benchmarks.json'), 'utf8')) as {
    slug: string
    name: string
  }[]
  const results = models.flatMap((m) => (m.results ?? []).map((r) => ({ ...r, _m: m.name })))
  const findings: Finding[] = []
  const add = (severity: Finding['severity'], area: string, detail: string) =>
    findings.push({ severity, area, detail })

  // 1. provenance depth ------------------------------------------------------
  for (const m of models) {
    if (!m.specSources || Object.keys(m.specSources).length === 0)
      add('medium', 'provenance', `${m.name}: no specSources (spec fields uncited)`)
    if (!m.verificationNotes) add('low', 'provenance', `${m.name}: no verificationNotes`)
  }
  const bySource = new Map<string, number>()
  for (const r of results) bySource.set(r.source, (bySource.get(r.source) ?? 0) + 1)
  const selfPct = Math.round(((bySource.get('self-reported') ?? 0) / results.length) * 100)
  if (selfPct >= 70)
    add(
      'medium',
      'provenance',
      `${selfPct}% of ${results.length} results are self-reported (vendor) — the dataset skews to vendor-published numbers; independent cross-checks are sparse`,
    )

  // 2. self-reported vs independent divergence for the same (model, benchmark) ----
  for (const m of models) {
    const byBench = new Map<string, CorpusResult[]>()
    for (const r of m.results ?? []) {
      const g = byBench.get(r.benchmarkSlug) ?? []
      g.push(r)
      byBench.set(r.benchmarkSlug, g)
    }
    for (const [b, rows] of byBench) {
      const self = rows.find((r) => r.source === 'self-reported')
      const indep = rows.find((r) => r.source === 'independent')
      if (self && indep && self.score - indep.score >= DIVERGENCE_PT)
        add(
          'medium',
          'accuracy',
          `${m.name} · ${b}: self-reported ${self.score} vs independent ${indep.score} (+${(self.score - indep.score).toFixed(1)} vendor inflation)`,
        )
    }
  }

  // 3. effort-tier ordering: best tier must not trail a sibling on a shared benchmark ----
  const cohorts = new Map<string, CorpusModel[]>()
  for (const m of models) {
    if (m.effortLabel == null) continue
    const k = `${m.org}::${m.family}::${m.releaseDate}::${m.paramsB ?? 'null'}`
    const g = cohorts.get(k) ?? []
    g.push(m)
    cohorts.set(k, g)
  }
  for (const g of cohorts.values()) {
    if (g.length < 2) continue
    const best = g.find((m) => m.isBestConfig)
    if (!best) continue
    const bMap = new Map((best.results ?? []).map((r) => [r.benchmarkSlug, r.score]))
    for (const m of g) {
      if (m === best) continue
      for (const r of m.results ?? []) {
        const bs = bMap.get(r.benchmarkSlug)
        if (bs != null && r.score > bs + 0.5)
          add(
            'medium',
            'consistency',
            `${m.family} (${m.releaseDate}): '${m.effortLabel}' scores ${r.score} > best tier '${best.effortLabel}' ${bs} on ${r.benchmarkSlug}`,
          )
      }
    }
  }

  // 3b. benchmark-variant conflation: a result's own notes name a variant that doesn't match its
  // slug, so a harder/easier/saturated variant gets ranked against a different benchmark. This is
  // the single highest-impact quality issue an audit found — e.g. SWE-Bench Pro (64.6) filed under
  // the generic 'swe-bench' slug that elsewhere holds SWE-bench Verified (74–80), which inverts the
  // flagship coding ranking. Detectable because the corpus honestly records the variant in `notes`.
  // Match the benchmark PHRASE in notes, not a bare word — "pro"/"v2" also appear in model names
  // (o3-pro, deepseek-v2-5) and would false-positive. Note the `math` slug's benchmark IS MATH-500,
  // so a "MATH-500" note there is correct and gets no marker.
  const VARIANT_MARKERS: { slug: string; needle: RegExp; variant: string }[] = [
    { slug: 'swe-bench', needle: /swe-?bench pro/i, variant: 'SWE-Bench Pro' },
    { slug: 'arena-hard', needle: /arena-?hard v2/i, variant: 'Arena-Hard v2' },
    { slug: 'tau-bench', needle: /(τ²|tau-?2|tau²)/i, variant: 'τ²-Bench' },
    { slug: 'mmlu', needle: /mmlu-?redux/i, variant: 'MMLU-Redux' },
    { slug: 'bfcl', needle: /bfcl[\s-]?v3/i, variant: 'BFCL v3' },
    { slug: 'mmmu', needle: /mmmu-?pro/i, variant: 'MMMU-Pro' },
    { slug: 'terminal-bench', needle: /terminal-?bench 2/i, variant: 'Terminal-Bench 2' },
    { slug: 'mbpp', needle: /mbpp[\s-]?(plus|\+)/i, variant: 'MBPP+' },
    { slug: 'humaneval', needle: /humaneval[\s-]?(plus|\+)/i, variant: 'HumanEval+' },
  ]
  for (const m of models) {
    for (const r of m.results ?? []) {
      const notes = r.notes ?? ''
      for (const v of VARIANT_MARKERS) {
        if (r.benchmarkSlug === v.slug && v.needle.test(notes))
          add(
            'high',
            'comparability',
            `${m.name} · ${r.benchmarkSlug}=${r.score}: notes name "${v.variant}" but it is filed under the generic '${v.slug}' slug — not comparable to other '${v.slug}' rows`,
          )
      }
      // "average of X and Y" only conflates when X/Y are DIFFERENT benchmarks — an average of a
      // benchmark's own sub-metrics (IFEval instruct+prompt strict) is a legitimate single score.
      if (/\b(average|avg) of\b/i.test(notes)) {
        const nl = notes.toLowerCase()
        const other = benchmarks.find(
          (b) =>
            b.slug !== r.benchmarkSlug &&
            b.name.length >= 4 &&
            new RegExp(`\\b${b.name.toLowerCase().replace(/[^a-z0-9]+/g, '[^a-z0-9]?')}\\b`).test(
              nl,
            ),
        )
        if (other)
          add(
            'high',
            'comparability',
            `${m.name} · ${r.benchmarkSlug}=${r.score}: notes say this is an "average of" including ${other.name} — not a pure ${r.benchmarkSlug} score`,
          )
      }
    }
  }

  // 4. coverage --------------------------------------------------------------
  const zero = models.filter((m) => !(m.results ?? []).length)
  if (zero.length)
    add(
      'low',
      'coverage',
      `${zero.length} models carry ZERO benchmark results (unrated; lineage-only): ${zero
        .slice(0, 6)
        .map((m) => m.name)
        .join(', ')}${zero.length > 6 ? ' …' : ''}`,
    )
  const benchUse = new Map<string, number>()
  for (const r of results) benchUse.set(r.benchmarkSlug, (benchUse.get(r.benchmarkSlug) ?? 0) + 1)
  const thin = benchmarks.filter((b) => (benchUse.get(b.slug) ?? 0) < LOW_COVERAGE)
  if (thin.length)
    add(
      'low',
      'coverage',
      `${thin.length}/${benchmarks.length} benchmarks have < ${LOW_COVERAGE} results (little cross-model signal): ${thin
        .slice(0, 8)
        .map((b) => b.slug)
        .join(', ')}${thin.length > 8 ? ' …' : ''}`,
    )

  // 5. post-cutoff / price / dup -------------------------------------------------
  const post = models.filter((m) => m.releaseDate > CUTOFF)
  if (post.length)
    add(
      'info',
      'accuracy',
      `${post.length} models postdate ${CUTOFF} — externally unverifiable at audit time: ${post
        .map((m) => m.name)
        .join(', ')}`,
    )
  for (const m of models)
    if (m.price && m.price.output < m.price.input)
      add(
        'low',
        'spec',
        `${m.name}: output price ${m.price.output} < input ${m.price.input} (unusual)`,
      )
  const names = new Map<string, number>()
  for (const m of models)
    names.set(m.name.toLowerCase(), (names.get(m.name.toLowerCase()) ?? 0) + 1)
  for (const [n, c] of names)
    if (c > 1) add('high', 'metadata', `duplicate model name '${n}' (×${c})`)

  // 6. census / shortlist completeness --------------------------------------
  const censusPath = join(root, 'census.json')
  const shortlistPath = join(root, 'shortlist.json')
  try {
    const census = JSON.parse(readFileSync(censusPath, 'utf8')) as {
      stats?: { canonical?: number }
    }
    const shortlist = JSON.parse(readFileSync(shortlistPath, 'utf8')) as {
      stats?: { canonical?: number }
    }
    const canon = census.stats?.canonical
    const short = shortlist.stats?.canonical
    if (canon)
      add(
        'info',
        'completeness',
        `corpus builds ${models.length} models; the Phase-1 census identified ${canon} canonical models and the curated shortlist ${short ?? '?'} — the corpus is a deliberate curation slice, not the full universe`,
      )
  } catch {
    /* census/shortlist optional */
  }

  const stats = {
    models: models.length,
    results: results.length,
    selfReportedPct: selfPct,
    zeroResultModels: zero.length,
    thinBenchmarks: thin.length,
    postCutoffModels: post.length,
    findings: findings.length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
  }
  return { findings, stats }
}

if (import.meta.main) {
  const root = process.argv[2] ?? 'corpus'
  const strict = process.argv.includes('--strict')
  const { findings, stats } = auditCorpus(root)
  const order = { high: 0, medium: 1, low: 2, info: 3 } as const
  findings.sort((a, b) => order[a.severity] - order[b.severity])
  const icon = { high: '🔴', medium: '🟠', low: '🟡', info: 'ℹ️ ' } as const
  console.log(`\nDATA-QUALITY AUDIT · ${root}/`)
  console.log(
    `${stats.models} models · ${stats.results} results · ${stats.selfReportedPct}% self-reported · ` +
      `${stats.zeroResultModels} zero-result · ${stats.thinBenchmarks} thin benchmarks · ${stats.postCutoffModels} post-cutoff\n`,
  )
  for (const f of findings) console.log(`${icon[f.severity]} [${f.area}] ${f.detail}`)
  console.log(
    `\n${findings.length} observations — ${stats.high} high, ${stats.medium} medium, ` +
      `${findings.filter((f) => f.severity === 'low').length} low, ` +
      `${findings.filter((f) => f.severity === 'info').length} info.`,
  )
  if (strict && (stats.high ?? 0) > 0) process.exit(1)
}
