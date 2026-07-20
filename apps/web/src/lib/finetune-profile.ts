import { z } from 'zod'

/**
 * Persisted fine-tune hardware profile (D10 pattern; URL still wins when present).
 * Deliberately a separate key from `modelbeats.hardware-profile`: that one means
 * "my local inference machine", while a training GPU is frequently a rented cloud box.
 */

const storedFinetuneProfileSchema = z.object({
  tgpu: z.string(),
  tn: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(8)]),
  igpu: z.string(),
})
export type StoredFinetuneProfile = z.infer<typeof storedFinetuneProfileSchema>

const KEY = 'modelbeats.finetune-profile'

export function loadFinetuneProfile(): StoredFinetuneProfile | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const parsed = storedFinetuneProfileSchema.safeParse(
      JSON.parse(localStorage.getItem(KEY) ?? 'null'),
    )
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function storeFinetuneProfile(profile: StoredFinetuneProfile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile))
  } catch {
    // non-fatal
  }
}
