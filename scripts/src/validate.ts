import { type Dataset, loadDataset } from './lib/load'

/**
 * Curated-data gate (plan commit 7): Zod-parses every file, then enforces the
 * cross-file invariants no single-file schema can see. CI runs this on every change;
 * bad data cannot ship (ARCHITECTURE §5.1).
 */

export interface ValidationReport {
  errors: string[]
  stats: {
    organizations: number
    families: number
    models: number
    benchmarks: number
    results: number
    gpus: number
    pricing: number
    throughput: number
  }
}

export async function validateData(root: string): Promise<ValidationReport> {
  const ds = await loadDataset(root)
  const errors = [...ds.errors]
  crossChecks(ds, errors)
  return {
    errors,
    stats: {
      organizations: ds.organizations.length,
      families: ds.families.length,
      models: ds.models.length,
      benchmarks: ds.benchmarks.length,
      results: [...ds.results.values()].reduce((n, rows) => n + rows.length, 0),
      gpus: ds.hardware.length,
      pricing: ds.pricing.length,
      throughput: ds.throughput.length,
    },
  }
}

function dupes(slugs: string[]): string[] {
  const seen = new Set<string>()
  const out = new Set<string>()
  for (const s of slugs) {
    if (seen.has(s)) out.add(s)
    seen.add(s)
  }
  return [...out]
}

