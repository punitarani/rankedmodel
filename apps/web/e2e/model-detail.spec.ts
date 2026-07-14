import { expect, test } from '@playwright/test'
import { gotoHydrated } from './helpers'

test.describe('model detail', () => {
  test('open model shows the Run-it-locally card matching the fit engine', async ({ page }) => {
    await gotoHydrated(page, '/models/gpt-oss-20b-medium')
    await expect(page.getByTestId('vram-q4')).toHaveText('13 GB')
    // 13×1.08 = 14.04: fits RTX 4070 Ti 16GB, not RTX 3060 12GB
    const chips = page.getByTestId('fits-chips')
    await expect(chips).toContainText('RTX 4070 Ti 16GB')
    await expect(chips).not.toContainText('RTX 3060 12GB')
    await expect(page.getByTestId('tps-line')).toHaveText('~225 tok/s on RTX 4090 (Q4, llama.cpp)')
    await expect(page.getByText('GGUF Q4 · MXFP4 (native) · GGUF Q4_K_M · GGUF Q8_0')).toBeVisible()
  })

  test('Phi-4-reasoning shows two enabled and four disabled capability icons', async ({ page }) => {
    await gotoHydrated(page, '/models/phi-4-reasoning')
    await expect(page.getByTestId('capability-reasoning').locator('svg.lucide-check')).toHaveCount(
      1,
    )
    await expect(page.getByTestId('capability-coding').locator('svg.lucide-check')).toHaveCount(1)
    await expect(page.getByTestId('capability-vision').locator('svg.lucide-x')).toHaveCount(1)
    await expect(
      page.getByTestId('capability-functionCalling').locator('svg.lucide-x'),
    ).toHaveCount(1)
    await expect(page.getByTestId('capability-toolUse').locator('svg.lucide-x')).toHaveCount(1)
    await expect(page.getByTestId('capability-agentic').locator('svg.lucide-x')).toHaveCount(1)
  })

  test('closed model shows the API-only pricing card + index rank', async ({ page }) => {
    // Gemini 3.1 Pro: a real, broadly-covered closed model (not #1 post-audit — GPT-5.6 leads).
    await gotoHydrated(page, '/models/gemini-3-1-pro')
    await expect(page.getByTestId('model-index')).toHaveText('83.6')
    await expect(page.getByText('Index · rank #17')).toBeVisible()
    await expect(page.getByTestId('price-in')).toHaveText('$2')
    await expect(page.getByTestId('price-out')).toHaveText('$12')
    // benchmark row: GPQA 94.3; the field best is now Claude Sonnet 5 (96.2)
    await expect(page.getByTestId('bench-gpqa')).toContainText('94.3')
    await expect(page.getByTestId('bench-gpqa')).toContainText('best: Claude Sonnet 5')
    // family card lists the Gemini 3.1 members (Pro + Flash-Lite)
    await expect(page.getByTestId('family-list').getByRole('link')).toHaveCount(2)
  })

  test('compare button lands on compare with both models loaded', async ({ page }) => {
    await gotoHydrated(page, '/models/gemini-3-1-pro')
    await page.getByTestId('compare-this').click()
    // compareB picks the top rank-eligible model on the OTHER side of the open/closed line —
    // Kimi K2.6, the top open model — which isn't the static compare default
    // pair, so the URL carries an explicit ?m=
    await expect(page).toHaveURL(/m=gemini-3-1-pro(%2C|,)kimi-k2-6/)
    const legend = page.getByTestId('compare-legend')
    await expect(legend).toContainText('Gemini 3.1 Pro')
    await expect(legend).toContainText('Kimi K2.6')
  })

  test('unknown model slug 404s with the designed copy', async ({ page }) => {
    const res = await gotoHydrated(page, '/models/not-a-real-model')
    expect(res?.status()).toBe(404)
    await expect(page.getByText('Model not found.')).toBeVisible()
  })
})
