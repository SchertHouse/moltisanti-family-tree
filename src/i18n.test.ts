import { describe, expect, it } from 'vitest'
import { translations } from './i18n'

describe('translations', () => {
  it('contains matching interface keys in every supported language', () => {
    const keys = Object.keys(translations.en).sort()
    expect(Object.keys(translations.it).sort()).toEqual(keys)
    expect(Object.keys(translations.eo).sort()).toEqual(keys)
  })
})
