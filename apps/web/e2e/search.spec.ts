import { expect, test } from '@playwright/test'
import { gotoHydrated } from './helpers'

test.describe('search', () => {
  test("'/' focuses the topbar, typing opens the dropdown, Enter navigates", async ({ page }) => {
    await gotoHydrated(page, '/rankings')
    await page.keyboard.press('/')
    await expect(page.getByTestId('topbar-search')).toBeFocused()
    await page.keyboard.type('deepseek v4.5')
    await expect(page.getByTestId('search-dropdown')).toContainText('DeepSeek V4.5')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/models\/deepseek-v4-5$/)
  })

  test('Escape closes the dropdown', async ({ page }) => {
    await gotoHydrated(page, '/')
    await page.getByTestId('topbar-search').fill('qwen')
    await expect(page.getByTestId('search-dropdown')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('search-dropdown')).toHaveCount(0)
  })

  test('/search?q= SSRs grouped results', async ({ page }) => {
    await gotoHydrated(page, '/search?q=qwen')
    await expect(page.getByTestId('search-summary')).toContainText('5 models')
    await expect(page.getByTestId('search-model')).toHaveCount(5) // 4×Qwen3 + QwQ (family match)
  })
})
