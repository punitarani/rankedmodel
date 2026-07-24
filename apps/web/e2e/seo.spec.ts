import { expect, test } from '@playwright/test'
import { datasetCounts } from './helpers'

test.describe('seo surface', () => {
  test('sitemap covers every entity route from the live catalog', async ({ request }) => {
    const { models, organizations, families, benchmarks } = datasetCounts()
    const res = await request.get('/sitemap.xml')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('application/xml')
    const body = await res.text()
    const locs = body.match(/<loc>/g)?.length ?? 0
    // 10 static + 7 categories + every model + every org + every family + every benchmark
    expect(locs).toBe(10 + 7 + models + organizations + families + benchmarks)
    expect(body).toContain('https://modelbeats.com/models/gpt-5-6-sol')
  })

  test('robots allows crawling, hides /debug, points at the sitemap', async ({ request }) => {
    const body = await (await request.get('/robots.txt')).text()
    expect(body).toContain('Disallow: /debug/')
    expect(body).toContain('Sitemap: https://modelbeats.com/sitemap.xml')
  })

  test('model pages ship parseable JSON-LD + canonical', async ({ request }) => {
    const html = await (await request.get('/models/gpt-5-6-sol')).text()
    const m = html.match(/<script[^>]*application\/ld\+json[^>]*>(.*?)<\/script>/s)
    expect(m).not.toBeNull()
    const ld = JSON.parse((m as RegExpMatchArray)[1] as string)
    expect(ld['@type']).toBe('SoftwareApplication')
    expect(ld.name).toBe('GPT-5.6 Sol')
    expect(ld.creator.name).toBe('OpenAI')
    expect(html).toContain('rel="canonical"')
    expect(html).toContain('https://modelbeats.com/models/gpt-5-6-sol')
  })
})

test.describe('cache headers (C7)', () => {
  test('catalog JSON is immutable; sitemap is SWR-cached', async ({ request }) => {
    const sitemap = await request.get('/sitemap.xml')
    expect(sitemap.headers()['cache-control']).toContain('stale-while-revalidate')
    const version = sitemap.headers()['x-data-version']
    expect(Number(version)).toBeGreaterThan(0)
    const catalog = await request.get(`/api/catalog/v${version}.json`)
    expect(catalog.status()).toBe(200)
    expect(catalog.headers()['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(catalog.headers()['x-data-version']).toBe(version)
  })
})
