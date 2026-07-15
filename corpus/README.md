# Research corpus

The intermediate, provenance-carrying dataset the research pipeline produces and the
`generate-dataset` script consumes. **This is the auditable research trail** — every model's
specs carry `specSources`, and every benchmark row carries a real `source` + resolvable
`sourceUrl`. The generator turns this into the shipped `/data/**` tree (deterministically),
assigning slugs, family lineage, and the per-benchmark CSV split.

## Layout

```
corpus/
  models/<anyGrouping>/<name>.json   one file per model (grouping is free; the generator
                                     derives orgSlug and writes to data/models/{orgSlug}/)
  benchmarks.json                    the benchmark catalog: slug, name, category (one of the
                                     7), unit, description, normMin/normMax (curated bounds —
                                     power the category radar/bars only; the headline ranking
                                     is the pairwise Frontier Elo, D21)
  organizations.json                 org metadata: name, type, country?, url?, description?
  hardware.json                      GPU/accelerator profiles (carried over; stable)
  meta.json                          { asOf }  — asOfIso is derived at generation
  census.json                        the Phase-1 canonical model list (work-list; not read by
                                     the generator — it seeds the deep-research phase)
```

## Contract

Schemas: `scripts/src/lib/corpus-schema.ts`. Every field, enum, and the citation-required rule
(`sourceUrl` is a mandatory `z.url()` on every result row) is enforced there — a malformed
corpus fails `loadCorpus` with a path. The generator additionally reconciles
`capabilities.vision` to `modalities.includes('vision')`, guards `activeParamsB ≤ paramsB` and
`vramQ4Gb < vramFp16Gb`, runs a bound-fit check against each benchmark's tolerance window, and
finally self-validates the generated `/data` — so an invalid tree can never be written.

## Regenerate `/data`

```sh
bun run generate-dataset      # corpus/ → data/ (validates; aborts on any error)
```

Units: `paramsB` in billions (dense total; MoE also sets `activeParamsB`), `ctxK` in K-tokens
(128 = 128K, 2000 = 2M), price per-Mtok, dates `YYYY-MM-DD`. `links` are bare identifiers
(`meta-llama/Meta-Llama-3-8B`), not URLs.
