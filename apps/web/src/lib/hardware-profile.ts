import { z } from 'zod'

/** Persisted hardware profile (D10 localStorage; URL still wins when present). */

const storedProfileSchema = z.union([
  z.object({ kind: z.literal('profile'), slug: z.string() }),
  z.object({ kind: z.literal('manual'), vramGb: z.number().positive().max(2048) }),
])
export type StoredProfile = z.infer<typeof storedProfileSchema>

const KEY = 'rankedmodel.hardware-profile'

export function loadProfile(): StoredProfile | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const parsed = storedProfileSchema.safeParse(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function storeProfile(profile: StoredProfile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile))
  } catch {
    // non-fatal
  }
}
