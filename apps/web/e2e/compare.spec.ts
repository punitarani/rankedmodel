import { expect, test } from '@playwright/test'
import { gotoHydrated, pickOption } from './helpers'

test.describe('compare', () => {
  test('deep link renders two columns, radar polygons and legend', async ({ page }) => {
    // default pair now shares well-covered benchmarks (AIME/GPQA/HLE), so the table is populated
    await gotoHydrated(page, '/compare?m=gpt-5-2,deepseek-v3-1-thinking')
    const legend = page.getByTestId('compare-legend')
    await expect(legend).toContainText('GPT-5.2')
    await expect(legend).toContainText('2515.3')
    await expect(legend).toContainText('DeepSeek-V3.1 (Thinking)')
    await expect(legend).toContainText('1919.7')
    // 4 rings + 2 series polygons
    await expect(page.getByTestId('compare-radar').locator('polygon')).toHaveCount(6)
    // the benchmarks card only shows rows a compared model actually scored — no wall of dashes
    await expect(page.getByText('No shared benchmark results')).toHaveCount(0)
  })

  test('best-value highlighting favors the right cells', async ({ page }) => {
    await gotoHydrated(page, '/compare?m=gpt-5-2,deepseek-v3-1-thinking')
    const idxRow = page.getByTestId('spec-elo-rating')
    await expect(idxRow.locator('span').nth(1)).toHaveCSS('font-weight', '600') // GPT-5.2 Elo 2515.3
    const priceRow = page.getByTestId('spec-price-out-m')
    await expect(priceRow.locator('span').nth(2)).toHaveCSS('font-weight', '600') // DeepSeek $1.68
  })

  test('changing slot C updates the URL', async ({ page }) => {
    await gotoHydrated(page, '/compare?m=gpt-5-2,deepseek-v3-1-thinking')
    await pickOption(page, 'compare-slot-2', 'Llama 3.1 405B — Meta')
    await expect(page).toHaveURL(/m=gpt-5-2(%2C|,)deepseek-v3-1-thinking(%2C|,)llama-3-1-405b/)
    await expect(page.getByTestId('compare-radar').locator('polygon')).toHaveCount(7)
  })

  test('save → appears on /saved → open restores → delete removes', async ({ page }) => {
    await gotoHydrated(page, '/compare?m=llama-3-1-405b,gemma-3-27b')
    await page.getByTestId('save-name').fill('agentic duo')
    await page.getByTestId('save-comparison').click()
    await gotoHydrated(page, '/saved')
    const row = page.getByTestId('saved-list').getByText('agentic duo')
    await expect(row).toBeVisible()
    await page.getByRole('link', { name: 'Open' }).click()
    await expect(page).toHaveURL(/m=llama-3-1-405b(%2C|,)gemma-3-27b/)
    await gotoHydrated(page, '/saved')
    await page.getByRole('button', { name: 'Delete agentic duo' }).click()
    await page.reload()
    await expect(page.getByTestId('saved-list')).toContainText('Nothing saved yet.')
  })
})
