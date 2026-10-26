import { describe, expect, it } from 'vitest'
import { birthdayInfo, emptyArchive, generationMap, relationTo, treePositions, uniquePeople, validateArchive } from './model'

describe('family archive validation', () => {
  it('deduplicates people by ID and preserves their first-seen order', () => {
    const first = { id: 'first', firstName: 'Sara', lastName: 'Family' }
    const second = { id: 'second', firstName: 'Elisabetta', lastName: 'Family' }

    expect(uniquePeople([first, second, first])).toEqual([first, second])
  })

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

  it('accepts optional person fields and validates the sex-at-birth value', () => {
    expect(() => validateArchive({
      schemaVersion: 1,
      people: [{
        id: 'a',
        firstName: 'Alex',
        lastName: 'Family',
        alternateName: 'Alexandra',
        sexAtBirth: 'X',
        profession: 'Researcher',
        residence: 'Rome',
        nationality: 'Italian',
      }],
      relationships: [],
    })).not.toThrow()

    expect(() => validateArchive({
      schemaVersion: 1,
      people: [{ id: 'a', firstName: 'Alex', lastName: 'Family', sexAtBirth: 'invalid' }],
      relationships: [],
    })).toThrow(/sesso alla nascita/)
  })

  it('validates marriage and partnership details while accepting legacy partners', () => {
    const people = [
      { id: 'a', firstName: 'Ada', lastName: 'Family' },
      { id: 'b', firstName: 'Bea', lastName: 'Family' },
    ]
    expect(() => validateArchive({
      schemaVersion: 1,
      people,
      relationships: [
        { id: 'legacy', type: 'partner', from: 'a', to: 'b' },
        { id: 'marriage', type: 'union', from: 'a', to: 'b', unionKind: 'marriage', unionStatus: 'ended', unionEndReason: 'divorce' },
      ],
    })).not.toThrow()
    expect(() => validateArchive({
      schemaVersion: 1,
      people,
      relationships: [
        { id: 'invalid', type: 'union', from: 'a', to: 'b', unionKind: 'marriage', unionStatus: 'current', unionEndReason: 'divorce' },
      ],
    })).toThrow(/motivo di conclusione/)
  })

  it('allows distinct union history and parent-child links for the same pair', () => {
    const archive = emptyArchive()
    archive.people = [
      { id: 'parent', firstName: 'Ada', lastName: 'Family' },
      { id: 'child', firstName: 'Bea', lastName: 'Family' },
    ]

    const union = { kind: 'marriage' as const, status: 'current' as const }
    const withUnion = relationTo(archive, 'parent', 'union', 'child', union)
    expect(() => relationTo(withUnion, 'parent', 'union', 'child', union)).toThrow(/già presente/)
    expect(() => relationTo(withUnion, 'child', 'union', 'parent', union)).toThrow(/già presente/)
    expect(relationTo(withUnion, 'parent', 'parent-child', 'child').relationships).toHaveLength(2)
    expect(relationTo(withUnion, 'parent', 'union', 'child', {
      kind: 'marriage',
      status: 'ended',
      endReason: 'divorce',
    }).relationships).toHaveLength(2)
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

  it('does not align ended unions in the tree layout', () => {
    const archive = emptyArchive()
    archive.people = [
      { id: 'ancestor', firstName: 'Ada', lastName: 'Family' },
      { id: 'descendant', firstName: 'Bea', lastName: 'Family' },
    ]
    archive.relationships = [
      { id: 'parent-child', type: 'parent-child', from: 'ancestor', to: 'descendant' },
      {
        id: 'ended-union',
        type: 'union',
        from: 'ancestor',
        to: 'descendant',
        unionKind: 'marriage',
        unionStatus: 'ended',
      },
    ]

    const levels = generationMap(archive)
    expect(levels.get('descendant')).toBe(levels.get('ancestor')! + 1)
  })

  it('keeps former spouses together but does not group former partnerships', () => {
    const archive = emptyArchive()
    archive.people = [
      { id: 'spouse-a', firstName: 'Ada', lastName: 'Family' },
      { id: 'spouse-b', firstName: 'Bea', lastName: 'Family' },
      { id: 'partner-a', firstName: 'Cora', lastName: 'Family' },
      { id: 'partner-b', firstName: 'Dina', lastName: 'Family' },
    ]
    archive.relationships = [
      {
        id: 'former-marriage',
        type: 'union',
        from: 'spouse-a',
        to: 'spouse-b',
        unionKind: 'marriage',
        unionStatus: 'ended',
        unionEndReason: 'divorce',
      },
      {
        id: 'former-partnership',
        type: 'union',
        from: 'partner-a',
        to: 'partner-b',
        unionKind: 'partnership',
        unionStatus: 'ended',
        unionEndReason: 'separation',
      },
    ]

    const positions = treePositions(archive)
    expect(Math.abs(positions.get('spouse-a')!.x - positions.get('spouse-b')!.x)).toBe(190)
    expect(Math.abs(positions.get('partner-a')!.x - positions.get('partner-b')!.x)).toBeGreaterThan(190)
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

  it('keeps children of the same parents together in their generation', () => {
    const archive = emptyArchive()
    archive.people = [
      { id: 'parent-a', firstName: 'Ada', lastName: 'Family' },
      { id: 'parent-b', firstName: 'Bea', lastName: 'Family' },
      { id: 'other-parent-a', firstName: 'Cora', lastName: 'Family' },
      { id: 'other-parent-b', firstName: 'Dina', lastName: 'Family' },
      { id: 'sibling-a', firstName: 'Elena', lastName: 'Family' },
      { id: 'unrelated-child', firstName: 'Frida', lastName: 'Family' },
      { id: 'sibling-z', firstName: 'Greta', lastName: 'Family' },
      { id: 'sibling-a-partner', firstName: 'Hana', lastName: 'Family' },
      { id: 'sibling-z-partner', firstName: 'Iris', lastName: 'Family' },
    ]
    archive.relationships = [
      { id: 'partner-a', type: 'partner', from: 'parent-a', to: 'parent-b' },
      { id: 'partner-b', type: 'partner', from: 'other-parent-a', to: 'other-parent-b' },
      { id: 'sibling-a-partner', type: 'partner', from: 'sibling-a', to: 'sibling-a-partner' },
      { id: 'sibling-z-partner', type: 'partner', from: 'sibling-z', to: 'sibling-z-partner' },
      { id: 'parent-a-sibling-a', type: 'parent-child', from: 'parent-a', to: 'sibling-a' },
      { id: 'parent-b-sibling-a', type: 'parent-child', from: 'parent-b', to: 'sibling-a' },
      { id: 'parent-a-sibling-z', type: 'parent-child', from: 'parent-a', to: 'sibling-z' },
      { id: 'parent-b-sibling-z', type: 'parent-child', from: 'parent-b', to: 'sibling-z' },
      { id: 'other-parent-a-child', type: 'parent-child', from: 'other-parent-a', to: 'unrelated-child' },
      { id: 'other-parent-b-child', type: 'parent-child', from: 'other-parent-b', to: 'unrelated-child' },
    ]

    const positions = treePositions(archive)
    const siblingXs = ['sibling-a', 'sibling-a-partner', 'sibling-z', 'sibling-z-partner']
      .map((personId) => positions.get(personId)!.x)
    const unrelatedX = positions.get('unrelated-child')!.x

    expect(positions.get('sibling-a')!.y).toBe(positions.get('sibling-z')!.y)
    expect(unrelatedX < Math.min(...siblingXs) || unrelatedX > Math.max(...siblingXs)).toBe(true)
  })

  it('centers parent groups over their children using each group’s actual width', () => {
    const archive = emptyArchive()
    archive.people = [
      { id: 'parent-a', firstName: 'Ada', lastName: 'Family' },
      { id: 'parent-b', firstName: 'Bea', lastName: 'Family' },
      { id: 'other-parent-a', firstName: 'Cora', lastName: 'Family' },
      { id: 'other-parent-b', firstName: 'Dina', lastName: 'Family' },
      { id: 'child-a', firstName: 'Elena', lastName: 'Family' },
      { id: 'child-a-partner', firstName: 'Frida', lastName: 'Family' },
      { id: 'child-b', firstName: 'Greta', lastName: 'Family' },
      { id: 'child-b-partner', firstName: 'Hana', lastName: 'Family' },
      { id: 'other-child', firstName: 'Iris', lastName: 'Family' },
    ]
    archive.relationships = [
      { id: 'partner-a', type: 'partner', from: 'parent-a', to: 'parent-b' },
      { id: 'partner-b', type: 'partner', from: 'other-parent-a', to: 'other-parent-b' },
      { id: 'child-a-partner', type: 'partner', from: 'child-a', to: 'child-a-partner' },
      { id: 'child-b-partner', type: 'partner', from: 'child-b', to: 'child-b-partner' },
      { id: 'parent-a-child-a', type: 'parent-child', from: 'parent-a', to: 'child-a' },
      { id: 'parent-b-child-a', type: 'parent-child', from: 'parent-b', to: 'child-a' },
      { id: 'parent-a-child-b', type: 'parent-child', from: 'parent-a', to: 'child-b' },
      { id: 'parent-b-child-b', type: 'parent-child', from: 'parent-b', to: 'child-b' },
      { id: 'other-parent-a-child', type: 'parent-child', from: 'other-parent-a', to: 'other-child' },
      { id: 'other-parent-b-child', type: 'parent-child', from: 'other-parent-b', to: 'other-child' },
    ]

    const positions = treePositions(archive)
    const parentCenter = (positions.get('parent-a')!.x + positions.get('parent-b')!.x) / 2
    const childrenCenter = (positions.get('child-a')!.x + positions.get('child-b')!.x) / 2

    expect(parentCenter).toBe(childrenCenter)
  })

  it('keeps a parent centered over many children while converging the layout', () => {
    const archive = emptyArchive()
    archive.people = [
      { id: 'father', firstName: 'Adam', lastName: 'Family' },
      ...Array.from({ length: 18 }, (_, index) => ([
        { id: `child-${index}`, firstName: `Child${index}`, lastName: 'Family' },
        { id: `partner-${index}`, firstName: `Partner${index}`, lastName: 'Family' },
      ])).flat(),
    ]
    archive.relationships = Array.from({ length: 18 }, (_, index) => ([
      { id: `parent-${index}`, type: 'parent-child' as const, from: 'father', to: `child-${index}` },
      { id: `partner-${index}`, type: 'partner' as const, from: `child-${index}`, to: `partner-${index}` },
    ])).flat()

    const positions = treePositions(archive)
    const meanChildX = Array.from({ length: 18 }, (_, index) => positions.get(`child-${index}`)!.x)
      .reduce((total, x) => total + x, 0) / 18

    expect(Math.abs(positions.get('father')!.x - meanChildX)).toBeLessThan(1)
  })

  it('centers Marilena and her partner over their children in a wide sibling tree', () => {
    const archive = emptyArchive()
    const people = new Map<string, { id: string; firstName: string; lastName: string }>()
    const relationships = archive.relationships
    const addPerson = (id: string) => {
      const [firstName, ...lastName] = id.split('-')
      people.set(id, { id, firstName: firstName!, lastName: lastName.join(' ') || 'Family' })
    }
    const addPartner = (first: string, second: string) => {
      relationships.push({ id: `partner-${first}-${second}`, type: 'partner', from: first, to: second })
    }
    const addChild = (parent: string, child: string) => {
      relationships.push({ id: `parent-${parent}-${child}`, type: 'parent-child', from: parent, to: child })
    }
    const families = [
      ['marilena', 'andrea-bertolino', ['lucilla', 'gianna', 'manuela']],
      ['daniela', 'luigi-mortellaro', ['domenico', 'arianna']],
      ['piera', 'rosario-garofalo', ['mario', 'ilaria', 'valeria', 'giuliana', 'eleonora']],
      ['concetta', 'antonio-russo', ['gabriella', 'piergiorgio', 'alessandra', 'gianfranco', 'simonetta']],
      ['antonino', 'anna-cognome', ['tea']],
      ['silvana', 'giuseppe-genovese', ['andrea-genovese', 'giulio-genovese', 'marina', 'marco']],
    ] as const
    addPerson('matteo-moltisanti')
    addPerson('giovanna-gennaro')
    addPartner('matteo-moltisanti', 'giovanna-gennaro')
    for (const [sibling, partner, children] of families) {
      addPerson(sibling)
      addPerson(partner)
      addPartner(sibling, partner)
      addChild('matteo-moltisanti', sibling)
      addChild('giovanna-gennaro', sibling)
      for (const child of children) {
        addPerson(child)
        addChild(sibling, child)
        addChild(partner, child)
      }
    }
    for (const child of [...families[0][2], ...families[2][2].slice(0, 2)]) {
      const partner = `partner-${child}`
      addPerson(partner)
      addPartner(child, partner)
      for (let index = 0; index < 2; index += 1) {
        const grandchild = `${child}-child-${index}`
        addPerson(grandchild)
        addChild(child, grandchild)
        addChild(partner, grandchild)
      }
    }
    archive.people = [...people.values()]

    const positions = treePositions(archive)
    const parentCenter = (positions.get('marilena')!.x + positions.get('andrea-bertolino')!.x) / 2
    const children = families[0][2]
    const childrenCenter = children.reduce((total, id) => total + positions.get(id)!.x, 0) / children.length

    expect(Math.abs(parentCenter - childrenCenter)).toBeLessThan(1)
    expect(positions.get('mario')!.y).toBe(positions.get('lucilla')!.y)
    expect(positions.get('mario')!.x).toBeGreaterThan(
      Math.max(...children.map((id) => positions.get(id)!.x)) + 80,
    )
  })

})
