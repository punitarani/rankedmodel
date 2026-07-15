import { expect, test } from '@playwright/test'
import { datasetCounts, gotoHydrated, pickOption } from './helpers'

test.describe('model explorer', () => {
  test('default grid shows every real model, sorted by Elo', async ({ page }) => {
    const { models } = datasetCounts()
    await gotoHydrated(page, '/models')
    await expect(page.getByTestId('explorer-count')).toHaveText(`${models} models`)
    // the grid is virtualized (B4) — only a windowed subset is ever in the DOM, so assert the
    // JS-computed summary count above plus the always-rendered top row, not a raw card count.
    // Rank-eligible models sort first (D20), so the #1 card is the frontier leader, not a
    // single-benchmark curiosity.
    await expect(page.getByTestId('explorer-card').first()).toContainText('GPT-5.6')
  })

  test('runs-on-my-hardware facet applies the curated 1.08× rule', async ({ page }) => {
    await gotoHydrated(page, '/models')
    // narrow with the text filter first so the whole (small) result set renders without
    // relying on virtualized scroll position
    await page.getByTestId('explorer-filter').fill('gpt-oss')
    await pickOption(page, 'explorer-gpu', 'RTX 4090 24GB')
    await expect(page).toHaveURL(/gpu=rtx4090/)
    // 13×1.08 = 14.04 ≤ 24 keeps the 20B tiers; 73×1.08 = 78.84 > 24 drops the 120B tiers
    await expect(
      page.getByTestId('explorer-card').filter({ hasText: 'gpt-oss-20b (Medium)' }),
    ).toHaveCount(1)
    await expect(
      page.getByTestId('explorer-card').filter({ hasText: 'gpt-oss-120b (Medium)' }),
    ).toHaveCount(0)
  })

  test('deep-linked facets restore on load (URL round-trip)', async ({ page }) => {
    await gotoHydrated(page, '/models?open=open&size=s&caps=reason')
    // real corpus: 19 open, <15B-param models with the reasoning capability
    await expect(page.getByTestId('explorer-count')).toHaveText('19 models')
    await expect(page.getByTestId('cap-reason')).toHaveAttribute('aria-pressed', 'true')
    // default sort is by Elo (rank-eligible first) — Falcon-H1R 7B leads this facet combo
    await expect(page.getByTestId('explorer-card').first()).toContainText('Falcon-H1R 7B')
  })

  test('cheapest-API sort puts Ministral 3B first ($0.04/M out)', async ({ page }) => {
    await gotoHydrated(page, '/models')
    await pickOption(page, 'explorer-sort', 'Cheapest API')
    await expect(page).toHaveURL(/sort=cheap/)
    await expect(page.getByTestId('explorer-card').first()).toContainText('Ministral 3B')
  })

  test('reset clears facets back to clean URL', async ({ page }) => {
    const { models } = datasetCounts()
    await gotoHydrated(page, '/models?open=open&size=s&caps=reason')
    await page.getByRole('button', { name: 'Reset filters' }).click()
    await expect(page).toHaveURL(/\/models$/)
    await expect(page.getByTestId('explorer-count')).toHaveText(`${models} models`)
  })
})
