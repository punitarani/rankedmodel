import { env } from 'cloudflare:test'
import type { CatalogSnapshot } from '@rankedmodel/shared'
import { describe, expect, it } from 'vitest'
import { loadCatalog } from './catalog'

const kvSnapshot: CatalogSnapshot = {
  version: 1,
  asOf: 'July 11, 2026',
  asOfIso: '2026-07-11',
  benchmarks: [
    {
      slug: 'genbench',
      name: 'GenBench',
      category: 'knowledge',
      unit: '%',
      description: 'test',
      normMin: 40,
      normMax: 100,
    },
  ],
  gpus: [{ slug: 'rtx4090', name: 'RTX 4090 24GB', kind: 'consumer', vramGb: 24 }],
  models: [
    {
      slug: 'strato-2',
      name: 'Strato 2',
      org: 'Acme AI',
      orgSlug: 'acme-ai',
      family: 'Strato',
      familySlug: 'strato',
      date: '2026-03-01',
      status: 'released',
      openness: 'closed',
      open: false,
      predecessor: null,
      params: null,
      active: null,
      ctxK: 200,
      arch: 'MoE (undisclosed)',
      archClass: 'moe',
      license: 'Proprietary',
      langCount: 40,
      modalities: ['text'],
      caps: {
        reasoning: true,
        coding: true,
        vision: false,
        functionCalling: true,
        toolUse: true,
        agentic: true,
      },
      apiAvailable: true,
      bench: { genbench: 88.1 },
      benchSources: { genbench: 'curated' },
      price: { input: 2, output: 8 },
      vramQ4: null,
      vramFp16: null,
      quants: [],
      tps4090: null,
      tpsNote: null,
      links: {},
      note: 'test model',
      index: 80.2,
      rank: 1,
      categoryIdx: {
        'human-preference': null,
        knowledge: 80.2,
        reasoning: null,
        coding: null,
        math: null,
        vision: null,
        agents: null,
      },
    },
  ],
}

async function setVersion(v: number) {
  await env.DB.prepare(
    `INSERT INTO meta (key, value) VALUES ('data_version', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
  )
    .bind(String(v))
    .run()
}

describe('catalog spine (getCatalog server logic)', () => {
  it('serves and parses the KV snapshot for the current version', async () => {
    await setVersion(1)
    await env.CATALOG.put('catalog:v1', JSON.stringify(kvSnapshot))
    const catalog = await loadCatalog()
    expect(catalog.version).toBe(1)
    expect(catalog.models[0]?.slug).toBe('strato-2')
    expect(catalog.models[0]?.index).toBe(80.2)
  })

  it('rebuilds from D1 (source of truth) when the KV blob is missing', async () => {
    await setVersion(3) // no catalog:v3 in KV
    const stmts = [
      `INSERT INTO meta (key, value) VALUES ('as_of', 'July 11, 2026'), ('as_of_iso', '2026-07-11') ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      `INSERT INTO organizations (id, slug, name, type) VALUES (1, 'acme-ai', 'Acme AI', 'lab')`,
      `INSERT INTO model_families (id, slug, org_id, name) VALUES (1, 'strato', 1, 'Strato')`,
      `INSERT INTO models (id, slug, org_id, family_id, name, release_date, status, openness, license,
        arch_class, arch_display, context_length, modalities, capabilities, api_available, links, note, quants)
       VALUES (1, 'strato-2', 1, 1, 'Strato 2', '2026-03-01', 'released', 'closed', 'Proprietary',
        'moe', 'MoE (undisclosed)', 200000, '["text"]',
        '{"reasoning":true,"coding":true,"vision":false,"functionCalling":true,"toolUse":true,"agentic":true}',
        1, '{}', 'test model', '[]')`,
      `INSERT INTO benchmarks (id, slug, name, category, unit, description, norm_min, norm_max)
       VALUES (1, 'genbench', 'GenBench', 'knowledge', '%', 'test', 40, 100)`,
      `INSERT INTO benchmark_results (id, model_id, benchmark_id, score, source) VALUES (1, 1, 1, 88.1, 'curated')`,
      `INSERT INTO model_scores (model_id, overall_index, rank_overall, knowledge_index, computed_at)
       VALUES (1, 80.2, 1, 80.2, '2026-07-11')`,
      `INSERT INTO model_pricing (id, model_id, provider, input_per_mtok, output_per_mtok, effective_date)
       VALUES (1, 1, 'acme-ai', 2, 8, '2026-03-01')`,
    ]
    for (const sql of stmts) await env.DB.prepare(sql).run()

    const catalog = await loadCatalog()
    expect(catalog.version).toBe(3)
    expect(catalog.models).toHaveLength(1)
    expect(catalog.models[0]).toMatchObject({
      slug: 'strato-2',
      org: 'Acme AI',
      ctxK: 200,
      index: 80.2,
      rank: 1,
      price: { input: 2, output: 8 },
    })
    expect(catalog.models[0]?.bench.genbench).toBe(88.1)
  })

  it('fails loudly when nothing has been published', async () => {
    // storage is per-file here, not per-test — clear the version row explicitly
    await env.DB.prepare("DELETE FROM meta WHERE key='data_version'").run()
    await expect(loadCatalog()).rejects.toThrow(/publish-data/)
  })
})
