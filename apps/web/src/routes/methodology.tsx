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
          'How the RankedModel Index is computed, where every number comes from, and how hardware-fit verdicts are graded.',
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

      <H2>The Index</H2>
      <P>
        Every benchmark carries curated normalization bounds — a floor (≈ a weak/random baseline)
        and a ceiling (≈ current near-SOTA) chosen per evaluation, so that being measured on a hard
        benchmark isn't a penalty: a frontier score on HLE (real ceiling ≈ 48%) normalizes near the
        top, not near zero. A score is min-max normalized against those bounds and clamped to [0,
        1]. A model's Index is the plain mean of its normalized scores × 100, rounded to 0.1.
        Missing benchmarks are excluded, not penalized — a model is judged only on what it has been
        measured on.
      </P>
      <Formula>{`norm(b, v) = clamp((v − b.min) / (b.max − b.min), 0, 1)
index(m)   = round(mean(norm over available benchmarks) × 1000) / 10

worked example — a model with MMLU 70 and HLE 34, nothing else:
  MMLU: (70 − 40) / (97 − 40) = 0.53
  HLE:  (34 − 0) / (48 − 0)   = 0.71
  index = mean(0.53, 0.71) × 100 = 61.8`}</Formula>
      <P>
        Curated bounds — rather than the observed min/max — keep the Index stable: adding a weak
        model to the catalog doesn't reshuffle everyone else's number. Category indexes use the same
        mean restricted to one category; the compare radar's six axes are those category values
        (vision is tracked but not an axis).
      </P>

      <H2>Ranking eligibility</H2>
      <P>
        The Index is computed for every model, but a model earns an overall <em>rank</em> only once
        it has been evaluated on enough of the field to compare fairly — at least three benchmarks
        spanning at least two categories. Otherwise a model with a single cherry-picked high score
        would outrank a broadly-benchmarked frontier model. Below that floor a model is shown{' '}
        <span className="font-mono text-[11px]">unrated</span> (its Index still displayed for
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
        the largest positive Index gains across those lineage edges.
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
