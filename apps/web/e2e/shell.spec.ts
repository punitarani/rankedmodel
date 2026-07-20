import { expect, test } from '@playwright/test'
import { datasetCounts, gotoHydrated } from './helpers'

test.describe('app shell', () => {
  test('renders the brand mark and nav; favicon wired', async ({ page }) => {
    await gotoHydrated(page, '/')
    await expect(page.getByText('Model Beats').first()).toBeVisible()
    await expect(page.locator('aside svg').first()).toBeVisible() // brand mark
    await expect(page.locator('aside')).not.toContainText('snapshot v') // footer removed
    await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute(
      'href',
      '/favicon.svg',
    )
    const icon = await page.request.get('/favicon.svg')
    expect(icon.status()).toBe(200)
  })

  test('sidebar navigation drives the topbar title', async ({ page }) => {
    await gotoHydrated(page, '/')
    await page.locator('aside').getByRole('link', { name: 'Rankings' }).click()
    await expect(page).toHaveURL(/\/rankings$/)
    await expect(page.getByTestId('page-title')).toHaveText('Global Rankings')
  })

  test('sidebar uses semantic Lucide icons for every primary destination', async ({ page }) => {
    await gotoHydrated(page, '/')

    const destinations = {
      Dashboard: 'lucide-layout-dashboard',
      Rankings: 'lucide-list-ordered',
      'Model Explorer': 'lucide-brain-circuit',
      Compare: 'lucide-git-compare-arrows',
      Hardware: 'lucide-memory-stick',
      'Fine-tune': 'lucide-sliders-horizontal',
      Benchmarks: 'lucide-flask-conical',
      Methodology: 'lucide-book-open-text',
    }

    for (const [label, iconClass] of Object.entries(destinations)) {
      await expect(
        page.locator('aside').getByRole('link', { name: label }).locator('svg'),
      ).toHaveClass(new RegExp(`\\b${iconClass}\\b`))
    }
  })

  test('theme defaults dark, toggles, and persists across reload', async ({ page }) => {
    await gotoHydrated(page, '/')
    const html = page.locator('html')
    await expect(html).toHaveClass(/dark/)
    await page.getByTestId('theme-toggle').click()
    await expect(html).not.toHaveClass(/dark/)
    await page.reload()
    await expect(html).not.toHaveClass(/dark/) // localStorage persisted 'light'
    await page.getByTestId('theme-toggle').click()
    await expect(html).toHaveClass(/dark/)
  })

  test('theme toggle and direct model BackLink use Lucide icons', async ({ page }) => {
    await gotoHydrated(page, '/models/gpt-oss-20b-medium')

    const themeToggle = page.getByTestId('theme-toggle')
    await expect.soft(themeToggle.locator('svg')).toHaveClass(/\blucide-moon\b/)
    await themeToggle.click()
    await expect.soft(themeToggle.locator('svg')).toHaveClass(/\blucide-sun\b/)

    const backLink = page.locator('main').getByRole('link', { name: 'Model explorer' })
    await expect.soft(backLink.locator('svg')).toHaveClass(/\blucide-arrow-left\b/)
  })

  test('unknown URL returns HTTP 404 with the designed copy', async ({ page }) => {
    const response = await gotoHydrated(page, '/definitely-not-a-page')
    expect(response?.status()).toBe(404)
    await expect(page.getByText('Page not found.')).toBeVisible()
  })

  test('SSR delivers content before hydration (catalog visible in raw HTML)', async ({
    request,
  }) => {
    const { models } = datasetCounts()
    const res = await request.get('/debug/catalog')
    expect(res.status()).toBe(200)
    const html = await res.text()
    // React SSR splits interpolations with comment nodes — strip tags/comments first.
    const text = html.replaceAll(/<[^>]+>/g, '')
    expect(text).toContain(`${models} models`)
  })
})
