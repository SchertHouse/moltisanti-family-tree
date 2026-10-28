import { describe, expect, it } from 'vitest'
import {
  birthdayInfo, emptyArchive, familyConnectorBridges, familyConnectorPath, familyConnectorRoutes, generationMap,
  partnerConnectorGeometry, relationTo, treePositions, uniquePeople, validateArchive, type FamilyArchive,
} from './model'

describe('family archive validation', () => {
  it('keeps unobstructed partner connectors straight', () => {
    const positions = new Map([
      ['partner-a', { x: 0, y: 0 }],
      ['partner-b', { x: 240, y: 0 }],
    ])

    expect(partnerConnectorGeometry('partner-a', 'partner-b', positions)).toEqual({
      path: 'M 80 0 L 160 0',
      heartX: 120,
      heartY: 0,
    })
  })

  it('routes around an intervening person with smooth 45-degree corner tangents', () => {
    const positions = new Map([
      ['partner-a', { x: 0, y: 0 }],
      ['partner-b', { x: 400, y: 0 }],
      ['intervening-person', { x: 200, y: 0 }],
    ])
    const connector = partnerConnectorGeometry('partner-a', 'partner-b', positions)

    expect(connector.path).toContain('M 80 -52 C 88 -60, 192 -60, 200 -60 C 208 -60, 312 -60, 320 -52')
    expect(Math.abs(connector.heartY)).toBeGreaterThan(56)
  })

  it('places the bypass midway between the descendant bus and skipped card', () => {
    const positions = new Map([
      ['partner-a', { x: 0, y: 0 }],
      ['partner-b', { x: 400, y: 0 }],
      ['intervening-person', { x: 200, y: 0 }],
    ])
    const connector = partnerConnectorGeometry(
      'partner-a', 'partner-b', positions, positions.keys(), new Map([['intervening-person', -72]]),
    )

    expect(connector.heartY).toBe(-62)
    expect(connector.path).toContain('200 -62')
  })

  it('chooses the lowest clear arc when one side needs a wider detour', () => {
    const positions = new Map([
      ['partner-a', { x: 0, y: 0 }],
      ['partner-b', { x: 400, y: 0 }],
      ['intervening-person', { x: 200, y: 0 }],
      ['upper-obstacle', { x: 200, y: -100 }],
    ])
    const connector = partnerConnectorGeometry('partner-a', 'partner-b', positions)

    expect(connector.heartY).toBeGreaterThan(56)
    expect(connector.heartY).toBeLessThan(65)
  })

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

  it('validates a deep family line without using the JavaScript call stack', () => {
    const people = Array.from({ length: 12_000 }, (_, index) => ({
      id: `person-${index}`,
      firstName: 'Person',
      lastName: String(index),
    }))
    const archive: FamilyArchive = {
      schemaVersion: 1,
      people,
      relationships: people.slice(1).map((person, index) => ({
        id: `relationship-${index}`,
        type: 'parent-child',
        from: people[index]!.id,
        to: person.id,
      })),
    }

    expect(() => validateArchive(archive)).not.toThrow()
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
    const today = birthdayInfo('1990-06-01', new Date(2026, 5, 1))
    const leapDay = birthdayInfo('2000-02-29', new Date(2025, 0, 1))
    expect(today?.precision).toBe('day')
    expect(today?.precision === 'day' && today.days).toBe(0)
    expect(leapDay?.precision === 'day' && leapDay.date.getFullYear()).toBe(2028)
  })

  it('shows a month-only reminder without inventing a day or countdown', () => {
    expect(birthdayInfo('1990-06', new Date(2026, 5, 1))).toEqual({
      precision: 'month',
      month: 5,
    })
  })

  it('does not show a birthday reminder when only the birth year is known', () => {
    expect(birthdayInfo('1990', new Date(2026, 5, 1))).toBeNull()
  })

  it('rejects impossible birthday month and day values', () => {
    expect(birthdayInfo('1990-13')).toBeNull()
    expect(birthdayInfo('1990-02-30')).toBeNull()
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

  it('keeps children sharing one parent together across different co-parents', () => {
    const archive = emptyArchive()
    archive.people = [
      { id: 'parent', firstName: 'Alice', lastName: 'Family' },
      { id: 'co-parent-a', firstName: 'Davide', lastName: 'Family' },
      { id: 'co-parent-b', firstName: 'Giuseppe', lastName: 'Family' },
      { id: 'child-a', firstName: 'Danilo', lastName: 'Family' },
      { id: 'child-c', firstName: 'Michelangelo', lastName: 'Family' },
      { id: 'other-parent-a', firstName: 'Greta', lastName: 'Family' },
      { id: 'other-parent-b', firstName: 'Hana', lastName: 'Family' },
      { id: 'child-b-other', firstName: 'Iris', lastName: 'Family' },
    ]
    archive.relationships = [
      {
        id: 'current-partner-a',
        type: 'union',
        from: 'parent',
        to: 'co-parent-a',
        unionKind: 'partnership',
        unionStatus: 'current',
      },
      {
        id: 'former-marriage-b',
        type: 'union',
        from: 'parent',
        to: 'co-parent-b',
        unionKind: 'marriage',
        unionStatus: 'ended',
        unionEndReason: 'divorce',
      },
      { id: 'parent-child-a', type: 'parent-child', from: 'parent', to: 'child-a' },
      { id: 'co-parent-b-child-a', type: 'parent-child', from: 'co-parent-b', to: 'child-a' },
      { id: 'parent-child-c', type: 'parent-child', from: 'parent', to: 'child-c' },
      { id: 'co-parent-a-child-c', type: 'parent-child', from: 'co-parent-a', to: 'child-c' },
      { id: 'other-parent-a-child', type: 'parent-child', from: 'other-parent-a', to: 'child-b-other' },
      { id: 'other-parent-b-child', type: 'parent-child', from: 'other-parent-b', to: 'child-b-other' },
    ]

    const positions = treePositions(archive)
    const childIds = ['child-a', 'child-c']
    const childIndexes = childIds.map((id) =>
      [...positions.entries()].filter(([, point]) => point.y === positions.get(id)!.y)
        .sort(([, a], [, b]) => a.x - b.x)
        .findIndex(([personId]) => personId === id))

    expect(new Set(childIds.map((id) => positions.get(id)!.y)).size).toBe(1)
    expect(Math.max(...childIndexes) - Math.min(...childIndexes)).toBe(childIds.length - 1)
    expect(positions.get('parent')!.x).toBeGreaterThan(positions.get('co-parent-a')!.x)
    expect(positions.get('parent')!.x).toBeLessThan(positions.get('co-parent-b')!.x)
    expect(positions.get('child-c')!.x).toBeLessThan(positions.get('child-a')!.x)

    const routes = familyConnectorRoutes(archive, positions)
    const davideFamily = routes.find(({ parentIds }) =>
      parentIds.includes('parent') && parentIds.includes('co-parent-a'))!
    const giuseppeFamily = routes.find(({ parentIds }) =>
      parentIds.includes('parent') && parentIds.includes('co-parent-b'))!
    expect(davideFamily.parentBusY).not.toBe(giuseppeFamily.parentBusY)
    expect(davideFamily.parentBranchXs.parent).not.toBe(giuseppeFamily.parentBranchXs.parent)
    for (const route of [davideFamily, giuseppeFamily]) {
      const path = familyConnectorPath(route, positions)
      const branchXs = route.parentIds.map((id) => route.parentBranchXs[id] ?? positions.get(id)!.x)
      const left = Math.min(...branchXs)
      const right = Math.max(...branchXs)
      expect(path).toContain(`M ${left} ${route.parentBusY} L ${right} ${route.parentBusY}`)
    }
  })

  it('marks unavoidable family connector crossings with a bridge', () => {
    const archive = emptyArchive()
    archive.people = ['parent-a', 'parent-b', 'child-a', 'parent-c', 'parent-d', 'child-b']
      .map((id) => ({ id, firstName: id, lastName: 'Family' }))
    archive.relationships = [
      { id: 'a-to-child-a', type: 'parent-child', from: 'parent-a', to: 'child-a' },
      { id: 'b-to-child-a', type: 'parent-child', from: 'parent-b', to: 'child-a' },
      { id: 'c-to-child-b', type: 'parent-child', from: 'parent-c', to: 'child-b' },
      { id: 'd-to-child-b', type: 'parent-child', from: 'parent-d', to: 'child-b' },
    ]
    const positions = new Map([
      ['parent-a', { x: 0, y: 0 }],
      ['parent-b', { x: 200, y: 0 }],
      ['child-a', { x: 100, y: 380 }],
      ['parent-c', { x: 50, y: 190 }],
      ['parent-d', { x: 150, y: 190 }],
      ['child-b', { x: 300, y: 380 }],
    ])

    const routes = familyConnectorRoutes(archive, positions)
    expect(familyConnectorBridges(routes, positions)).toContainEqual({ key: '100:285', x: 100, y: 285 })
  })

  it('connects the parent trunk directly to the full child bus without doubling back', () => {
    const archive = emptyArchive()
    archive.people = ['parent-a', 'parent-b', 'child-left', 'child-right']
      .map((id) => ({ id, firstName: id, lastName: 'Family' }))
    archive.relationships = [
      { id: 'a-to-left', type: 'parent-child', from: 'parent-a', to: 'child-left' },
      { id: 'b-to-left', type: 'parent-child', from: 'parent-b', to: 'child-left' },
      { id: 'a-to-right', type: 'parent-child', from: 'parent-a', to: 'child-right' },
      { id: 'b-to-right', type: 'parent-child', from: 'parent-b', to: 'child-right' },
    ]
    const positions = new Map([
      ['parent-a', { x: 0, y: 0 }],
      ['parent-b', { x: 200, y: 0 }],
      ['child-left', { x: 50, y: 380 }],
      ['child-right', { x: 250, y: 380 }],
    ])

    const [route] = familyConnectorRoutes(archive, positions)
    const path = familyConnectorPath(route!, positions)

    expect(path).toContain('M 100 190 L 100 306')
    expect(path).toContain('M 50 306 L 100 306 M 100 306 L 250 306')
    expect(path).not.toContain('L 50 306 L 250 306')
  })

  it('uses a vertical branch from the parent bus for a single descendant', () => {
    const archive = emptyArchive()
    archive.people = [
      { id: 'parent-a', firstName: 'Ada', lastName: 'Family' },
      { id: 'parent-b', firstName: 'Bea', lastName: 'Family' },
      { id: 'child', firstName: 'Cora', lastName: 'Family' },
    ]
    archive.relationships = [
      { id: 'a-to-child', type: 'parent-child', from: 'parent-a', to: 'child' },
      { id: 'b-to-child', type: 'parent-child', from: 'parent-b', to: 'child' },
    ]
    const positions = new Map([
      ['parent-a', { x: 0, y: 0 }],
      ['parent-b', { x: 200, y: 0 }],
      ['child', { x: 140, y: 380 }],
    ])
    const [route] = familyConnectorRoutes(archive, positions)
    const path = familyConnectorPath(route!, positions)

    expect(path).toContain('M 140 190 L 140 326')
    expect(path).not.toContain('314')
  })

  it('extends the parent bus with one elbow when a single descendant is outside it', () => {
    const archive = emptyArchive()
    archive.people = ['parent', 'child'].map((id) => ({ id, firstName: id, lastName: 'Family' }))
    archive.relationships = [
      { id: 'parent-to-child', type: 'parent-child', from: 'parent', to: 'child' },
    ]
    const positions = new Map([
      ['parent', { x: 100, y: 0 }],
      ['child', { x: 240, y: 380 }],
    ])
    const [route] = familyConnectorRoutes(archive, positions)
    const path = familyConnectorPath(route!, positions)

    expect(path).toContain('M 100 190 L 240 190 L 240 326')
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

  it('lays out a large multigenerational tree without dropping nodes', () => {
    const people = Array.from({ length: 1000 }, (_, index) => ({
      id: `person-${index}`,
      firstName: `Person ${index}`,
      lastName: 'Family',
    }))
    const archive: FamilyArchive = {
      schemaVersion: 1,
      people,
      relationships: people.slice(1).map((person, index) => ({
        id: `relationship-${index}`,
        type: 'parent-child',
        from: people[index]!.id,
        to: person.id,
      })),
    }

    expect(treePositions(archive).size).toBe(people.length)
  })

})
