import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseCsv, toCsv } from './lib/csv'
import { validateData } from './validate'

const fixture = (name: string) => join(import.meta.dirname, '..', 'fixtures', name)

describe('validateData', () => {
  it('valid fixture dataset produces zero errors and correct stats', async () => {
    const report = await validateData(fixture('valid'))
    expect(report.errors).toEqual([])
    expect(report.stats).toEqual({
      organizations: 2,
      families: 2,
      models: 3,
      benchmarks: 2,
      results: 6,
      gpus: 2,
      pricing: 2,
      throughput: 1,
    })
  })

  it('flags a model referencing a nonexistent family', async () => {
    const { errors } = await validateData(fixture('invalid-broken-ref'))
    expect(errors.some((e) => e.includes("unknown familySlug 'ghost'"))).toBe(true)
  })

  it('flags an unknown provenance enum in results', async () => {
    const { errors } = await validateData(fixture('invalid-bad-enum'))
    expect(errors.some((e) => e.includes('results/genbench.csv') && e.includes('source'))).toBe(
      true,
    )
  })

  it('flags a score far outside the benchmark bounds', async () => {
    const { errors } = await validateData(fixture('invalid-out-of-range'))
    expect(errors.some((e) => e.includes('far outside bounds'))).toBe(true)
  })

  it('flags duplicate (model, source) result rows', async () => {
    const { errors } = await validateData(fixture('invalid-dup'))
    expect(errors.some((e) => e.includes('duplicate (model, source)'))).toBe(true)
  })
})

describe('csv codec', () => {
  it('round-trips quoted fields with commas and escaped quotes', () => {
    const csv = toCsv(
      ['a', 'b'],
      [
        ['plain', 'with, comma'],
        ['say ""hi""'.replaceAll('""', '"'), ''],
      ],
    )
    const rows = parseCsv(csv)
    expect(rows).toEqual([
      { a: 'plain', b: 'with, comma' },
      { a: 'say "hi"', b: '' },
    ])
  })
  it('rejects ragged rows', () => {
    expect(() => parseCsv('a,b\n1,2,3')).toThrow(/expected 2 cells/)
  })
})
