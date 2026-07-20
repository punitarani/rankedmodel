import type { Openness } from './enums'

/**
 * License classification (contract C8) — collapses the corpus's free-text `license`
 * strings into a filterable class for the fine-tune selector. Keyword rules, first
 * match wins, ordered conservative-first: a string naming both a permissive term and
 * a restriction classifies by the restriction, because the restricted part is always
 * the weights you'd be fine-tuning ("Apache-2.0 (code); custom Model License for
 * weights…"). Unknown/custom licenses land on `conditional` — "read the license" —
 * never on `permissive`.
 */

export const LICENSE_CLASSES = [
  'permissive',
  'conditional',
  'research-only',
  'proprietary',
] as const
export type LicenseClass = (typeof LICENSE_CLASSES)[number]

export const LICENSE_CLASS_LABELS: Record<LicenseClass, string> = {
  permissive: 'Permissive',
  conditional: 'Conditional / custom',
  'research-only': 'Research only',
  proprietary: 'Proprietary',
}

/** One-word labels for dense table cells / badges. */
export const LICENSE_CLASS_SHORT: Record<LicenseClass, string> = {
  permissive: 'Permissive',
  conditional: 'Conditional',
  'research-only': 'Research',
  proprietary: 'Proprietary',
}

/** Freedom order for the "at most this restrictive" filter (proprietary is never offered). */
export const LICENSE_CLASS_ORDER = ['permissive', 'conditional', 'research-only'] as const

/** Use restrictions: NC clauses, research/academic-only terms, non-production licenses. */
const RESEARCH_ONLY_RE =
  /non-?commercial|research[-\s/]?(only|use|license|purposes)|academic|non-?production|\bnc\b/i
/** A permissive term that describes the CODE while the weights carry their own license. */
const CODE_SPLIT_RE = /code|component|with condition/i
const PERMISSIVE_RE = /apache|\bmit\b|\bbsd\b|cc[-\s]by\b|openmdw/i

export function licenseClass(license: string, openness: Openness): LicenseClass {
  if (openness === 'closed') return 'proprietary'
  if (RESEARCH_ONLY_RE.test(license)) return 'research-only'
  if (CODE_SPLIT_RE.test(license)) return 'conditional'
  if (PERMISSIVE_RE.test(license)) return 'permissive'
  return 'conditional'
}
