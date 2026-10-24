import { describe, expect, it } from 'vitest'
import { birthdayInfo, emptyArchive, generationMap, treePositions, validateArchive } from './model'

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

describe('family tree layout', () => {
  it('keeps compatible partners together and centers their children below them', () => {
    const archive = emptyArchive()
    archive.people = [
      { id: 'parent-a', firstName: 'Ada', lastName: 'Family' },
      { id: 'parent-b', firstName: 'Bea', lastName: 'Family' },
      { id: 'child-a', firstName: 'Cora', lastName: 'Family' },
      { id: 'child-b', firstName: 'Dina', lastName: 'Family' },
    ]
    archive.relationships = [
      { id: 'partner', type: 'partner', from: 'parent-a', to: 'parent-b' },
      { id: 'parent-a-child-a', type: 'parent-child', from: 'parent-a', to: 'child-a' },
      { id: 'parent-b-child-a', type: 'parent-child', from: 'parent-b', to: 'child-a' },
      { id: 'parent-a-child-b', type: 'parent-child', from: 'parent-a', to: 'child-b' },
      { id: 'parent-b-child-b', type: 'parent-child', from: 'parent-b', to: 'child-b' },
    ]

    const levels = generationMap(archive)
    const positions = treePositions(archive)
    expect(levels.get('parent-a')).toBe(levels.get('parent-b'))
    expect(levels.get('child-a')).toBe(levels.get('parent-a')! + 1)
    expect(levels.get('child-b')).toBe(levels.get('parent-a')! + 1)
    expect(positions.get('parent-a')?.y).toBe(positions.get('parent-b')?.y)
    expect(positions.get('child-a')?.y).toBe(positions.get('child-b')?.y)
    expect(Math.abs((positions.get('parent-a')!.x + positions.get('parent-b')!.x) / 2 -
      (positions.get('child-a')!.x + positions.get('child-b')!.x) / 2)).toBeLessThan(1)
  })

  it('does not align partners when doing so would create a generational cycle', () => {
    const archive = emptyArchive()
    archive.people = [
      { id: 'ancestor', firstName: 'Ada', lastName: 'Family' },
      { id: 'descendant', firstName: 'Bea', lastName: 'Family' },
    ]
    archive.relationships = [
      { id: 'parent-child', type: 'parent-child', from: 'ancestor', to: 'descendant' },
      { id: 'partner', type: 'partner', from: 'ancestor', to: 'descendant' },
    ]

    const levels = generationMap(archive)
    expect(levels.get('descendant')).toBe(levels.get('ancestor')! + 1)
  })

  it('orders child branches to follow the relative order of their parents', () => {
    const archive = emptyArchive()
    archive.people = [
      { id: 'parent-a', firstName: 'Ada', lastName: 'Family' },
      { id: 'parent-b', firstName: 'Bea', lastName: 'Family' },
      { id: 'child-a', firstName: 'Cora', lastName: 'Family' },
      { id: 'child-b', firstName: 'Dina', lastName: 'Family' },
    ]
    archive.relationships = [
      { id: 'a-to-b', type: 'parent-child', from: 'parent-a', to: 'child-b' },
      { id: 'b-to-a', type: 'parent-child', from: 'parent-b', to: 'child-a' },
    ]

    const positions = treePositions(archive)
    expect(positions.get('parent-a')!.x).toBeLessThan(positions.get('parent-b')!.x)
    expect(positions.get('child-b')!.x).toBeLessThan(positions.get('child-a')!.x)
  })
})
