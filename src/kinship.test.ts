import { describe, expect, it } from 'vitest'
import { findKinshipPath } from './kinship'
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
