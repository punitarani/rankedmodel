import { expect, test } from '@playwright/test'
import { axeScan } from './axe'
import { gotoHydrated } from './helpers'

const ROUTES = [
  '/',
  '/?tab=releases',
  '/?tab=bench',
  '/rankings',
  '/models',
  '/models/gpt-5-6-sol',
  '/models/gpt-oss-20b-medium',
  '/compare?m=gpt-5-2,deepseek-v3-1-thinking',
  '/hardware',
  '/finetune',
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
  // The table remounts once post-hydration (mounted-gate, B4), which replaces the header
  // node and silently drops focus to <body> — an Enter that races the remount dispatches
  // into a detached element. Retry the focus+Enter sequence until the URL actually
  // mutates, which asserts the real contract (keyboard-operable once settled) without
  // racing the remount under load.
  await expect(async () => {
    await sortBtn.focus()
    await expect(sortBtn).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/sort=-gpqa/, { timeout: 2000 })
  }).toPass({ timeout: 20_000 })
})
