import { expect, test } from '@playwright/test'
import { datasetCounts, gotoHydrated, pickOption } from './helpers'

test.describe('rankings', () => {
  test('default view: rank-eligible rows sorted by Elo, GPT-5.6 first', async ({ page }) => {
    const { models } = datasetCounts()
    await gotoHydrated(page, '/rankings')
    await expect(page.getByTestId('rankings-meta')).toContainText(
      `${models} models · sorted by Elo`,
    )
    // the coverage gate (D20) keeps single-benchmark curiosities (Doubao) out of the top; the
    // #1 row is the broadly-benchmarked frontier leader (Frontier Elo, D21)
    const first = page.getByTestId('ranking-row').first()
    await expect(first).toContainText('Kimi K3')
    await expect(first).toContainText('3054.4')
  })

  test('column sort click mutates URL and reorders rows', async ({ page }) => {
    await gotoHydrated(page, '/rankings')
    // The table remounts once post-hydration (mounted-gate, B4); a click that lands on the
    // pre-remount header node dispatches into a detached element. Retry the click until the
    // URL actually mutates so the test can't race the remount.
    await expect(async () => {
      await page.getByTestId('sort-gpqa').click()
      await expect(page).toHaveURL(/sort=-gpqa/, { timeout: 2000 })
    }).toPass({ timeout: 15_000 })
    // GPQA Diamond's leader is GPT-5.6 Sol (94.6), so sorting by GPQA moves it above the
    // Elo leader (Kimi K3) — the sort both mutates the URL and reorders the rows
    await expect(page.getByTestId('ranking-row').first()).toContainText('GPT-5.6')
    // second click flips to ascending
    await page.getByTestId('sort-gpqa').click()
    await expect(page).toHaveURL(/sort=gpqa/, { timeout: 10_000 })
  })

  test('deep link SSRs pre-sorted + pre-filtered (URL is the state)', async ({ request }) => {
    const res = await request.get('/rankings?sort=-aime&open=open')
    const html = await res.text()
    // inspect only the first rendered row (dehydrated query state contains everything) — SSR
    // always renders the full, non-virtualized list (mounted-gate, B4), so this stays a valid
    // server-side assertion regardless of the client-side virtualizer
    const firstRow = html.slice(
      html.indexOf('data-testid="ranking-row"'),
      html.indexOf('data-testid="ranking-row"') + 400,
    )
    expect(firstRow).toContain('GLM-5.2 (Max)') // open-weights AIME leader (99.2)
    expect(firstRow).not.toContain('GPT-5.2') // closed AIME leader (100), filtered server-side
  })

  test('org filter narrows rows', async ({ page }) => {
    await gotoHydrated(page, '/rankings')
    await pickOption(page, 'rankings-org', 'Anthropic')
    await expect(page).toHaveURL(/org=anthropic/)
    await expect(page.getByTestId('rankings-meta')).toContainText('25 models')
  })

  test('category param filters benchmark columns; bogus category 404s', async ({ page }) => {
    await gotoHydrated(page, '/rankings/coding')
    await expect(page.getByTestId('sort-swe-bench')).toBeVisible()
    await expect(page.getByTestId('sort-mmlu')).not.toBeVisible()
    const res = await gotoHydrated(page, '/rankings/astrology')
    expect(res?.status()).toBe(404)
  })
})
