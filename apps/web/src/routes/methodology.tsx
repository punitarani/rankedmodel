import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { catalogQueryOptions } from '#/lib/catalog'

export const Route = createFileRoute('/methodology')({
  head: () => ({
    meta: [
      { title: 'Methodology — scoring, provenance & hardware fit · RankedModel' },
      {
        name: 'description',
        content:
          'How the RankedModel Elo rating is computed, where every number comes from, and how hardware-fit verdicts are graded.',
      },
    ],
  }),
  component: MethodologyRoute,
})

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mt-7 text-[15px] font-semibold tracking-[-0.01em]">{children}</h2>
)
const P = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-2 text-[12.5px] leading-[1.65] text-mut">{children}</p>
)
const Formula = ({ children }: { children: React.ReactNode }) => (
  <pre className="mt-2.5 overflow-x-auto rounded-[8px] border border-border bg-panel2 px-3.5 py-3 font-mono text-[11.5px] leading-relaxed text-text">
    {children}
  </pre>
)

function MethodologyRoute() {
  const { data } = useSuspenseQuery(catalogQueryOptions)
  return (
    <div className="max-w-[720px] animate-fadeup px-6 py-5 pb-14">
      <h1 className="text-lg font-semibold tracking-[-0.02em]">Methodology</h1>
      <div className="mt-0.5 text-xs text-mut">
        Credibility comes from showing the math. Everything below is exactly what the code does.
      </div>

      <H2>The Elo rating</H2>
      <P>
        Models are ranked by direct comparison, not by averaging incomparable score scales. For
        every benchmark, each pair of models that <em>both</em> report a headline score becomes one
        head-to-head battle: the higher raw score wins, an exactly equal score is a draw. Because
        both scores come from the same benchmark, no cross-benchmark normalization is needed — the
        comparison is apples to apples by construction. A Bradley-Terry model (the same statistical
        machinery behind LMArena's leaderboard) is then fitted over all battles, propagating
        strength through shared opponents, so two models are comparable even when they were never
        measured on the same benchmark.
      </P>
      <Formula>{`P(A beats B) = s(A) / (s(A) + s(B))     — Bradley-Terry win model
rating       = 400·log10(s) + 1000       — Elo scale: +400 ⇒ 10:1 odds

battles: every benchmark two models both report = 1 head-to-head
fit:     maximum likelihood (MM algorithm), ties count as half-wins
anchor:  every model gets one pseudo-draw vs a fixed 1000-rated anchor,
         so undefeated models stay finite and the scale stays pinned`}</Formula>
      <P>
        The rating is jointly fitted, so adding results moves every number slightly — ratings are
        published to 0.1 and each release is a reviewable diff. A 400-point gap means 10:1 expected
        win odds on a shared benchmark; frontier models rate near 3000 while early-generation models
        can rate below zero. The one Elo-unit benchmark in the catalog (Arena) participates like any
        other: only the <em>ordering</em> of two models' scores on it matters. Category indexes and
        the compare radar still use per-category normalized means against curated bounds — they are
        a capability profile, not a ranking.
      </P>

      <H2>Ranking eligibility</H2>
      <P>
        A rating is computed for every model, but a model earns an overall <em>rank</em> only once
        it has been evaluated on enough of the field to compare fairly — at least three benchmarks
        spanning at least two categories. Otherwise a model with a single cherry-picked high score
        would outrank a broadly-benchmarked frontier model. Below that floor a model is shown{' '}
        <span className="font-mono text-[11px]">unrated</span> (its rating still displayed for
        reference) and sorted after every ranked model, never erased.
      </P>

      <H2>Provenance</H2>
      <P>
        Every stored result carries a source: independent, arena, admin-run, curated, or
        self-reported. When a model×benchmark has rows from several sources, the headline score is
        picked in that order of precedence — independent measurements always beat a vendor's own
        numbers. The current dataset ({data.models.length} models, as of {data.asOf}) draws on a mix
        of <span className="font-mono text-[11px]">self-reported</span>,{' '}
        <span className="font-mono text-[11px]">independent</span>, and{' '}
        <span className="font-mono text-[11px]">arena</span> sources — each stored and displayed
        separately, never collapsed into a single number. Leaderboards show a per-row provenance
        badge so this is never hidden.
      </P>

      <H2>Movers & lineage</H2>
      <P>
        Version lineage links each model to its nearest strictly-older family member; same-day
        releases are size variants, not successions, and have no predecessor. “Biggest movers” are
        the largest positive Elo gains across those lineage edges.
      </P>

      <H2>Hardware fit</H2>
      <P>
        Fit verdicts use curated Q4 VRAM figures (ground truth beats formulas), with a 1.08×
        overhead factor for KV-cache and runtime. Mac budgets are already unified-memory discounted
        in the curated data. Where no curated figure exists the estimate is params × 4.5/8 × 1.08.
      </P>
      <Formula>{`required = vramQ4 × 1.08        ratio = required / budget
ratio ≤ 0.8   fits comfortably
ratio ≤ 1.0   fits (tight)        ← the boolean "fits" everywhere else
ratio ≤ 1.3   partial offload
otherwise     won't run

tok/s is shown only where a measured throughput row exists — never interpolated.
MoE models need total-parameter memory; speed tracks active parameters.`}</Formula>

      <H2>Versioned snapshots</H2>
      <P>
        Data is curated in git, validated, and published as an immutable snapshot (currently v
        {data.version}). Publishing bumps a version number that keys every cache — nothing is ever
        purged, and any historical snapshot stays reproducible.
      </P>

      <H2>Freshness & contributions</H2>
      <P>
        Curation is deliberate, not automated — which means the catalog can lag frontier releases by
        days. The dataset is a reviewable set of JSON/CSV files; corrections and additions arrive as
        pull requests where CI enforces referential integrity, score bounds and provenance before
        anything ships. See CONTRIBUTING in the repository, or start from the{' '}
        <Link to="/benchmarks">benchmark definitions</Link>.
      </P>
    </div>
  )
}
