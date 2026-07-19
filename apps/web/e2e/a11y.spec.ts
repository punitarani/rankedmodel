import { expect, test } from '@playwright/test'
import { axeScan } from './axe'
import { gotoHydrated } from './helpers'

const ROUTES = [
  '/',
  '/?tab=releases',
  '/?tab=bench',
  '/rankings',
  '/models',
  '/models/gpt-5-6',
  '/models/gpt-oss-20b-medium',
  '/compare?m=gpt-5-2,deepseek-v3-1-thinking',
  '/hardware',
  '/benchmarks',
  '/benchmarks/swe-bench',
  '/organizations/anthropic',
  '/families/claude-4',
  '/methodology',
  '/search?q=qwen',
  '/saved',
]

for (const route of ROUTES) {
  for (const theme of ['dark', 'light'] as const) {
    test(`axe clean: ${route} [${theme}]`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('modelbeats.theme', t), theme)
      await gotoHydrated(page, route)
      const violations = await axeScan(page)
      expect(
        violations.map((v) => `${v.id}: ${v.nodes.length} nodes (${v.nodes[0]?.target}`),
      ).toEqual([])
    })
  }
}

test('keyboard: rankings sort buttons are tabbable and Enter-operable', async ({ page }) => {
  await gotoHydrated(page, '/rankings')
  const sortBtn = page.getByTestId('sort-gpqa')
  await expect(sortBtn).toBeVisible()
  await sortBtn.focus()
  // toBeFocused auto-waits until focus actually lands on the (interactive) control,
  // so Enter can't fire before the button is operable on a slow CI runner.
  await expect(sortBtn).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/sort=-gpqa/, { timeout: 10_000 })
})
