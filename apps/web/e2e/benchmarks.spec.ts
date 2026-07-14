import { expect, test } from '@playwright/test'
import { datasetCounts, gotoHydrated } from './helpers'

test.describe('benchmarks', () => {
  test('index groups every tracked benchmark by category with leaders', async ({ page }) => {
    const { benchmarks } = datasetCounts()
    await gotoHydrated(page, '/benchmarks')
    await expect(page.getByTestId('benchmark-card')).toHaveCount(benchmarks)
    // anchored to the card's name (first text in DOM order) — SWE-bench Pro's own description
    // mentions "SWE-bench Verified" in passing, so an unanchored substring match hits both cards
    const swe = page.getByTestId('benchmark-card').filter({ hasText: /^SWE-bench Verified/ })
    await expect(swe).toContainText('leader')
    // real leaderboard leader: Claude Fable 5 (95.0%, Vals AI independent re-run)
    await expect(swe).toContainText('Claude Fable 5')
  })

  test('detail leaderboard ranks the field with provenance badges (D8)', async ({ page }) => {
    await gotoHydrated(page, '/benchmarks/swe-bench')
    const first = page.getByTestId('leaderboard-row').first()
    await expect(first).toContainText('Claude Fable 5')
    await expect(first).toContainText('95.0%')
    await expect(first.getByTestId('provenance-badge')).toHaveText('independent')
    // real field: 99 of the 534 models carry a SWE-bench Verified score
    await expect(page.getByTestId('leaderboard-row')).toHaveCount(99)
  })

  test('distribution histogram + open-only params scatter render', async ({ page }) => {
    await gotoHydrated(page, '/benchmarks/gpqa')
    await expect(page.getByTestId('histogram').locator('div')).toHaveCount(10)
    // open models with disclosed params carry the scatter (real GPQA field, expanded catalog)
    await expect(page.getByTestId('params-point')).toHaveCount(148)
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