function crossChecks(ds: Dataset, errors: string[]): void {
  const orgSlugs = new Set(ds.organizations.map((o) => o.slug))
  const familyBySlug = new Map(ds.families.map((f) => [f.slug, f]))
  const modelBySlug = new Map(ds.models.map((m) => [m.slug, m]))
  const benchBySlug = new Map(ds.benchmarks.map((b) => [b.slug, b]))
  const gpuSlugs = new Set(ds.hardware.map((g) => g.slug))

  for (const [entity, slugs] of [
    ['organizations', ds.organizations.map((o) => o.slug)],
    ['families', ds.families.map((f) => f.slug)],
    ['models', ds.models.map((m) => m.slug)],
    ['benchmarks', ds.benchmarks.map((b) => b.slug)],
    ['hardware', ds.hardware.map((g) => g.slug)],
  ] as const) {
    for (const d of dupes([...slugs])) errors.push(`${entity}: duplicate slug '${d}'`)
  }

  for (const f of ds.families) {
    if (!orgSlugs.has(f.orgSlug)) {
      errors.push(`families/${f.slug}: unknown orgSlug '${f.orgSlug}'`)
    }
  }

  for (const m of ds.models) {
    const where = `models/${ds.modelDirOrg.get(m.slug)}/${m.slug}.json`
    if (!orgSlugs.has(m.orgSlug)) errors.push(`${where}: unknown orgSlug '${m.orgSlug}'`)
    const fam = familyBySlug.get(m.familySlug)
    if (!fam) {
      errors.push(`${where}: unknown familySlug '${m.familySlug}'`)
    } else if (fam.orgSlug !== m.orgSlug) {
      errors.push(
        `${where}: family '${fam.slug}' belongs to org '${fam.orgSlug}', model says '${m.orgSlug}'`,
      )
    }
    const dirOrg = ds.modelDirOrg.get(m.slug)
    if (dirOrg && dirOrg !== m.orgSlug) {
      errors.push(`${where}: file lives under models/${dirOrg}/ but orgSlug is '${m.orgSlug}'`)
    }
    if (m.predecessor) {
      const prev = modelBySlug.get(m.predecessor)
      if (!prev) {
        errors.push(`${where}: predecessor '${m.predecessor}' does not exist`)
      } else {
        if (prev.familySlug !== m.familySlug) {
          errors.push(`${where}: predecessor '${m.predecessor}' is in a different family`)
        }
        if (prev.releaseDate >= m.releaseDate) {
          errors.push(`${where}: predecessor '${m.predecessor}' is not older than this model`)
        }
      }
    }
    if (m.activeParamsB != null && m.paramsB != null && m.activeParamsB > m.paramsB) {
      errors.push(`${where}: activeParamsB ${m.activeParamsB} exceeds paramsB ${m.paramsB}`)
    }
    if (m.vramQ4Gb != null && m.vramFp16Gb != null && m.vramQ4Gb >= m.vramFp16Gb) {
      errors.push(`${where}: vramQ4Gb should be well below vramFp16Gb`)
    }
    if (m.capabilities.vision !== m.modalities.includes('vision')) {
      errors.push(`${where}: capabilities.vision must mirror 'vision' in modalities`)
    }
  }

  for (const [benchSlug, rows] of ds.results) {
    const rel = `results/${benchSlug}.csv`
    const bench = benchBySlug.get(benchSlug)
    if (!bench) {
      errors.push(`${rel}: no benchmark named '${benchSlug}'`)
      continue
    }
    const span = bench.normMax - bench.normMin
    const lo = bench.normMin - span * 0.5
    const hi = bench.normMax + span * 0.1
    const seen = new Set<string>()
    for (const r of rows) {
      if (!modelBySlug.has(r.modelSlug)) {
        errors.push(`${rel}: unknown model '${r.modelSlug}'`)
      }
      const key = `${r.modelSlug}|${r.source}`
      if (seen.has(key)) {
        errors.push(`${rel}: duplicate (model, source) row '${r.modelSlug}', '${r.source}'`)
      }
      seen.add(key)
      if (r.score < lo || r.score > hi) {
        errors.push(
          `${rel}: score ${r.score} for '${r.modelSlug}' is far outside bounds [${bench.normMin}, ${bench.normMax}]`,
        )
      }
    }
  }

  for (const p of ds.pricing) {
    if (!modelBySlug.has(p.modelSlug)) {
      errors.push(`pricing/api-pricing.csv: unknown model '${p.modelSlug}'`)
    }
  }

  for (const t of ds.throughput) {
    const rel = 'throughput/estimates.csv'
    const m = modelBySlug.get(t.modelSlug)
    if (!m) {
      errors.push(`${rel}: unknown model '${t.modelSlug}'`)
    } else if (!m.quants.includes(t.quantMethod)) {
      errors.push(`${rel}: model '${t.modelSlug}' has no quant '${t.quantMethod}'`)
    }
    if (!gpuSlugs.has(t.hardwareSlug)) {
      errors.push(`${rel}: unknown hardware '${t.hardwareSlug}'`)
    }
  }

  // Effort/compute-tier cohorts (same weights, different serving budget): models sharing
  // org+family+releaseDate+paramsB AND actually carrying a non-null effortLabel are
  // configuration siblings — exactly one must be the default tier and exactly one the best
  // tier. Models with effortLabel=null are exempt from cohort grouping entirely: two
  // genuinely different models (different names/sizes, e.g. Claude 3 Opus vs Sonnet, GPT-4.1
  // vs mini vs nano) can share org+family+releaseDate+null-paramsB (undisclosed param count)
  // without being effort-tier siblings of each other. (Same-day DIFFERENT-size releases with
  // disclosed params, e.g. Qwen3 235B/32B/8B, also land in separate cohorts because paramsB
  // differs — this check only ever fires among models that opted into the effort-tier axis.)
  const cohorts = new Map<string, typeof ds.models>()
  for (const m of ds.models) {
    if (m.effortLabel == null) continue
    const key = `${m.orgSlug}::${m.familySlug}::${m.releaseDate}::${m.paramsB ?? 'null'}`
    const group = cohorts.get(key) ?? []
    group.push(m)
    cohorts.set(key, group)
  }
  for (const [key, group] of cohorts) {
    if (group.length < 2) continue
    const defaults = group.filter((m) => m.isDefaultConfig)
    const bests = group.filter((m) => m.isBestConfig)
    if (defaults.length !== 1) {
      errors.push(
        `config cohort '${key}': expected exactly 1 isDefaultConfig among ${group.length} siblings, found ${defaults.length}`,
      )
    }
    if (bests.length !== 1) {
      errors.push(
        `config cohort '${key}': expected exactly 1 isBestConfig among ${group.length} siblings, found ${bests.length}`,
      )
    }
  }

  // Models must price-match: a model with price in its file should have a pricing row and vice versa.
  const pricedModels = new Set(ds.pricing.map((p) => p.modelSlug))
  for (const m of ds.models) {
    if (m.price && !pricedModels.has(m.slug)) {
      errors.push(`models/${m.orgSlug}/${m.slug}.json: has price but no pricing CSV row`)
    }
    if (!m.price && pricedModels.has(m.slug)) {
      errors.push(`pricing/api-pricing.csv: '${m.slug}' priced here but model file has price=null`)
    }
  }
}

if (import.meta.main) {
  const root = process.argv[2] ?? 'data'
  const report = await validateData(root)
  const s = report.stats
  if (report.errors.length > 0) {
    console.error(`✗ ${report.errors.length} validation error(s) in ${root}/:\n`)
    for (const e of report.errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  console.log(
    `✓ ${root}/ valid — ${s.models} models · ${s.organizations} orgs · ${s.benchmarks} benchmarks · ${s.gpus} gpus · ${s.results} results · ${s.pricing} pricing · ${s.throughput} throughput`,
  )
}
