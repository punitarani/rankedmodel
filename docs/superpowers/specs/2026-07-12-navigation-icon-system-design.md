# Navigation Icon System Design

## Goal

Replace ambiguous Unicode navigation glyphs with a compact, semantically clear Lucide icon system while preserving RankedModel's dense sidebar and dark-first visual language.

## Scope

The sidebar will use one 14px Lucide icon per destination at a 1.75 stroke width:

| Destination | Icon | Rationale |
|---|---|---|
| Dashboard | `LayoutDashboard` | Familiar overview pattern |
| Rankings | `ListOrdered` | Ordered results rather than a generic sort action |
| Model Explorer | `BrainCircuit` | AI-model catalog identity |
| Compare | `GitCompareArrows` | Explicit comparison intent |
| Hardware | `MemoryStick` | VRAM and memory-fit focus |
| Benchmarks | `FlaskConical` | Evaluation and testing context |
| Methodology | `BookOpenText` | Explanatory documentation |

The theme toggle will use `Sun` and `Moon`; Back links will use `ArrowLeft`; model capability chips will use `Check` and `X`. Existing Lucide controls—search, chevrons, dialog close, and dropdown checks—remain unchanged. The custom RankedModel brand mark and typographic data separators remain unchanged.

## Implementation

Sidebar navigation records will store Lucide component references instead of Unicode strings. Icons will be marked decorative because each adjacent link or control already has an accessible text label. The active-state color remains `--acc`; inactive icons remain `--dim`.

## Verification

Playwright will assert the semantic Lucide class for every sidebar destination. Existing shell, theme, model-detail, accessibility, and complete end-to-end coverage will verify that the visual change preserves navigation, theming, and accessible labels.

## Out of Scope

This change does not alter navigation routes, layout dimensions, labels, design tokens, product branding, or chart iconography.
