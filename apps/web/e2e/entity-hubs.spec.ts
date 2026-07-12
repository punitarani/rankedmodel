import { expect, test } from '@playwright/test'
import { gotoHydrated } from './helpers'

test.describe('organization + family hubs', () => {
  test('/organizations/anthropic lists its 6 models with cadence', async ({ page }) => {
    await gotoHydrated(page, '/organizations/anthropic')
    await expect(page.getByTestId('org-meta')).toContainText('6 tracked models · 2 families')
    await expect(page.getByTestId('org-model-row')).toHaveCount(6)
    await expect(page.getByTestId('org-model-row').first()).toContainText('Claude Opus 4.8')
  })

  test('/families/claude-4 shows progression and succession deltas', async ({ page }) => {
    await gotoHydrated(page, '/families/claude-4')
    await expect(page.getByTestId('family-member')).toHaveCount(5)
    await expect(page.getByTestId('family-sparkline').getByTestId('spark-dot')).toHaveCount(5)
    const opus48 = page.getByTestId('family-member').filter({ hasText: 'Claude Opus 4.8' })
    await expect(opus48).toContainText('succeeds Claude Opus 4.7')
    await expect(opus48).toContainText('+1.6')
  })

  test('model → family: the back affordance returns to the model, not the parent', async ({
    page,
  }) => {
    await gotoHydrated(page, '/models/glm-5-2')
    await page.getByRole('link', { name: 'GLM family' }).click()
    await expect(page).toHaveURL(/\/families\/glm$/)
    // with in-app history the top-left link is a true Back to the origin page
    await page.getByRole('link', { name: '← Back' }).click()
    await expect(page).toHaveURL(/\/models\/glm-5-2$/)
  })

  test('family hub on direct load falls back to the parent org link', async ({ page }) => {
    await gotoHydrated(page, '/families/glm')
    await page.getByRole('link', { name: '← Zhipu AI' }).click()
    await expect(page).toHaveURL(/\/organizations\/zhipu-ai$/)
  })

  test('unknown org/family 404', async ({ page }) => {
    expect((await page.goto('/organizations/nonexistent'))?.status()).toBe(404)
    expect((await page.goto('/families/nonexistent'))?.status()).toBe(404)
  })
})
