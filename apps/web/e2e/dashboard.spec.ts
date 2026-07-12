import { expect, test } from '@playwright/test'
import { gotoHydrated, pickOption } from './helpers'

test.describe('dashboard overview', () => {
  test('stat strip reflects the real catalog', async ({ page }) => {
    await gotoHydrated(page, '/')
    const cards = page.getByTestId('stat-card')
    await expect(cards).toHaveCount(4)
    await expect(cards.nth(0)).toContainText('55')
    await expect(cards.nth(0)).toContainText('19 organizations')
    await expect(cards.nth(3)).toContainText('Elo')
  })

  test('scatter plots every priced+arena model, movers show lineage gains', async ({ page }) => {
    await gotoHydrated(page, '/')
    // 49 priced models all carry arena scores in the curated set
    await expect(page.getByTestId('scatter-point')).toHaveCount(49)
    const movers = page.getByTestId('movers')
    await expect(movers).toContainText('Qwen3.7 Max')
    await expect(movers).toContainText('+39.6')
  })

  test('scatter tooltip appears on hover and on keyboard focus', async ({ page }) => {
    await gotoHydrated(page, '/')
    const point = page.locator('a[aria-label^="Claude Opus 4.8 —"]')
    await point.hover()
    const tip = page.getByTestId('chart-tip')
    await expect(tip).toBeVisible()
    await expect(tip).toContainText('Claude Opus 4.8')
    await expect(tip).toContainText('Elo')
    await page.mouse.move(0, 0)
    await expect(tip).toHaveCount(0)
    // keyboard parity: the same details on focus (dataviz interaction rule)
    await point.focus()
    await expect(page.getByTestId('chart-tip')).toContainText('Claude Opus 4.8')
  })

  test('arena rail is ordered and quick compare navigates', async ({ page }) => {
    await gotoHydrated(page, '/')
    const rail = page.getByTestId('arena-rail')
    await expect(rail).toContainText('Claude Opus 4.8')
    await expect(rail).toContainText('1510')
    await pickOption(page, 'qc-b', 'GLM-5.2 — Zhipu AI')
    await page.getByTestId('qc-go').click()
    await expect(page).toHaveURL(/m=claude-opus-4-8(%2C|,)glm-5-2/)
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
    await expect(page.getByTestId('bench-card')).toHaveCount(10)
  })

  test('frontier note computes the Elo win-rate sentence', async ({ page }) => {
    await gotoHydrated(page, '/?tab=releases')
    await expect(page.getByTestId('frontier')).toContainText('Claude Opus 4.8 · 1510')
    await expect(page.getByTestId('frontier')).toContainText('DeepSeek V4.5 · 1483')
    await expect(page.getByTestId('gap-note')).toContainText('trails by 27 Elo')
    await expect(page.getByTestId('gap-note')).toContainText('54% head-to-head win rate')
  })

  test('/timeline folds into the releases tab (D6)', async ({ page }) => {
    await page.goto('/timeline')
    await expect(page).toHaveURL(/\/\?tab=releases/)
    await expect(page.getByTestId('release-feed')).toBeVisible()
  })
})
