import { readFile, writeFile } from 'node:fs/promises'

/**
 * Offline shortlist aggregator (P2 prep). Reads the selection workflow's journal.jsonl
 * (each result = `{ models:[stub,...] }`), dedups the union across cluster agents into the
 * clean flagship+major-open+landmark work-list, and writes corpus/shortlist.json.
 *
 * Usage: bun scripts/src/shortlist-merge.ts <journal.jsonl> [out=corpus/shortlist.json]
 */

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const ORG_ALIASES: Record<string, string> = {
  'meta ai': 'Meta',
  'meta platforms': 'Meta',
  'google deepmind': 'Google',
  'google research': 'Google',
  deepmind: 'Google',
  thudm: 'Zhipu AI',
  'zhipu ai / thudm': 'Zhipu AI',
  qwen: 'Alibaba',
  'alibaba cloud': 'Alibaba',
  'alibaba (qwen)': 'Alibaba',
  'x.ai': 'xAI',
  mistral: 'Mistral AI',
  'allen institute for ai': 'Allen Institute for AI (AI2)',
  ai2: 'Allen Institute for AI (AI2)',
  'technology innovation institute': 'TII',
  'technology innovation institute (tii)': 'TII',
  huggingface: 'Hugging Face',
  '01 ai': '01.AI',
  '01-ai': '01.AI',
  'shanghai ai laboratory': 'InternLM (Shanghai AI Lab)',
  'shanghai ai lab': 'InternLM (Shanghai AI Lab)',
  moonshot: 'Moonshot AI',
}
const canonOrg = (org: string): string => ORG_ALIASES[org.trim().toLowerCase()] ?? org.trim()

const normName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s*(\d+(?:\.\d+)?)\s*b\b/g, ' $1b ')
    .replace(/\s+/g, ' ')
    .trim()

interface Stub {
  name: string
  org: string
  family: string
  releaseDate: string
  openness: string
  paramsB: number | null
  kind: string
  note: string
  sourceUrl?: string
}

interface Entry extends Stub {
  orgSlug: string
  aliases: string[]
}

async function main() {
  const journalPath = process.argv[2]
  const out = process.argv[3] ?? 'corpus/shortlist.json'
  if (!journalPath) throw new Error('usage: shortlist-merge <journal.jsonl> [out]')

  const lines = (await readFile(journalPath, 'utf8')).split('\n').filter((l) => l.trim())
  const raw: Stub[] = []
  let agents = 0
  for (const line of lines) {
    let o: { type?: string; result?: { models?: Stub[] } }
    try {
      o = JSON.parse(line)
    } catch {
      continue
    }
    if (o.type !== 'result') continue
    agents++
    for (const m of o.result?.models ?? []) {
      if (!m?.name || !m?.org) continue
      // Scope: GPT-3 (June 2020) onward.
      if (/^\d{4}/.test(m.releaseDate) && m.releaseDate.slice(0, 4) < '2020') continue
      raw.push(m)
    }
  }

  const byKey = new Map<string, Entry>()
  for (const m of raw) {
    const org = canonOrg(m.org)
    const orgSlug = slugify(org)
    const key = `${orgSlug}::${normName(m.name)}`
    const ex = byKey.get(key)
    if (!ex) {
      byKey.set(key, {
        name: m.name.trim(),
        org,
        orgSlug,
        family: m.family?.trim() || m.name.trim(),
        releaseDate: m.releaseDate,
        openness: m.openness,
        paramsB: typeof m.paramsB === 'number' ? m.paramsB : null,
        kind: m.kind ?? 'major-open',
        note: m.note ?? '',
        sourceUrl: m.sourceUrl,
        aliases: [],
      })
    } else {
      if (m.name.trim() !== ex.name && !ex.aliases.includes(m.name.trim()))
        ex.aliases.push(m.name.trim())
      if (m.releaseDate && m.releaseDate.length > ex.releaseDate.length)
        ex.releaseDate = m.releaseDate
      if (ex.paramsB == null && typeof m.paramsB === 'number') ex.paramsB = m.paramsB
    }
  }

  const models = [...byKey.values()].sort(
    (a, b) =>
      a.orgSlug.localeCompare(b.orgSlug) ||
      a.releaseDate.localeCompare(b.releaseDate) ||
      a.name.localeCompare(b.name),
  )

  const count = <T>(arr: T[], f: (x: T) => string) => {
    const m = new Map<string, number>()
    for (const x of arr) m.set(f(x), (m.get(f(x)) ?? 0) + 1)
    return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]))
  }
  const stats = {
    agents,
    rawStubs: raw.length,
    canonical: models.length,
    orgs: new Set(models.map((m) => m.orgSlug)).size,
    byOpenness: count(models, (m) => m.openness),
    byKind: count(models, (m) => m.kind),
    byYear: count(models, (m) =>
      /^\d{4}/.test(m.releaseDate) ? m.releaseDate.slice(0, 4) : 'unknown',
    ),
    topOrgs: Object.fromEntries(Object.entries(count(models, (m) => m.org)).slice(0, 30)),
  }

  await writeFile(out, `${JSON.stringify({ stats, models }, null, 2)}\n`)
  console.log(
    `shortlist: ${raw.length} stubs → ${models.length} canonical across ${stats.orgs} orgs (from ${agents} agents)`,
  )
  console.log(`openness: ${JSON.stringify(stats.byOpenness)}`)
  console.log(`kind: ${JSON.stringify(stats.byKind)}`)
  console.log(`by year: ${JSON.stringify(stats.byYear)}`)
}

main()
