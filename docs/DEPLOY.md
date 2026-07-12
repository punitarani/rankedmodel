# Deploy Runbook

> Everything in this repo runs and verifies **fully locally** (miniflare state in
> `apps/web/.wrangler/state`). Real deploys are credential-gated and manual by design.

## One-time setup (per environment)

1. **Create resources** (staging shown; repeat for production without the suffix):

   ```sh
   cd apps/web
   bunx wrangler d1 create rankedmodel-staging
   bunx wrangler kv namespace create CATALOG-staging
   ```

2. **Fill the ids** into `apps/web/wrangler.jsonc` under `env.staging` /
   `env.production`, replacing the `REPLACE_AT_DEPLOY_*` placeholders.

3. **Token**: export `CLOUDFLARE_API_TOKEN` with Workers Scripts, D1 and Workers KV
   edit scopes (plus `CLOUDFLARE_ACCOUNT_ID` if the token spans accounts).

## Deploying

```sh
bun run deploy:staging      # migrate remote D1 → build → wrangler deploy --env staging → publish data
bun run deploy:production   # same against production
```

`scripts/src/deploy.ts` fails fast with these instructions when no credentials are
present. Remote data publishes reuse the exact local pipeline (`publish-data --remote`);
`RANKEDMODEL_ENV` threads the `--env` flag into every wrangler call.

## Invalidation model (arch §9)

Publishing bumps `meta.data_version`; the new snapshot lands at the immutable
`catalog:v{N}` KV key. Every cache — browser, edge, TanStack Query — is keyed by that
version, so **there is nothing to purge, ever**. Rollback = point `data_version` back at
an older N (all versions are retained).

## What local verification cannot prove

- **Edge-cache behavior** (`s-maxage`/SWR at Cloudflare's CDN) — headers are asserted in
  e2e, but real edge semantics only show up post-deploy. Smoke-check with
  `curl -sI https://<host>/api/catalog/v1.json` after the first deploy.
- **D1 read replication** — the Sessions API code path (`first-unconstrained`) is
  exercised locally as a no-op; enable replication on the production database in the
  Cloudflare dashboard to activate it.
- **Workers Logs / Analytics** — `observability.enabled` is on in wrangler.jsonc;
  dashboards exist only once deployed.

## Phase-4 sketch: ingestion-as-PR automation (COMPETITIVE_ANALYSIS §5.2)

Freshness is the #1 competitive deficit; the architecture already supports closing it
without structural change:

1. A **Cron Trigger** Worker (or GitHub Action) polls upstream sources — models.dev
   (MIT JSON API: specs + pricing), LMArena's published leaderboard dataset (Elo),
   OpenRouter's API (catalog/pricing deltas).
2. It renders the diffs **as curated-file changes** (`data/**` JSON/CSV) and opens a PR.
3. CI runs `validate-data` + golden tests; the admin reviews the diff like any other —
   automation proposes, curation disposes.
4. Merge → the normal publish pipeline ships it.

Nothing about the running site changes; the moat stays the reviewed dataset.
