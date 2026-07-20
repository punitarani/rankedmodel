import { expect, test } from '@playwright/test'
import { gotoHydrated, pickOption } from './helpers'

test.describe('fine-tune selector', () => {
  test('default ranking renders trainable open models on a clean URL', async ({ page }) => {
    await gotoHydrated(page, '/finetune')
    await expect(page).toHaveURL(/\/finetune$/)
    await expect(page.getByTestId('finetune-count')).toHaveText(
      /^\d+ trainable · of \d+ open models$/,
    )
    // rank-eligible models lead (D20 order); the default RTX 4090 keeps QLoRA-able mid-sizers
    await expect(page.getByTestId('finetune-row').first()).toContainText('Qwen3.6-27B')
    await expect(page.getByTestId('finetune-capacity')).toHaveText('1 × 24 GB = 24 GB usable')
  })

  test('task chips round-trip through the URL and deep-load restores them', async ({ page }) => {
    await gotoHydrated(page, '/finetune')
    await page.getByTestId('task-code').click()
    await page.getByTestId('task-docs').click()
    await expect(page).toHaveURL(/task=code(%2C|,)docs/)
    await expect(page.getByTestId('task-code')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('task-docs')).toHaveAttribute('aria-pressed', 'true')
    // coverage tiers: a model scored on BOTH selected axes leads — a single-axis
    // high score (MiniCPM-o's docs-only 90) can no longer cherry-pick #1
    await expect(page.getByTestId('finetune-row').first()).toContainText('Mistral Small 3.2')
    await expect(page.getByTestId('finetune-row').first()).toContainText('2/2')

    await gotoHydrated(page, '/finetune?task=code,docs')
    await expect(page.getByTestId('task-code')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('task-docs')).toHaveAttribute('aria-pressed', 'true')
  })

  test('bigger training hardware unlocks bigger models', async ({ page }) => {
    // 70B QLoRA needs 47.6 GB — over a single 4090's 24 GB, so the model is absent…
    await gotoHydrated(page, '/finetune?q=llama 3.3')
    await expect(page.getByTestId('finetune-count')).toHaveText(/^0 trainable/)
    // …but 4×H100 (320 GB) admits it, with LoRA (149.1 GB) as the best feasible method
    await pickOption(page, 'finetune-tgpu', 'H100 80GB')
    await page.getByRole('button', { name: '4×' }).click()
    await expect(page).toHaveURL(/tgpu=h100/)
    await expect(page).toHaveURL(/tn=4/)
    await expect(page.getByTestId('finetune-capacity')).toHaveText('4 × 80 GB = 320 GB usable')
    const row = page.getByTestId('finetune-row').filter({ hasText: 'Llama 3.3 70B' })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('LoRA')
  })

  test('method constraint: full fine-tune on 24 GB leaves only tiny models', async ({ page }) => {
    await gotoHydrated(page, '/finetune?method=full')
    // 16 bytes/param + activations: only ~1.3B models fit a single 24 GB card
    await expect(page.getByTestId('finetune-count')).toHaveText(/^4 trainable/)
    await expect(page.getByTestId('finetune-row').first()).toContainText('Full fine-tune')
    await expect(page.getByTestId('finetune-row').filter({ hasText: 'Qwen3.6-27B' })).toHaveCount(0)
  })

  test('impossible combo shows the empty state with working relax hints', async ({ page }) => {
    // full FT of a 15–70B model on one 4090 fits nothing
    await gotoHydrated(page, '/finetune?method=full&size=m')
    await expect(page.getByTestId('finetune-empty')).toBeVisible()
    const hint = page.getByTestId('finetune-relax').filter({ hasText: 'Allow any training method' })
    await expect(hint).toContainText(/→ \d+ models/)
    await hint.click()
    await expect(page).not.toHaveURL(/method=/)
    await expect(page.getByTestId('finetune-row').first()).toBeVisible()
  })

  test('license threshold filter drops research-only models', async ({ page }) => {
    await gotoHydrated(page, '/finetune')
    await expect(page.getByTestId('finetune-row').filter({ hasText: 'EXAONE 4.5' })).toHaveCount(1)
    await pickOption(page, 'finetune-license', 'Permissive only')
    await expect(page).toHaveURL(/lic=permissive/)
    await expect(page.getByTestId('finetune-row').filter({ hasText: 'EXAONE 4.5' })).toHaveCount(0)
  })

  test('why-breakdown expands with per-method math, cost line, and single-open accordion', async ({
    page,
  }) => {
    await gotoHydrated(page, '/finetune')
    const rows = page.getByTestId('finetune-row')
    await rows.first().click()
    await expect(rows.first()).toHaveAttribute('aria-expanded', 'true')
    const why = page.getByTestId('finetune-why')
    await expect(why).toBeVisible()
    // all three methods with verdict chips and exact-sum formula lines
    await expect(page.getByTestId('train-verdict-qlora')).toBeVisible()
    await expect(page.getByTestId('train-verdict-lora')).toBeVisible()
    await expect(page.getByTestId('train-verdict-full')).toBeVisible()
    await expect(why).toContainText('weights')
    await expect(why).toContainText('max fidelity')
    await expect(page.getByTestId('finetune-cost-line')).toContainText(/\$\d/)
    // single-open accordion: expanding another row collapses the first
    await rows.nth(1).click()
    await expect(rows.first()).toHaveAttribute('aria-expanded', 'false')
    await expect(rows.nth(1)).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('finetune-why')).toHaveCount(1)
  })

  test('breakdown links through to the model page', async ({ page }) => {
    await gotoHydrated(page, '/finetune')
    await page.getByTestId('finetune-row').first().click()
    await page.getByRole('link', { name: 'Model page →' }).click()
    await expect(page).toHaveURL(/\/models\/[a-z0-9-]+$/)
  })

  test('cheapest-training sort puts the smallest models first', async ({ page }) => {
    await gotoHydrated(page, '/finetune')
    await pickOption(page, 'finetune-sort', 'Cheapest training')
    await expect(page).toHaveURL(/sort=cost/)
    await expect(page.getByTestId('finetune-row').first()).toContainText('SantaCoder 1.1B')
  })

  test('effort/mode variants collapse to one row per checkpoint', async ({ page }) => {
    // gpt-oss-120b ships High/Medium/Low effort tiers of the same weights — one row here
    await gotoHydrated(page, '/finetune?tgpu=h100&tn=4&q=gpt-oss-120b')
    await expect(page.getByTestId('finetune-count')).toHaveText(/^1 trainable/)
  })

  test('RL recipe adds rollout memory and offers the SFT relax hint', async ({ page }) => {
    // EXAONE 4.5 (33B): QLoRA SFT is tight on 24 GB; RL's +3.3 GB rollouts push it off
    await gotoHydrated(page, '/finetune?recipe=rl&q=exaone 4.5')
    await expect(page.getByTestId('finetune-count')).toHaveText(/^0 trainable/)
    const hint = page.getByTestId('finetune-relax').filter({ hasText: 'Use plain SFT instead' })
    await hint.click()
    await expect(page).not.toHaveURL(/recipe=/)
    await expect(page.getByTestId('finetune-count')).toHaveText(/^1 trainable/)
  })

  test('context-window floor filters on ctxK', async ({ page }) => {
    await gotoHydrated(page, '/finetune')
    await pickOption(page, 'finetune-ctx', '≥ 1M tokens')
    await expect(page).toHaveURL(/ctx=1000/)
    await expect(page.getByTestId('finetune-count')).toHaveText(/^2 trainable/)
  })

  test('model detail shows the fine-tune card for open weights only', async ({ page }) => {
    await gotoHydrated(page, '/models/llama-3-3-70b')
    const card = page.getByTestId('finetune-card')
    await expect(card).toBeVisible()
    await expect(card.getByTestId('ft-method-qlora')).toContainText('47.6 GB')
    await expect(card.getByTestId('ft-method-qlora')).toContainText('1× A100 80GB')
    await expect(card.getByTestId('ft-method-full')).toContainText('8× H200 141GB')
    await page.getByTestId('plan-finetune').click()
    await expect(page).toHaveURL(/\/finetune\?q=Llama(%20|\+| )3\.3(%20|\+| )70B/)
    // closed model → no card
    await gotoHydrated(page, '/models/claude-opus-4-8')
    await expect(page.getByTestId('finetune-card')).toHaveCount(0)
  })

  test('reset restores the clean URL and the full count', async ({ page }) => {
    await gotoHydrated(page, '/finetune')
    const fullCount = await page.getByTestId('finetune-count').textContent()
    await gotoHydrated(page, '/finetune?task=code&method=qlora&lic=permissive&size=s')
    await page.getByRole('button', { name: 'Reset filters' }).click()
    await expect(page).toHaveURL(/\/finetune$/)
    await expect(page.getByTestId('finetune-count')).toHaveText(fullCount ?? '')
  })
})
