import { BENCHMARK_CATEGORIES } from '@modelbeats/shared'
import { createFileRoute } from '@tanstack/react-router'
import { SITE_ORIGIN } from '#/lib/seo'

/** sitemap.xml generated from the live catalog (arch §6), cached per C7. */
export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const { loadCatalog } = await import('#/server/catalog')
        const catalog = await loadCatalog()
        const staticPaths = [
          '/',
          '/rankings',
          '/models',
          '/compare',
          '/hardware',
          '/finetune',
          '/benchmarks',
          '/methodology',
          '/search',
          '/saved',
        ]
        const paths = [
          ...staticPaths,
          ...BENCHMARK_CATEGORIES.map((c) => `/rankings/${c}`),
          ...catalog.models.map((m) => `/models/${m.slug}`),
          ...[...new Set(catalog.models.map((m) => m.orgSlug))].map((s) => `/organizations/${s}`),
          ...[...new Set(catalog.models.map((m) => m.familySlug))].map((s) => `/families/${s}`),
          ...catalog.benchmarks.map((b) => `/benchmarks/${b.slug}`),
        ]
        const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths
  .map((p) => `  <url><loc>${SITE_ORIGIN}${p}</loc><lastmod>${catalog.asOfIso}</lastmod></url>`)
  .join('\n')}
</urlset>`
        return new Response(body, {
          headers: {
            'content-type': 'application/xml',
            'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400',
            'x-data-version': String(catalog.version),
          },
        })
      },
    },
  },
})
