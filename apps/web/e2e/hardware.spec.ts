import { expect, test } from '@playwright/test'
import { gotoHydrated } from './helpers'

test.describe('hardware explorer', () => {
  test('M3 Max budget grades llama-70b comfortable and kimi-k2.5 wont-run', async ({ page }) => {
    await gotoHydrated(page, '/hardware?gpu=m3max')
    await expect(page.getByTestId('hw-budget')).toHaveText('96 GB')
    const llama = page.getByTestId('fit-row').filter({ hasText: 'Llama 3.3 70B' })
    await expect(llama.getByTestId('verdict-fits-comfortably')).toBeVisible() // 45.4 ≤ 76.8
    const kimi = page.getByTestId('fit-row').filter({ hasText: 'Kimi K2.5' })
    await expect(kimi.getByTestId('verdict-wont-run')).toBeVisible() // 626 GB
  })

  test('manual 12 GB budget: gpt-oss-20b is offload-partial (ratio 1.17)', async ({ page }) => {
    await gotoHydrated(page, '/hardware?gpu=manual&vram=12')
    const row = page.getByTestId('fit-row').filter({ hasText: 'GPT-OSS-20B' })
    await expect(row.getByTestId('verdict-offload-partial')).toBeVisible()
    // and the Fits toggle excludes it (boolean ratio ≤ 1.0)
    await page.getByRole('button', { name: 'Fits', exact: true }).click()
    await expect(page.getByTestId('fit-row').filter({ hasText: 'GPT-OSS-20B' })).toHaveCount(0)
  })

  test('rtx4090 shows measured tok/s and links into the explorer facet', async ({ page }) => {
    await gotoHydrated(page, '/hardware')
    const row = page.getByTestId('fit-row').filter({ hasText: 'GPT-OSS-20B' })
    await expect(row).toContainText('~118')
    await page.getByRole('link', { name: 'Open in explorer →' }).click()
    await expect(page).toHaveURL(/\/models\?gpu=rtx4090/)
    await expect(page.getByTestId('explorer-gpu')).toHaveValue('rtx4090')
  })

  test('inverse mode grades one model across every profile', async ({ page }) => {
    await gotoHydrated(page, '/hardware?mode=model&model=gpt-oss-20b')
    await expect(
      page.getByTestId('inverse-rtx4070').getByTestId('verdict-fits-tight'),
    ).toBeVisible()
    await expect(
      page.getByTestId('inverse-rtx3060').getByTestId('verdict-offload-partial'),
    ).toBeVisible()
    await expect(
      page.getByTestId('inverse-m3ultra').getByTestId('verdict-fits-comfortably'),
    ).toBeVisible()
  })
})
