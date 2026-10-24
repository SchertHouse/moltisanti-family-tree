import { describe, expect, it } from 'vitest'
import { birthdayInfo, emptyArchive, validateArchive } from './model'

describe('family archive validation', () => {
  it('accepts an empty archive and rejects duplicate people', () => {
    expect(() => validateArchive(emptyArchive())).not.toThrow()
    const person = { id: 'a', firstName: 'Ada', lastName: 'Test' }
    expect(() => validateArchive({ schemaVersion: 1, people: [person, person], relationships: [] })).toThrow(/duplicato/)
  })

  it('rejects missing relationship references and parent cycles', () => {
    const people = [{ id: 'a', firstName: 'A', lastName: 'A' }, { id: 'b', firstName: 'B', lastName: 'B' }]
    expect(() => validateArchive({
      schemaVersion: 1, people, relationships: [{ id: 'r', type: 'partner', from: 'a', to: 'x' }],
    })).toThrow(/inesistenti/)
    expect(() => validateArchive({
      schemaVersion: 1, people, relationships: [
        { id: 'r1', type: 'parent-child', from: 'a', to: 'b' },
        { id: 'r2', type: 'parent-child', from: 'b', to: 'a' },
      ],
    })).toThrow(/ciclo/)
  })

  it('rejects impossible dates and photos pointing to an external URL', () => {
    expect(() => validateArchive({
      schemaVersion: 1,
      people: [{ id: 'a', firstName: 'A', lastName: 'A', birthDate: '2024-02-30' }],
      relationships: [],
    })).toThrow(/Data non valida/)
    expect(() => validateArchive({
      schemaVersion: 1,
      people: [{ id: 'a', firstName: 'A', lastName: 'A', photo: 'https://example.invalid/photo.jpg' }],
      relationships: [],
    })).toThrow(/immagini raster/)
  })
})

describe('birthday dates', () => {
  it('returns today as the next birthday and finds the next leap-day birthday', () => {
    expect(birthdayInfo('1990-06-01', new Date(2026, 5, 1))?.days).toBe(0)
    expect(birthdayInfo('2000-02-29', new Date(2025, 0, 1))?.date.getFullYear()).toBe(2028)
  })
})
