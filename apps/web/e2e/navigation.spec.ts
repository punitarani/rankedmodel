import { expect, test } from '@playwright/test'
import { gotoHydrated } from './helpers'

/** The top-left back affordance on detail pages honors real in-app history
 *  (URL state of the origin intact) and degrades to a parent link on direct load. */
test.describe('history-aware back links', () => {
  test('filtered rankings → model → back restores the filtered URL', async ({ page }) => {
    await gotoHydrated(page, '/rankings?org=anthropic')
    await page.getByTestId('ranking-row').first().click()
    await expect(page).toHaveURL(/\/models\/claude-opus-4-8$/)
    await page.getByRole('link', { name: '← Back' }).click()
    await expect(page).toHaveURL(/\/rankings\?org=anthropic$/)
  })

  test('dashboard scatter point → model → back lands on the dashboard', async ({ page }) => {
    await gotoHydrated(page, '/')
    await page.locator('a[aria-label^="DeepSeek V4.5 —"]').click()
    await expect(page).toHaveURL(/\/models\/deepseek-v4-5$/)
    await page.getByRole('link', { name: '← Back' }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('direct model load falls back to a plain parent link', async ({ page }) => {
    await gotoHydrated(page, '/models/claude-opus-4-8')
    const back = page.getByRole('link', { name: '← Model explorer' })
    await expect(back).toBeVisible()
    await back.click()
    await expect(page).toHaveURL(/\/models$/)
  })

  test('model → benchmark detail → back returns to the model', async ({ page }) => {
    await gotoHydrated(page, '/models/deepseek-v4-5')
    await page.getByRole('link', { name: 'GPQA Diamond' }).first().click()
    await expect(page).toHaveURL(/\/benchmarks\/gpqa$/)
    await page.getByRole('link', { name: '← Back' }).click()
    await expect(page).toHaveURL(/\/models\/deepseek-v4-5$/)
  })
})
