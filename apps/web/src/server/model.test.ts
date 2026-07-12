import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { loadModel } from './model'

describe('getModel deep payload', () => {
  it('returns full detail with provenance, quants, pricing and lineage', async () => {
    const stmts = [
      `INSERT INTO organizations (id, slug, name, type) VALUES (1, 'acme-ai', 'Acme AI', 'lab')`,
      `INSERT INTO model_families (id, slug, org_id, name) VALUES (1, 'strato', 1, 'Strato')`,
      `INSERT INTO models (id, slug, org_id, family_id, name, release_date, status, openness, license,
        arch_class, arch_display, context_length, modalities, capabilities, api_available, links, note, quants, vram_q4_gb)
       VALUES (1, 'strato-1', 1, 1, 'Strato 1', '2025-06-01', 'released', 'open-weights', 'Apache 2.0',
        'dense', 'Dense', 128000, '["text"]',
        '{"reasoning":false,"coding":true,"vision":false,"functionCalling":true,"toolUse":true,"agentic":false}',
        1, '{}', 'first', '["GGUF Q4"]', 4.2),
        (2, 'strato-2', 1, 1, 'Strato 2', '2026-03-01', 'released', 'open-weights', 'Apache 2.0',
        'dense', 'Dense', 128000, '["text"]',
        '{"reasoning":true,"coding":true,"vision":false,"functionCalling":true,"toolUse":true,"agentic":false}',
        1, '{}', 'second', '["GGUF Q4"]', 8.4)`,
      `UPDATE models SET predecessor_id = 1 WHERE id = 2`,
      `INSERT INTO benchmarks (id, slug, name, category, unit, description, norm_min, norm_max)
       VALUES (1, 'genbench', 'GenBench', 'knowledge', '%', 'test', 40, 100)`,
      `INSERT INTO benchmark_results (id, model_id, benchmark_id, score, score_normalized, source)
       VALUES (1, 2, 1, 88.1, 0.801, 'curated'), (2, 2, 1, 90.0, 0.833, 'independent')`,
      `INSERT INTO quantizations (id, model_id, method, bits, min_vram_gb) VALUES (1, 2, 'GGUF Q4', 4.5, 8.4)`,
      `INSERT INTO hardware_profiles (id, slug, name, kind, vram_gb) VALUES (1, 'rtx4090', 'RTX 4090 24GB', 'consumer', 24)`,
      `INSERT INTO throughput_estimates (id, model_id, quantization_id, hardware_id, framework, tokens_per_sec)
       VALUES (1, 2, 1, 1, 'llama.cpp', 140)`,
      `INSERT INTO model_pricing (id, model_id, provider, input_per_mtok, output_per_mtok, effective_date)
       VALUES (1, 2, 'acme-ai', 0.1, 0.4, '2026-03-01')`,
    ]
    for (const sql of stmts) await env.DB.prepare(sql).run()

    const detail = await loadModel('strato-2')
    expect(detail).not.toBeNull()
    expect(detail?.results).toHaveLength(2) // multi-source provenance preserved
    expect(detail?.results.map((r) => r.source).sort()).toEqual(['curated', 'independent'])
    expect(detail?.quantizations[0]).toMatchObject({ method: 'GGUF Q4', minVramGb: 8.4 })
    expect(detail?.throughput[0]).toMatchObject({ hardwareSlug: 'rtx4090', tokensPerSec: 140 })
    expect(detail?.pricing[0]).toMatchObject({ provider: 'acme-ai', outputPerMtok: 0.4 })
    expect(detail?.lineage).toEqual({ predecessor: 'strato-1', successors: [] })

    const prev = await loadModel('strato-1')
    expect(prev?.lineage).toEqual({ predecessor: null, successors: ['strato-2'] })
  })

  it('returns null for unknown slugs', async () => {
    expect(await loadModel('missing-model')).toBeNull()
  })
})
