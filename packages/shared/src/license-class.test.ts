import { describe, expect, it } from 'vitest'
import { LICENSE_CLASSES, licenseClass } from './license-class'

/** Strings are verbatim from the curated corpus — the rule table is pinned to real data. */
describe('licenseClass rule table (C8)', () => {
  it.each([
    // permissive
    ['Apache 2.0', 'permissive'],
    ['Apache-2.0', 'permissive'],
    ['Apache License 2.0', 'permissive'],
    ['MIT', 'permissive'],
    ['Modified MIT License', 'permissive'],
    ['BSD-3-Clause', 'permissive'],
    ['CC BY-SA-4.0', 'permissive'],
    ['OpenMDW-1.1', 'permissive'],
    // conditional — custom/community licenses with terms of their own
    ['Llama 3.1 Community License Agreement', 'conditional'],
    ['Gemma Terms of Use', 'conditional'],
    [
      'Tongyi Qianwen LICENSE AGREEMENT (custom, free commercial use below usage threshold)',
      'conditional',
    ],
    ['NVIDIA Open Model License', 'conditional'],
    ['TII Falcon-LLM License 2.0', 'conditional'],
    ['Jamba Open Model License', 'conditional'],
    // conditional — the permissive term describes the code, not the weights
    ['DeepSeek Model License (code: MIT)', 'conditional'],
    ['BigCode OpenRAIL-M', 'conditional'],
    [
      'Qwen License (InternViT component MIT; Qwen2.5-72B-Instruct component under Qwen License)',
      'conditional',
    ],
    ['Apache-2.0 (with condition not to compete with OpenAI)', 'conditional'],
    ['Apple Sample Code License', 'conditional'],
    // research-only — restriction wins over any permissive term in the same string
    [
      'Mistral Research License (non-commercial; commercial license required for production)',
      'research-only',
    ],
    ['CC-BY-NC', 'research-only'],
    ['CC-BY-NC-4.0 (+ Acceptable Use Policy)', 'research-only'],
    ['EXAONE AI Model License Agreement 1.1 - NC', 'research-only'],
    ['EXAONE AI Model License (research/academic/educational use)', 'research-only'],
    ['Mistral AI Non-Production License (MNPL-0.1)', 'research-only'],
    ['Microsoft Research License', 'research-only'],
    [
      'Apache-2.0 (mono/multi variants; instruct variant is research-purposes-only)',
      'research-only',
    ],
    [
      'Apache-2.0 (LoRA adapter); base LLaMA-33B weights under Meta’s non-commercial research license',
      'research-only',
    ],
    ['LLaMA Non-Commercial Research License (gated application access)', 'research-only'],
  ] as const)('%s → %s', (license, expected) => {
    expect(licenseClass(license, 'open-weights')).toBe(expected)
  })

  it('closed models are proprietary regardless of the string', () => {
    expect(licenseClass('Proprietary', 'closed')).toBe('proprietary')
    expect(licenseClass('MIT', 'closed')).toBe('proprietary')
  })

  it('unknown/custom strings default to conditional, never permissive', () => {
    expect(licenseClass('', 'open-weights')).toBe('conditional')
    expect(licenseClass('Some Future Model License v9', 'open-weights')).toBe('conditional')
    expect(
      licenseClass(
        'Unpublished (gated preview; the official HuggingFace model card states final license text is not yet finalized, though the consortium claims it meets the Open Source AI Definition 1.0)',
        'open-source',
      ),
    ).toBe('conditional')
  })

  it('every classification is a member of LICENSE_CLASSES', () => {
    for (const s of ['Apache 2.0', 'Gemma', 'CC-BY-NC', 'x']) {
      expect(LICENSE_CLASSES).toContain(licenseClass(s, 'open-weights'))
    }
  })
})
