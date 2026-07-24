import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { catalogQueryOptions } from '#/lib/catalog'

export const Route = createFileRoute('/methodology')({
  head: () => ({
    meta: [
      { title: 'Methodology — scoring, provenance & hardware fit · Model Beats' },
      {
        name: 'description',
        content:
          'How the Model Beats Elo rating is computed, where every number comes from, and how hardware-fit verdicts are graded.',
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
        comparison is apples to apples by construction. Battles are weighted so that no single
        domain decides a pairing linearly by benchmark count: within each pair, a battle in a
        category the pair shares n benchmarks of carries weight 1/√n — a domain with more shared
        benchmarks still contributes more evidence (√n total), but sub-linearly, so a rating
        reflects breadth across domains rather than depth in one. A Bradley-Terry model (the same
        statistical machinery behind LMArena's leaderboard) is then fitted over all weighted
        battles, propagating strength through shared opponents, so two models are comparable even
        when they were never measured on the same benchmark.
      </P>
      <Formula>{`P(A beats B) = s(A) / (s(A) + s(B))     — Bradley-Terry win model
rating       = 400·log10(s) + 1000       — Elo scale: +400 ⇒ 10:1 odds

battles: every benchmark two models both report = 1 head-to-head,
         weighted 1/√n where n = benchmarks of that battle's category
         the pair shares (a shared domain votes with √n total weight)
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

      <H2>Fine-tuning fit & cost</H2>
      <P>
        The <Link to="/finetune">fine-tune selector</Link> covers open-weight models with a known
        parameter count — closed API models can't have their weights tuned. Training memory is
        formula-derived from parameters, never curated: the shown requirement is the exact sum of
        its parts, and headroom lives in the verdict thresholds (the same 0.8 / 1.0 ratio grades as
        hardware fit). When no method is forced, the recommendation is the highest-fidelity method
        that fits: full fine-tune over LoRA over QLoRA. Capacity is GPU count × VRAM, assuming
        FSDP/ZeRO-style sharding across GPUs; MoE models need total-parameter memory.
      </P>
      <Formula>{`P = total params (B) · A = 0.005·P adapter params · act = max(2, 0.05·P) GB
full  = 2P weights + 2P grads + 12P optimizer (AdamW fp32) + act
lora  = 2P frozen weights + 2A adapter + 2A grads + 12A optimizer + act
qlora = 0.55P NF4 weights + 2A adapter + 2A grads + 12A optimizer + act

recipes: SFT = the above · DPO adds a frozen bf16 reference (+2P, full FT only —
LoRA/QLoRA reuse the frozen base with adapters off) · RL (GRPO-style) additionally
adds rollout/KV buffers (+max(2, 0.1·P))

ratio = required / (count × VRAM):  ≤ 0.8 fits · ≤ 1.0 fits (tight) · else won't fit
anchors: QLoRA 33B → 22.8 GB (24 GB card) · 65B → 44.2 GB (48 GB) · full 7B → 114 GB
         · QLoRA-GRPO 7B → 8.4 GB · full-GRPO 7B → 130 GB (2×H100)`}</Formula>
      <P>
        Cost estimates are rough by design and labeled as such: dataset presets assume 1,024 tokens
        per sample and 3 epochs; compute is the standard 6 × params × tokens training-FLOPs rule
        (active parameters for MoE) against each GPU's peak bf16 throughput at 35% utilization,
        priced at typical marketplace rental rates. GPU-hours are count-independent — more GPUs
        shorten wall-clock, not total compute. Apple-silicon profiles get fit verdicts but no cost
        estimate: there is no comparable rental market for unified-memory training.
      </P>
      <Formula>{`tokens    = samples × 1024 tok/sample × 3 epochs
compute   = 6e9 × params(B) × tokens × recipe multiplier (SFT ×1 · DPO ×2.5 · RL ×8)
            DPO adds the reference forward pass; RL ×8 assumes ~8 GRPO rollouts per prompt
GPU-hours = compute / (peak bf16 TFLOPS × 0.35 MFU × 3600)
cost      = GPU-hours × typical $/hr   (H100 $2.50 · A100 $1.50 · RTX 4090 $0.40 …)
            MoE bills only active (routed) experts; an undisclosed active count shows "—"`}</Formula>
      <P>
        Licenses are classified from the curated license string into three classes — permissive
        (Apache/MIT/BSD-family), conditional / custom (community licenses and anything with its own
        terms; also the honest default for unknown strings), and research-only (non-commercial
        clauses). Mixed strings classify by the <em>weights'</em> terms, since those are what you'd
        be fine-tuning, and the raw license string is always shown alongside the class. Two quality
        axes are derived from benchmark baskets: “Documents” (DocVQA, OCRBench, ChartQA, CharXiv)
        and “Instruction following” (IFEval) — sparse coverage shows as “—”, never as a zero. “Chat
        quality” is the human-preference index under an honest name: there is no dedicated
        creative-writing benchmark category yet.
      </P>
      <P>
        Ranking honesty rules: models are ranked in <em>coverage tiers</em> first — a model scored
        on two of your two selected axes always outranks one scored on only one, however high that
        single score is (the same anti-cherry-picking principle as ranking eligibility). And
        reasoning-effort/mode variants of the same weights (thinking / non-thinking) are collapsed
        to one row per checkpoint: you fine-tune a weight artifact, not an inference setting.
      </P>
      <P>
        Discovery: by default the list shows only models that fit your chosen training hardware. The{' '}
        <strong>Show: All</strong> toggle additionally surfaces models too large for it, marked
        “won’t fit” with the smallest rentable config that would work (e.g. a 405B model needs 2×
        B200) — so a huge model like Kimi K3 is findable and its requirement legible rather than
        silently missing. The “smallest config” suggestions are datacenter/consumer multi-GPU
        setups, since those are universally rentable and comparable; Apple-silicon unified-memory
        training is supported when you pick it as your own hardware but is never recommended as a
        config.
      </P>

      <H2>Versioned snapshots</H2>
      <P>
        Data is curated in git, validated, and built into an immutable snapshot bundled with each
        deploy (currently v{data.version}). The version is a content hash of the data, so it changes
        only when the data does — it keys every cache, so nothing is ever purged and the served
        numbers are always reproducible from the commit that shipped them.
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
