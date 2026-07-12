# Contributing data

The repo **is** the CMS: every model, benchmark and score is a reviewable file under
`data/`, and CI blocks anything inconsistent. Corrections and additions are welcome as
pull requests — provenance rules below.

## Add a model

1. Create `data/models/{orgSlug}/{model-slug}.json`. Copy a neighbor as the template —
   the schema is `modelSchema` in `packages/shared/src/schema/model.ts`. Notes:
   - `ctxK` is in **K tokens** (`128` = 128K, `2000` = 2M).
   - `paramsB: null` means undisclosed (closed models).
   - `predecessor` must be a **strictly older** model in the same family (same-day
     releases are size variants — leave `null`).
   - `vramQ4Gb`/`vramFp16Gb` are curated ground truth for the fit engine; only include
     figures you can back up.
   - `capabilities.vision` must mirror `"vision"` in `modalities` (validated).
2. If the org or family is new, add `data/organizations/{slug}.json` /
   `data/families/{slug}.json`.
3. Append one row per benchmark to `data/results/{benchmark}.csv`:
   `model_slug,score,source,source_url,evaluated_at,notes`. Pick the honest `source`:
   `independent` (third-party harness), `arena`, `admin-run`, `self-reported` (vendor
   numbers), or `curated` (assembled from public reporting). Independent beats
   self-reported when both exist — the site picks headlines by that precedence.
4. If the model has a first-party API, add a `data/pricing/api-pricing.csv` row
   (required whenever the model file has `price`, and vice versa).
5. Run the gates:

   ```sh
   bun run validate-data        # referential integrity, bounds, provenance, placement
   bun run derive               # refresh data/derived/scores.json (commit the diff!)
   bun run test                 # golden tests catch unintended index shifts
   ```

The derived-scores diff in your PR shows exactly how rankings move — that diff **is**
the review.

## Add a benchmark

1. `data/benchmarks/{slug}.json` — name, category, unit, description, and the curated
   normalization bounds `normMin`/`normMax` (choose a floor/ceiling that will stay
   stable; see `/methodology`).
2. `data/results/{slug}.csv` with whatever scores you have.
3. Same gates as above. No schema or code changes needed — that's the point.

## Ground rules

- Never edit `data/derived/` by hand; always regenerate via `bun run derive`.
- Cite sources in `source_url` wherever one exists.
- One logical change per PR (a model, a benchmark, a correction) keeps diffs reviewable.
