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
    // Open–closed gap is computed on the universal Elo rating (arena covers only a sliver), so
    // it's always a real number, and the leader is the top-ranked open model under pairwise Elo.
    await expect(cards.nth(3)).toContainText('Elo')
    await expect(cards.nth(3)).toContainText('Kimi K3 leads open')
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
    // real top mover is a rank-eligible family edge; deltas are Elo points (D21), so a large
    // cross-tier lineage jump (105B succeeding a 2B) posts a four-digit gain
    await expect(movers).toContainText('Sarvam-105B')
    await expect(movers).toContainText('+1630.9')
  })

  test('y-axis auto-zooms to the data instead of a fixed axis', async ({ page }) => {
    await gotoHydrated(page, '/')
    // Fitted to the priced+ranked Elo range (D21): round ticks that reach the ~3000-rated
    // frontier instead of the retired 0–100 index band.
    const ticks = (await page.getByTestId('y-tick').allTextContents()).map(Number)
    expect(ticks.length).toBeGreaterThanOrEqual(3)
    expect(Math.max(...ticks)).toBeGreaterThanOrEqual(2000)
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
    await expect(tip).toContainText('Elo')
    await page.mouse.move(0, 0)
    await expect(tip).toHaveCount(0)
    // keyboard parity: the same details on focus (dataviz interaction rule)
    await point.focus()
    await expect(page.getByTestId('chart-tip')).toContainText('Gemini 3.1 Pro')
  })

  test('top-ranked rail is ordered by Elo and quick compare navigates', async ({ page }) => {
    await gotoHydrated(page, '/')
    const rail = page.getByTestId('arena-rail')
    // rail now leads with the #1 overall model by Elo rating
    await expect(rail).toContainText('GPT-5.6')
    await expect(rail).toContainText('3055.3')
    await pickOption(page, 'qc-b', 'Llama 3.1 405B — Meta')
    await page.getByTestId('qc-go').click()
    // quick-compare slot A defaults to the #1 rank-eligible model (Kimi K3)
    await expect(page).toHaveURL(/m=kimi-k3(%2C|,)llama-3-1-405b/)
  })
})

test.describe('dashboard releases + bench tabs', () => {
  test('tab switch mutates the URL without a reload', async ({ page }) => {
    await gotoHydrated(page, '/')
    await page.getByRole('button', { name: 'Releases' }).click()
    await expect(page).toHaveURL(/\?tab=releases/)
    await expect(page.getByTestId('release-feed')).toBeVisible()
    // dot color + note + ELO column present
    await expect(page.getByTestId('release-feed')).toContainText('ELO')
    await page.getByRole('button', { name: 'Benchmarks' }).click()
    await expect(page).toHaveURL(/\?tab=bench/)
    // bench-tab is gated to benchmarks with a real field (≥5 models), so it shows a curated
    // subset of the full catalog rather than a card per single-model benchmark.
    const cards = page.getByTestId('bench-card')
    await expect(cards.first()).toBeVisible()
    expect(await cards.count()).toBeGreaterThan(20)
  })

  test('open-vs-closed frontier renders Elo-based bars for both camps', async ({ page }) => {
    await gotoHydrated(page, '/?tab=releases')
    const frontier = page.getByTestId('frontier')
    // regrounded on the universal Elo rating, so both camps' leaders always plot
    await expect(frontier).toContainText('GPT-5.6')
    await expect(frontier).toContainText('Kimi K3')
    await expect(page.getByTestId('gap-note')).not.toHaveText('')
  })

  test('/timeline folds into the releases tab (D6)', async ({ page }) => {
    await page.goto('/timeline')
    await expect(page).toHaveURL(/\/\?tab=releases/)
    await expect(page.getByTestId('release-feed')).toBeVisible()
  })
})
