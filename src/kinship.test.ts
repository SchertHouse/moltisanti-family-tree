import { describe, expect, it } from 'vitest'
import { findKinshipPath, findKinshipRelationship } from './kinship'
import type { FamilyArchive } from './model'

const archive: FamilyArchive = {
  schemaVersion: 1,
  people: ['grandparent', 'parent', 'child', 'partner', 'unrelated']
    .map((id) => ({ id, firstName: id, lastName: 'Family' })),
  relationships: [
    { id: '1', type: 'parent-child', from: 'grandparent', to: 'parent' },
    { id: '2', type: 'parent-child', from: 'parent', to: 'child' },
    { id: '3', type: 'partner', from: 'child', to: 'partner' },
  ],
}

describe('kinship paths', () => {
  it('finds the shortest parent-child path and counts its degrees', () => {
    expect(findKinshipPath(archive, 'grandparent', 'child')).toEqual({
      steps: [
        { personId: 'parent', type: 'child' },
        { personId: 'child', type: 'child' },
      ],
      bloodSteps: 2,
      partnerSteps: 0,
    })
  })

  describe('kinship relationship labels', () => {
    const people = (ids: string[]) => ids.map((id) => ({ id, firstName: id, lastName: 'Family' }))
    const parentChild = (from: string, to: string, id: string) => ({ id, type: 'parent-child' as const, from, to })

    it('identifies first and second cousins through their closest common ancestor', () => {
      const firstCousins: FamilyArchive = {
        schemaVersion: 1,
        people: people(['grandparent', 'parent-a', 'parent-b', 'cousin-a', 'cousin-b']),
        relationships: [
          parentChild('grandparent', 'parent-a', '1'),
          parentChild('grandparent', 'parent-b', '2'),
          parentChild('parent-a', 'cousin-a', '3'),
          parentChild('parent-b', 'cousin-b', '4'),
        ],
      }
      expect(findKinshipRelationship(firstCousins, 'cousin-a', 'cousin-b')).toEqual({
        type: 'cousin',
        degree: 1,
        removed: 0,
        civilDegree: 4,
        sex: 'unspecified',
      })

      const secondCousins: FamilyArchive = {
        schemaVersion: 1,
        people: people(['ancestor', 'grandparent-a', 'grandparent-b', 'parent-a', 'parent-b', 'cousin-a', 'cousin-b']),
        relationships: [
          parentChild('ancestor', 'grandparent-a', '1'),
          parentChild('ancestor', 'grandparent-b', '2'),
          parentChild('grandparent-a', 'parent-a', '3'),
          parentChild('grandparent-b', 'parent-b', '4'),
          parentChild('parent-a', 'cousin-a', '5'),
          parentChild('parent-b', 'cousin-b', '6'),
        ],
      }
      expect(findKinshipRelationship(secondCousins, 'cousin-a', 'cousin-b')).toEqual({
        type: 'cousin',
        degree: 2,
        removed: 0,
        civilDegree: 6,
        sex: 'unspecified',
      })

      const thirdCousins: FamilyArchive = {
        schemaVersion: 1,
        people: people(['common-ancestor', 'ancestor-a', 'ancestor-b', 'grandparent-a', 'grandparent-b', 'parent-a', 'parent-b', 'cousin-a', 'cousin-b']),
        relationships: [
          parentChild('common-ancestor', 'ancestor-a', '1'),
          parentChild('common-ancestor', 'ancestor-b', '2'),
          parentChild('ancestor-a', 'grandparent-a', '3'),
          parentChild('ancestor-b', 'grandparent-b', '4'),
          parentChild('grandparent-a', 'parent-a', '9'),
          parentChild('grandparent-b', 'parent-b', '6'),
          parentChild('parent-a', 'cousin-a', '7'),
          parentChild('parent-b', 'cousin-b', '8'),
        ],
      }
      expect(findKinshipRelationship(thirdCousins, 'cousin-a', 'cousin-b')).toEqual({
        type: 'cousin',
        degree: 3,
        removed: 0,
        civilDegree: 8,
        sex: 'unspecified',
      })
    })

    it('supports fourth and subsequent cousin degrees', () => {
      const createCousins = (degree: number): FamilyArchive => {
        const peopleIds = ['common-ancestor']
        const relationships: FamilyArchive['relationships'] = []
        for (const branch of ['a', 'b']) {
          let parentId = 'common-ancestor'
          for (let generation = 1; generation <= degree + 1; generation += 1) {
            const childId = generation === degree + 1 ? `cousin-${branch}` : `${branch}-${generation}`
            peopleIds.push(childId)
            relationships.push(parentChild(parentId, childId, `${branch}-${generation}`))
            parentId = childId
          }
        }
        return { schemaVersion: 1, people: people(peopleIds), relationships }
      }

      expect(findKinshipRelationship(createCousins(4), 'cousin-a', 'cousin-b')).toMatchObject({
        type: 'cousin',
        degree: 4,
        civilDegree: 10,
      })
      expect(findKinshipRelationship(createCousins(5), 'cousin-a', 'cousin-b')).toMatchObject({
        type: 'cousin',
        degree: 5,
        civilDegree: 12,
      })
    })

    it('reports generation differences and distinguishes siblings and direct ancestry', () => {
      const family: FamilyArchive = {
        schemaVersion: 1,
        people: people(['ancestor', 'parent', 'child', 'sibling', 'grandchild', 'cousin', 'cousin-child']),
        relationships: [
          parentChild('ancestor', 'parent', '1'),
          parentChild('ancestor', 'sibling', '2'),
          parentChild('parent', 'child', '3'),
          parentChild('child', 'grandchild', '4'),
          parentChild('sibling', 'cousin', '5'),
          parentChild('cousin', 'cousin-child', '6'),
        ],
      }
      expect(findKinshipRelationship(family, 'child', 'grandchild')).toEqual({
        type: 'ancestor',
        role: 'parent',
        generations: 1,
        civilDegree: 1,
        sex: 'unspecified',
      })
      expect(findKinshipRelationship(family, 'ancestor', 'grandchild')).toEqual({
        type: 'ancestor',
        role: 'greatGrandparent',
        generations: 3,
        civilDegree: 3,
        sex: 'unspecified',
      })
      expect(findKinshipRelationship(family, 'parent', 'grandchild')).toEqual({
        type: 'ancestor',
        role: 'grandparent',
        generations: 2,
        civilDegree: 2,
        sex: 'unspecified',
      })
      expect(findKinshipRelationship(family, 'parent', 'sibling')).toEqual({
        type: 'sibling',
        civilDegree: 2,
        sex: 'unspecified',
      })
      expect(findKinshipRelationship(family, 'parent', 'cousin')).toEqual({
        type: 'avuncular',
        role: 'uncle',
        generations: 1,
        civilDegree: 3,
        sex: 'unspecified',
      })
      expect(findKinshipRelationship(family, 'parent', 'cousin-child')).toEqual({
        type: 'avuncular',
        role: 'uncle',
        generations: 2,
        civilDegree: 4,
        sex: 'unspecified',
      })
      expect(findKinshipRelationship(family, 'grandchild', 'cousin')).toEqual({
        type: 'cousin',
        degree: 1,
        removed: 1,
        civilDegree: 5,
        sex: 'unspecified',
      })
      expect(findKinshipRelationship(family, 'cousin', 'parent')).toEqual({
        type: 'avuncular',
        role: 'niece',
        generations: 1,
        civilDegree: 3,
        sex: 'unspecified',
      })
    })

    it('reports legacy partners as current partnerships without assigning a consanguinity degree', () => {
      const family: FamilyArchive = {
        schemaVersion: 1,
        people: people(['person-a', 'person-b']),
        relationships: [{ id: '1', type: 'partner', from: 'person-a', to: 'person-b' }],
      }
      expect(findKinshipRelationship(family, 'person-a', 'person-b')).toEqual({
        type: 'union',
        kind: 'partnership',
        status: 'current',
      })
    })

    it('reports a concluded marriage without assigning a consanguinity degree', () => {
      const family: FamilyArchive = {
        schemaVersion: 1,
        people: people(['person-a', 'person-b']),
        relationships: [{
          id: '1',
          type: 'union',
          from: 'person-a',
          to: 'person-b',
          unionKind: 'marriage',
          unionStatus: 'ended',
          unionEndReason: 'divorce',
        }],
      }

      expect(findKinshipRelationship(family, 'person-a', 'person-b')).toEqual({
        type: 'union',
        kind: 'marriage',
        status: 'ended',
        endReason: 'divorce',
      })
      expect(findKinshipPath(family, 'person-a', 'person-b')).toEqual({
        steps: [{ personId: 'person-b', type: 'partner' }],
        bloodSteps: 0,
        partnerSteps: 1,
      })
    })

    it('prefers a current union when a former union is also recorded for the pair', () => {
      const family: FamilyArchive = {
        schemaVersion: 1,
        people: people(['person-a', 'person-b']),
        relationships: [
          {
            id: 'former-marriage',
            type: 'union',
            from: 'person-a',
            to: 'person-b',
            unionKind: 'marriage',
            unionStatus: 'ended',
            unionEndReason: 'divorce',
          },
          {
            id: 'current-partnership',
            type: 'union',
            from: 'person-a',
            to: 'person-b',
            unionKind: 'partnership',
            unionStatus: 'current',
          },
        ],
      }

      expect(findKinshipRelationship(family, 'person-a', 'person-b')).toEqual({
        type: 'union',
        kind: 'partnership',
        status: 'current',
      })
    })

    it('identifies parent-in-law and child-in-law relationships through a recorded union', () => {
      const family: FamilyArchive = {
        schemaVersion: 1,
        people: [
          { id: 'parent', firstName: 'Parent', lastName: 'Family', sexAtBirth: 'M' },
          { id: 'child', firstName: 'Child', lastName: 'Family' },
          { id: 'spouse', firstName: 'Spouse', lastName: 'Family', sexAtBirth: 'F' },
        ],
        relationships: [
          parentChild('parent', 'child', 'parent-child'),
          {
            id: 'union',
            type: 'union',
            from: 'child',
            to: 'spouse',
            unionKind: 'partnership',
            unionStatus: 'current',
          },
        ],
      }

      expect(findKinshipRelationship(family, 'parent', 'spouse')).toEqual({
        type: 'affinity',
        relationship: {
          type: 'ancestor',
          role: 'parent',
          generations: 1,
          civilDegree: 1,
          sex: 'male',
        },
        kind: 'partnership',
        status: 'current',
        partner: 'compared',
      })
      expect(findKinshipRelationship(family, 'spouse', 'parent')).toEqual({
        type: 'affinity',
        relationship: {
          type: 'ancestor',
          role: 'child',
          generations: 1,
          civilDegree: 1,
          sex: 'female',
        },
        kind: 'partnership',
        status: 'current',
        partner: 'selected',
      })
    })

    it('retains ended union status when calculating affinity', () => {
      const family: FamilyArchive = {
        schemaVersion: 1,
        people: people(['parent', 'child', 'spouse']),
        relationships: [
          parentChild('parent', 'child', 'parent-child'),
          {
            id: 'union',
            type: 'union',
            from: 'child',
            to: 'spouse',
            unionKind: 'marriage',
            unionStatus: 'ended',
          },
        ],
      }

      expect(findKinshipRelationship(family, 'parent', 'spouse')).toMatchObject({
        type: 'affinity',
        kind: 'marriage',
        status: 'ended',
        partner: 'compared',
      })
    })

    it('describes connected paths with multiple unions when no single affinity term applies', () => {
      const family: FamilyArchive = {
        schemaVersion: 1,
        people: people(['a', 'b', 'c', 'd', 'e']),
        relationships: [
          parentChild('a', 'b', '1'),
          { id: '2', type: 'union', from: 'b', to: 'c', unionKind: 'marriage', unionStatus: 'current' },
          parentChild('c', 'd', '3'),
          { id: '4', type: 'partner', from: 'd', to: 'e' },
        ],
      }

      expect(findKinshipRelationship(family, 'a', 'e')).toEqual({
        type: 'indirect',
        bloodSteps: 2,
        partnerSteps: 2,
      })
    })

    it('uses recorded sex to distinguish gendered direct-line and collateral terms', () => {
      const family: FamilyArchive = {
        schemaVersion: 1,
        people: [
          { id: 'grandmother', firstName: 'Grandmother', lastName: 'Family', sexAtBirth: 'F' },
          { id: 'mother', firstName: 'Mother', lastName: 'Family', sexAtBirth: 'F' },
          { id: 'daughter', firstName: 'Daughter', lastName: 'Family', sexAtBirth: 'F' },
          { id: 'aunt', firstName: 'Aunt', lastName: 'Family', sexAtBirth: 'F' },
          { id: 'nephew', firstName: 'Nephew', lastName: 'Family', sexAtBirth: 'M' },
        ],
        relationships: [
          parentChild('grandmother', 'mother', '1'),
          parentChild('grandmother', 'aunt', '2'),
          parentChild('mother', 'daughter', '3'),
          parentChild('aunt', 'nephew', '4'),
        ],
      }
      expect(findKinshipRelationship(family, 'mother', 'daughter')).toMatchObject({
        type: 'ancestor',
        role: 'parent',
        sex: 'female',
        civilDegree: 1,
      })
      expect(findKinshipRelationship(family, 'daughter', 'aunt')).toMatchObject({
        type: 'avuncular',
        role: 'niece',
        sex: 'female',
        civilDegree: 3,
      })
    })
  })

  it('counts partner links separately from blood relationship steps', () => {
    expect(findKinshipPath(archive, 'parent', 'partner')).toMatchObject({
      bloodSteps: 1,
      partnerSteps: 1,
      steps: [
        { personId: 'child', type: 'child' },
        { personId: 'partner', type: 'partner' },
      ],
    })
  })

  it('returns no path for people without a recorded connection', () => {
    expect(findKinshipPath(archive, 'grandparent', 'unrelated')).toBeNull()
  })

  it('returns an empty path for the same person', () => {
    expect(findKinshipPath(archive, 'child', 'child')).toEqual({
      steps: [],
      bloodSteps: 0,
      partnerSteps: 0,
    })
  })
})
