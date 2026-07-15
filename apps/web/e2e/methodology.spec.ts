import { expect, test } from '@playwright/test'
import { datasetCounts, gotoHydrated } from './helpers'

test('methodology publishes the exact formulas and current dataset facts', async ({ page }) => {
  const { models, asOf } = datasetCounts()
  await gotoHydrated(page, '/methodology')
  await expect(page.getByText('P(A beats B) = s(A) / (s(A) + s(B))')).toBeVisible()
  await expect(page.getByText('rating       = 400·log10(s) + 1000')).toBeVisible()
  await expect(page.getByText('ratio ≤ 0.8')).toBeVisible()
  // real corpus is a mix of self-reported/independent/arena sources, never collapsed
  await expect(page.getByText(/mix of/)).toBeVisible()
  await expect(page.getByText(new RegExp(`${models} models, as of ${asOf}`))).toBeVisible()
})
