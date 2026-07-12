import { expect, test } from '@playwright/test'
import { gotoHydrated } from './helpers'

test.describe('benchmarks', () => {
  test('index groups all 10 benchmarks by category with leaders', async ({ page }) => {
    await gotoHydrated(page, '/benchmarks')
    await expect(page.getByTestId('benchmark-card')).toHaveCount(10)
    const swe = page.getByTestId('benchmark-card').filter({ hasText: 'SWE-bench Verified' })
    await expect(swe).toContainText('leader')
    await expect(swe).toContainText('Claude Opus 4.8')
  })

  test('detail leaderboard ranks the field with provenance badges (D8)', async ({ page }) => {
    await gotoHydrated(page, '/benchmarks/swe')
    const first = page.getByTestId('leaderboard-row').first()
    await expect(first).toContainText('Claude Opus 4.8')
    await expect(first).toContainText('82.4%')
    await expect(first.getByTestId('provenance-badge')).toHaveText('curated')
    // full field: all 55 models have swe scores
    await expect(page.getByTestId('leaderboard-row')).toHaveCount(55)
  })

  test('distribution histogram + open-only params scatter render', async ({ page }) => {
    await gotoHydrated(page, '/benchmarks/gpqa')
    await expect(page.getByTestId('histogram').locator('div')).toHaveCount(10)
    // open models with disclosed params carry the scatter
    const points = page.getByTestId('params-scatter').locator('circle')
    await expect(points).toHaveCount(35)
  })

  test('unknown benchmark 404s', async ({ page }) => {
    const res = await page.goto('/benchmarks/vibes')
    expect(res?.status()).toBe(404)
  })
})
