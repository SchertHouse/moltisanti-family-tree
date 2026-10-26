import { isUnionRelationship, unionDetails, type FamilyArchive } from './model'

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

export type KinshipSex = 'male' | 'female' | 'unspecified'
export type KinshipDirectRole =
  | 'parent'
  | 'grandparent'
  | 'greatGrandparent'
  | 'greatGreatGrandparent'
  | 'greatGreatGreatGrandparent'
  | 'ancestor'
  | 'child'
  | 'grandchild'
  | 'greatGrandchild'
  | 'greatGreatGrandchild'
  | 'greatGreatGreatGrandchild'
  | 'descendant'

export type KinshipRelationship =
  | { type: 'ancestor'; role: KinshipDirectRole; generations: number; civilDegree: number; sex: KinshipSex }
  | { type: 'sibling'; civilDegree: number; sex: KinshipSex }
  | { type: 'avuncular'; role: 'uncle' | 'niece'; generations: number; civilDegree: number; sex: KinshipSex }
  | { type: 'cousin'; degree: number; removed: number; civilDegree: number; sex: KinshipSex }
  | { type: 'union'; kind: 'marriage' | 'partnership'; status: 'current' | 'ended'; endReason?: string }

export function findKinshipRelationship(
  archive: FamilyArchive,
  fromId: string,
  toId: string,
): KinshipRelationship | null {
  if (fromId === toId) return null
  const selected = archive.people.find((person) => person.id === fromId)
  const compared = archive.people.find((person) => person.id === toId)
  if (!selected || !compared) return null
  const sex: KinshipSex = selected.sexAtBirth === 'M'
    ? 'male'
    : selected.sexAtBirth === 'F' ? 'female' : 'unspecified'
  const directUnions = archive.relationships.filter((relationship) => isUnionRelationship(relationship) &&
    ((relationship.from === fromId && relationship.to === toId) ||
      (relationship.from === toId && relationship.to === fromId)))
  const directUnion = directUnions.find((relationship) => unionDetails(relationship)?.status === 'current') ??
    directUnions.at(-1)
  const directUnionDetails = directUnion ? unionDetails(directUnion) : null

  const parentsByChild = new Map<string, string[]>()
  for (const relationship of archive.relationships) {
    if (relationship.type !== 'parent-child') continue
    parentsByChild.set(relationship.to, [
      ...(parentsByChild.get(relationship.to) ?? []),
      relationship.from,
    ])
  }

  const getAncestorDistances = (personId: string) => {
    const distances = new Map([[personId, 0]])
    const queue = [personId]
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index]!
      const distance = distances.get(current)!
      for (const parentId of parentsByChild.get(current) ?? []) {
        if (distances.has(parentId)) continue
        distances.set(parentId, distance + 1)
        queue.push(parentId)
      }
    }
    return distances
  }

  const fromAncestors = getAncestorDistances(fromId)
  const toAncestors = getAncestorDistances(toId)
  const commonAncestors = [...fromAncestors.keys()]
    .filter((ancestorId) => toAncestors.has(ancestorId))
    .map((ancestorId) => ({
      ancestorId,
      fromGenerations: fromAncestors.get(ancestorId)!,
      toGenerations: toAncestors.get(ancestorId)!,
    }))
    .sort((left, right) =>
      left.fromGenerations + left.toGenerations - right.fromGenerations - right.toGenerations ||
      Math.max(left.fromGenerations, left.toGenerations) - Math.max(right.fromGenerations, right.toGenerations) ||
      left.ancestorId.localeCompare(right.ancestorId))

  const closest = commonAncestors[0]
  if (!closest) return directUnionDetails ? { type: 'union', ...directUnionDetails } : null
  const civilDegree = closest.fromGenerations + closest.toGenerations
  if (closest.fromGenerations === 0 || closest.toGenerations === 0) {
    const selectedIsAncestor = closest.fromGenerations === 0
    const generations = Math.max(closest.fromGenerations, closest.toGenerations)
    const role = selectedIsAncestor
      ? (generations === 1 ? 'parent'
        : generations === 2 ? 'grandparent'
          : generations === 3 ? 'greatGrandparent'
            : generations === 4 ? 'greatGreatGrandparent'
              : generations === 5 ? 'greatGreatGreatGrandparent' : 'ancestor')
      : (generations === 1 ? 'child'
        : generations === 2 ? 'grandchild'
          : generations === 3 ? 'greatGrandchild'
            : generations === 4 ? 'greatGreatGrandchild'
              : generations === 5 ? 'greatGreatGreatGrandchild' : 'descendant')
    return {
      type: 'ancestor',
      role,
      generations,
      civilDegree,
      sex,
    }
  }
  if (closest.fromGenerations === 1 && closest.toGenerations === 1) return { type: 'sibling', civilDegree, sex }
  if (closest.fromGenerations === 1 || closest.toGenerations === 1) {
    const selectedIsUncle = closest.fromGenerations === 1
    return {
      type: 'avuncular',
      role: selectedIsUncle ? 'uncle' : 'niece',
      generations: Math.max(closest.fromGenerations, closest.toGenerations) - 1,
      civilDegree,
      sex,
    }
  }

  return {
    type: 'cousin',
    degree: Math.min(closest.fromGenerations, closest.toGenerations) - 1,
    removed: Math.abs(closest.fromGenerations - closest.toGenerations),
    civilDegree,
    sex,
  }
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
    } else if (isUnionRelationship(relationship)) {
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
