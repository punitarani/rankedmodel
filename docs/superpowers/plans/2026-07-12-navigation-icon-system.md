# Navigation Icon System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ambiguous Unicode navigation and interface glyphs with the approved accessible Lucide icon mapping.

**Architecture:** The sidebar stores Lucide component references alongside its existing route metadata and renders them as decorative SVGs. Existing UI controls retain their text labels, while inline glyphs are replaced by matching Lucide components without changing navigation or state.

**Tech Stack:** React 19, TanStack Router, Lucide React, Playwright, Bun.

---

### Task 1: Lock the sidebar icon contract with an end-to-end test

**Files:**
- Modify: `apps/web/e2e/shell.spec.ts`

- [ ] **Step 1: Write the failing test**

Add this test to the shell suite:

```ts
test('sidebar uses semantic Lucide icons for every primary destination', async ({ page }) => {
  await gotoHydrated(page, '/')
  const expected = {
    Dashboard: 'lucide-layout-dashboard',
    Rankings: 'lucide-list-ordered',
    'Model Explorer': 'lucide-brain-circuit',
    Compare: 'lucide-git-compare-arrows',
    Hardware: 'lucide-memory-stick',
    Benchmarks: 'lucide-flask-conical',
    Methodology: 'lucide-book-open-text',
  }
  for (const [label, className] of Object.entries(expected)) {
    await expect(page.getByRole('link', { name: label }).locator('svg')).toHaveClass(
      new RegExp(className),
    )
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter '@rankedmodel/web' test:e2e -- e2e/shell.spec.ts --grep "semantic Lucide icons"`

Expected: FAIL because the sidebar renders Unicode glyphs instead of SVG icon components.

- [ ] **Step 3: Implement the sidebar mapping**

In `apps/web/src/components/shell/sidebar.tsx`, import the approved Lucide components and `LucideIcon` type. Replace each `icon: string` value with the corresponding component, then render `<item.icon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />` in the existing icon column.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run --filter '@rankedmodel/web' test:e2e -- e2e/shell.spec.ts --grep "semantic Lucide icons"`

Expected: PASS.

### Task 2: Replace remaining interface glyphs

**Files:**
- Modify: `apps/web/src/components/shell/topbar.tsx`
- Modify: `apps/web/src/components/back-link.tsx`
- Modify: `apps/web/src/components/model-detail/model-detail-screen.tsx`

- [ ] **Step 1: Update the theme toggle**

Import `Moon` and `Sun` in `topbar.tsx`. Render `Moon` beside the `Light` label in dark mode and `Sun` beside the `Dark` label in light mode, both decorative at 14px and 1.75 stroke width.

- [ ] **Step 2: Update Back links**

Import `ArrowLeft` in `back-link.tsx`. Replace the Unicode arrow with the decorative icon while preserving the existing `Back` and fallback-label copy.

- [ ] **Step 3: Update capability states**

Import `Check` and `X` in `model-detail-screen.tsx`. Replace the Unicode check and cross in each capability chip with the corresponding decorative Lucide icon at 12px and 1.75 stroke width.

- [ ] **Step 4: Run focused browser coverage**

Run: `bun run --filter '@rankedmodel/web' test:e2e -- e2e/shell.spec.ts e2e/model-detail.spec.ts`

Expected: PASS.

### Task 3: Validate the icon system across the application

**Files:**
- Verify: `apps/web/e2e/a11y.spec.ts`

- [ ] **Step 1: Run the complete validation suite**

Run: `bun run ci && bun run e2e`

Expected: all unit, type, lint, build, performance, functional, and accessibility checks pass.

- [ ] **Step 2: Visually inspect the sidebar**

Run the local app, open the dashboard, and capture a browser screenshot. Confirm that all icons align in the existing icon column, retain inactive/active colors, and do not change sidebar width or row spacing.

- [ ] **Step 3: Commit the implementation**

```bash
git add apps/web/src/components/shell/sidebar.tsx apps/web/src/components/shell/topbar.tsx apps/web/src/components/back-link.tsx apps/web/src/components/model-detail/model-detail-screen.tsx apps/web/e2e/shell.spec.ts
git commit -m "feat(web): replace navigation glyphs with semantic Lucide icons"
```
