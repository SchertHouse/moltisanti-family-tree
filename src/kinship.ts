import type { FamilyArchive } from './model'

export type KinshipStepType = 'parent' | 'child' | 'partner'

export interface KinshipStep {
  personId: string
  type: KinshipStepType
}

export interface KinshipPath {
  steps: KinshipStep[]
  bloodSteps: number
  partnerSteps: number
}

export function findKinshipPath(
  archive: FamilyArchive,
  fromId: string,
  toId: string,
): KinshipPath | null {
  if (fromId === toId) return { steps: [], bloodSteps: 0, partnerSteps: 0 }
  if (!archive.people.some((person) => person.id === fromId) ||
    !archive.people.some((person) => person.id === toId)) return null

  const adjacency = new Map<string, Array<{ personId: string; type: KinshipStepType }>>()
  const connect = (from: string, to: string, type: KinshipStepType) => {
    adjacency.set(from, [...(adjacency.get(from) ?? []), { personId: to, type }])
  }
  for (const relationship of archive.relationships) {
    if (relationship.type === 'parent-child') {
      connect(relationship.from, relationship.to, 'child')
      connect(relationship.to, relationship.from, 'parent')
    } else {
      connect(relationship.from, relationship.to, 'partner')
      connect(relationship.to, relationship.from, 'partner')
    }
  }

  const queue = [fromId]
  const previous = new Map<string, { personId: string; type: KinshipStepType }>()
  const visited = new Set(queue)
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const edge of adjacency.get(current) ?? []) {
      if (visited.has(edge.personId)) continue
      visited.add(edge.personId)
      previous.set(edge.personId, { personId: current, type: edge.type })
      if (edge.personId === toId) {
        const steps: KinshipStep[] = []
        let personId = toId
        while (personId !== fromId) {
          const link = previous.get(personId)
          if (!link) return null
          steps.push({ personId, type: link.type })
          personId = link.personId
        }
        steps.reverse()
        return {
          steps,
          bloodSteps: steps.filter((step) => step.type !== 'partner').length,
          partnerSteps: steps.filter((step) => step.type === 'partner').length,
        }
      }
      queue.push(edge.personId)
    }
  }
  return null
}
