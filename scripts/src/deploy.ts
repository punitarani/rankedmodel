import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

/**
 * Credential-gated deploy (plan commit 33). Never run by CI in this repo's current
 * state — a human runs it once real Cloudflare resources exist. See docs/DEPLOY.md.
 *
 *   bun run deploy:staging      migrate remote D1 → deploy Worker → publish data
 *   bun run deploy:production   same, against the production env
 */

const env = process.argv[2]
if (env !== 'staging' && env !== 'production') {
  console.error('usage: bun scripts/src/deploy.ts <staging|production>')
  process.exit(1)
}

if (!process.env.CLOUDFLARE_API_TOKEN && !process.env.CLOUDFLARE_ACCOUNT_ID) {
  console.error(`✗ No Cloudflare credentials in the environment.

This deploy is credential-gated on purpose. To ship ${env}:
  1. Create the resources once:   wrangler d1 create rankedmodel${env === 'staging' ? '-staging' : ''}
                                  wrangler kv namespace create CATALOG${env === 'staging' ? ' --preview' : ''}
  2. Paste the returned ids into apps/web/wrangler.jsonc under env.${env}
     (replace the REPLACE_AT_DEPLOY_${env}_* placeholders).
  3. Export CLOUDFLARE_API_TOKEN (Workers+D1+KV edit scopes), then rerun this command.

Full runbook: docs/DEPLOY.md`)
  process.exit(1)
}

const WEB_DIR = resolve(import.meta.dirname, '..', '..', 'apps', 'web')
const run = (cmd: string, args: string[], cwd?: string) => {
  console.log(`\n$ ${cmd} ${args.join(' ')}`)
  const res = spawnSync(cmd, args, {
    cwd: cwd ?? process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, RANKEDMODEL_ENV: env },
  })
  if (res.status !== 0) {
    console.error(`✗ step failed (exit ${res.status}) — aborting deploy`)
    process.exit(res.status ?? 1)
  }
}

// 1. schema to remote D1 (tracked in d1_migrations)
run('bunx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--remote', '--env', env], WEB_DIR)
// 2. build + deploy the Worker
run('bunx', ['vite', 'build'], WEB_DIR)
run('bunx', ['wrangler', 'deploy', '--env', env], WEB_DIR)
// 3. publish data (validate → derive → seed remote → snapshot remote + version bump)
run('bun', ['scripts/src/publish-data.ts', '--remote'])

console.log(`\n✓ ${env} deployed. Cache invalidation is the version bump — nothing to purge.`)
