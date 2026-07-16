import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { buildSnapshot, parseDataVersionOutput } from './snapshot'

const DATA = join(import.meta.dirname, '..', '..', 'data')

describe('parseDataVersionOutput', () => {
  it('parses the version out of a real wrangler --json result row', () => {
    expect(parseDataVersionOutput('[{"results":[{"value":"12"}]}]')).toBe(12)
  })

  it('returns 0 when meta.data_version has never been set (empty result set)', () => {
    expect(parseDataVersionOutput('[{"results":[]}]')).toBe(0)
  })

  it('throws instead of silently returning 0 when wrangler prints non-JSON noise', () => {
    // e.g. an update-notifier banner or deprecation warning printed ahead of the JSON,
    // even on a zero exit code — must not be confused with "no version row yet"
    expect(() => parseDataVersionOutput('⚠ wrangler update available\n[{"results":[]}]')).toThrow(
      /could not parse/i,
    )
  })

  it('throws on a non-numeric stored value instead of returning NaN', () => {
    expect(() => parseDataVersionOutput('[{"results":[{"value":"not-a-number"}]}]')).toThrow(
      /not a valid integer/i,
    )
  })
})

describe('catalog snapshot (C3 golden shape)', () => {
  it('builds a schema-valid snapshot over the real dataset', async () => {
    const snap = await buildSnapshot(DATA, 1)
    expect(snap.version).toBe(1)
    expect(snap.asOfIso).toBe('2026-07-01')
    // relative, not hardcoded: the real corpus's size is ~463 models / 78 orgs / 122
    // benchmarks, not the old 55-model synthetic seed's fixed counts.
    expect(snap.models.length).toBeGreaterThan(400)
    expect(snap.benchmarks.length).toBeGreaterThan(100)
    expect(snap.gpus).toHaveLength(12)
  })

  it('carries precomputed rating/rank and design-parity fields for a real, broadly-covered model', async () => {
    const snap = await buildSnapshot(DATA, 1)
    const llama = snap.models.find((m) => m.slug === 'llama-3-1-405b')
    expect(llama).toMatchObject({
      org: 'Meta',
      family: 'Llama 3.1',
      open: true,
      index: 1240.5, // Frontier Elo rating (D21)
      rank: 173,
      ranked: true,
      ctxK: 128,
    })
    expect(llama?.bench.arena).toBe(1229)
    expect(llama?.price).toBeNull()
    expect(llama?.categoryIdx.coding).toBe(86.6)
  })

  it('stays far under the 1.5 MB gzip budget at real scale', async () => {
    const snap = await buildSnapshot(DATA, 1)
    const gz = gzipSync(JSON.stringify(snap)).length
    expect(gz).toBeLessThan(1.5 * 1024 * 1024)
    expect(gz).toBeGreaterThan(1_000) // sanity: not empty
  })
})
