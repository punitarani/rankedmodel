import { expect, test } from '@playwright/test'
import { datasetCounts, gotoHydrated, pickOption } from './helpers'

test.describe('dashboard overview', () => {
  test('stat strip reflects the real catalog', async ({ page }) => {
    const { models, organizations } = datasetCounts()
    await gotoHydrated(page, '/')
    const cards = page.getByTestId('stat-card')
    await expect(cards).toHaveCount(4)
    await expect(cards.nth(0)).toContainText(String(models))
    await expect(cards.nth(0)).toContainText(`${organizations} organizations`)
    // Open–closed gap is computed on the universal index (arena covers only a sliver), so it's
    // always a real number, and the leader is the top-ranked open model.
    await expect(cards.nth(3)).toContainText('idx')
    await expect(cards.nth(3)).toContainText('Qwen3.6-27B leads open')
  })

  test('scatter plots every priced+ranked model; movers show real lineage gains', async ({
    page,
  }) => {
    await gotoHydrated(page, '/')
    // scatter is now index-vs-price over every priced, rank-eligible model (114 in the real
    // corpus) — not the 6-point arena intersection.
    const points = page.getByTestId('scatter-point')
    await expect(points.first()).toBeVisible()
    expect(await points.count()).toBeGreaterThan(50)
    const movers = page.getByTestId('movers')
    // real top mover is a rank-eligible family edge; the old 0-index-config phantoms are gone
    await expect(movers).toContainText('Gemini 1.0 Pro')
    await expect(movers).toContainText('+45.9')
  })

  test('y-axis auto-zooms to the data instead of the fixed 0–100 axis', async ({ page }) => {
    await gotoHydrated(page, '/')
    // The old axis was a fixed 0–100 with ticks {20,40,60,80}. Fitted to the priced+ranked index
    // range, the dead low band is gone: the axis lifts off the floor (min tick ≥ 20 — Claude 1's
    // low-but-now-ranked 22.7 sets the real floor) while still reaching the frontier (max tick ≥
    // 80), with round, evenly-spaced interior ticks that frame it.
    const ticks = (await page.getByTestId('y-tick').allTextContents()).map(Number)
    expect(ticks.length).toBeGreaterThanOrEqual(3)
    expect(Math.min(...ticks)).toBeGreaterThanOrEqual(20)
    expect(Math.max(...ticks)).toBeGreaterThanOrEqual(80)
    for (const t of ticks) expect(t % 5).toBe(0)
  })

  test('legend toggles filter the scatter camps and never empty the plot', async ({ page }) => {
    await gotoHydrated(page, '/')
    const points = page.getByTestId('scatter-point')
    const total = await points.count()
    expect(total).toBeGreaterThan(50)

    // Hide the closed camp → fewer points remain, and the y-axis stays fitted to them.
    await page.getByTestId('legend-closed').click()
    await expect(page.getByTestId('legend-closed')).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(async () => points.count()).toBeLessThan(total)
    expect(await points.count()).toBeGreaterThan(0)
    expect((await page.getByTestId('y-tick').allTextContents()).length).toBeGreaterThan(0)

    // Clicking the last visible camp restores both (the plot never goes empty).
    await page.getByTestId('legend-open').click()
    await expect(page.getByTestId('legend-closed')).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => points.count()).toBe(total)
  })

  test('scatter tooltip appears on hover and on keyboard focus', async ({ page }) => {
    await gotoHydrated(page, '/')
    // Gemini 3.1 Pro is priced + rank-eligible, so it's a labeled scatter point
    const point = page.locator('a[aria-label^="Gemini 3.1 Pro —"]')
    await point.hover()
    const tip = page.getByTestId('chart-tip')
    await expect(tip).toBeVisible()
    await expect(tip).toContainText('Gemini 3.1 Pro')
    await expect(tip).toContainText('index')
    await page.mouse.move(0, 0)
    await expect(tip).toHaveCount(0)
    // keyboard parity: the same details on focus (dataviz interaction rule)
    await point.focus()
    await expect(page.getByTestId('chart-tip')).toContainText('Gemini 3.1 Pro')
  })

  test('top-ranked rail is ordered by index and quick compare navigates', async ({ page }) => {
    await gotoHydrated(page, '/')
    const rail = page.getByTestId('arena-rail')
    // rail now leads with the #1 overall model by index
    await expect(rail).toContainText('GPT-5.6')
    await expect(rail).toContainText('90.5')
    await pickOption(page, 'qc-b', 'Llama 3.1 405B — Meta')
    await page.getByTestId('qc-go').click()
    // quick-compare slot A defaults to the #1 rank-eligible model (GPT-5.6)
    await expect(page).toHaveURL(/m=gpt-5-6(%2C|,)llama-3-1-405b/)
  })
})

test.describe('dashboard releases + bench tabs', () => {
  test('tab switch mutates the URL without a reload', async ({ page }) => {
    await gotoHydrated(page, '/')
    await page.getByRole('button', { name: 'Releases' }).click()
    await expect(page).toHaveURL(/\?tab=releases/)
    await expect(page.getByTestId('release-feed')).toBeVisible()
    // dot color + note + INDEX column present
    await expect(page.getByTestId('release-feed')).toContainText('INDEX')
    await page.getByRole('button', { name: 'Benchmarks' }).click()
    await expect(page).toHaveURL(/\?tab=bench/)
    // bench-tab is gated to benchmarks with a real field (≥5 models), so it shows a curated
    // subset of the full catalog rather than a card per single-model benchmark.
    const cards = page.getByTestId('bench-card')
    await expect(cards.first()).toBeVisible()
    expect(await cards.count()).toBeGreaterThan(20)
  })

  test('open-vs-closed frontier renders index-based bars for both camps', async ({ page }) => {
    await gotoHydrated(page, '/?tab=releases')
    const frontier = page.getByTestId('frontier')
    // regrounded on the universal index, so both camps' leaders always plot
    await expect(frontier).toContainText('GPT-5.6')
    await expect(frontier).toContainText('Qwen3.6-27B')
    await expect(page.getByTestId('gap-note')).not.toHaveText('')
  })

  test('/timeline folds into the releases tab (D6)', async ({ page }) => {
    await page.goto('/timeline')
    await expect(page).toHaveURL(/\/\?tab=releases/)
    await expect(page.getByTestId('release-feed')).toBeVisible()
  })
})
