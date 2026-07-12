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
    await expect(page.getByTestId('params-point')).toHaveCount(35)
  })

  test('params-scatter points carry tooltips and link to the model', async ({ page }) => {
    await gotoHydrated(page, '/benchmarks/gpqa')
    await page.getByTestId('params-scatter').scrollIntoViewIfNeeded()
    // .last() sits at the bottom of the chart, clear of the sticky topbar
    const point = page.getByTestId('params-point').last()
    await point.hover()
    const tip = page.getByTestId('chart-tip')
    await expect(tip).toBeVisible()
    await point.click()
    await expect(page).toHaveURL(/\/models\/[a-z0-9-]+$/)
  })

  test('histogram bins reveal their count on hover', async ({ page }) => {
    await gotoHydrated(page, '/benchmarks/gpqa')
    // hover the tallest region of the distribution — every bin carries a tooltip
    await page.getByTestId('histogram').locator('div').nth(5).hover()
    await expect(page.getByTestId('chart-tip')).toContainText(/model/)
  })

  test('unknown benchmark 404s', async ({ page }) => {
    const res = await page.goto('/benchmarks/vibes')
    expect(res?.status()).toBe(404)
  })
})
