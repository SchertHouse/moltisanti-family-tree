export type RelationshipType = 'parent-child' | 'partner' | 'union'
export type UnionKind = 'marriage' | 'partnership'
export type UnionStatus = 'current' | 'ended'
export type UnionEndReason = 'divorce' | 'annulment' | 'separation' | 'death' | 'other'
export type SexAtBirth = 'M' | 'F' | 'X' | 'U'

export function isSexAtBirth(value: unknown): value is SexAtBirth {
  return value === 'M' || value === 'F' || value === 'X' || value === 'U'
}

export interface Person {
  id: string
  firstName: string
  lastName: string
  alternateName?: string
  sexAtBirth?: SexAtBirth
  birthDate?: string
  deathDate?: string
  birthPlace?: string
  profession?: string
  residence?: string
  nationality?: string
  biography?: string
  email?: string
  whatsapp?: string
  photo?: string
  gallery?: string[]
  notes?: string
  sources?: string
}

export function uniquePeople(people: Person[]): Person[] {
  return [...new Map(people.map((person) => [person.id, person])).values()]
}

export interface Relationship {
  id: string
  type: RelationshipType
  from: string
  to: string
  unionKind?: UnionKind
  unionStatus?: UnionStatus
  unionEndReason?: UnionEndReason
}

export function isUnionRelationship(relationship: Relationship): boolean {
  return relationship.type === 'partner' || relationship.type === 'union'
}

export function unionDetails(relationship: Relationship): {
  kind: UnionKind
  status: UnionStatus
  endReason?: UnionEndReason
} | null {
  if (!isUnionRelationship(relationship)) return null
  return {
    kind: relationship.type === 'partner' ? 'partnership' : relationship.unionKind!,
    status: relationship.type === 'partner' ? 'current' : relationship.unionStatus!,
    ...(relationship.type === 'union' && relationship.unionEndReason
      ? { endReason: relationship.unionEndReason }
      : {}),
  }
}

export interface FamilyArchive {
  schemaVersion: 1
  people: Person[]
  relationships: Relationship[]
}

export const emptyArchive = (): FamilyArchive => ({
  schemaVersion: 1,
  people: [],
  relationships: [],
})

export function validateArchive(value: unknown): asserts value is FamilyArchive {
  if (!value || typeof value !== 'object') throw new Error('Archivio non valido.')
  const archive = value as Partial<FamilyArchive>
  if (archive.schemaVersion !== 1 || !Array.isArray(archive.people) || !Array.isArray(archive.relationships)) {
    throw new Error('Versione o struttura dell’archivio non supportata.')
  }
  const ids = new Set<string>()
  for (const person of archive.people) {
    if (!person || typeof person !== 'object' || typeof person.id !== 'string' || !person.id.trim() || ids.has(person.id)) {
      throw new Error('ID persona mancante o duplicato.')
    }
    if (typeof person.firstName !== 'string' || !person.firstName.trim() ||
      typeof person.lastName !== 'string' || !person.lastName.trim()) {
      throw new Error('Nome o cognome non valido.')
    }
    for (const field of ['alternateName', 'profession', 'residence', 'nationality'] as const) {
      if (person[field] !== undefined && typeof person[field] !== 'string') {
        throw new Error(`Il campo ${field} non è valido.`)
      }
    }
    if (person.sexAtBirth !== undefined && !isSexAtBirth(person.sexAtBirth)) {
      throw new Error('Il sesso alla nascita non è valido.')
    }
    for (const date of [person.birthDate, person.deathDate]) {
      if (date) {
        const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(date)
        const year = Number(match?.[1])
        const month = match?.[2] ? Number(match[2]) : 1
        const day = match?.[3] ? Number(match[3]) : 1
        const actual = new Date(Date.UTC(year, month - 1, day))
        if (!match || actual.getUTCFullYear() !== year || actual.getUTCMonth() !== month - 1 || actual.getUTCDate() !== day) {
          throw new Error('Data non valida: usare il formato ISO (YYYY, YYYY-MM o YYYY-MM-DD).')
        }
      }
    }
    if (person.birthDate && person.deathDate && person.birthDate > person.deathDate) {
      throw new Error('La data di nascita non può essere successiva alla data di morte.')
    }
    if (person.gallery !== undefined && !Array.isArray(person.gallery)) {
      throw new Error('La galleria fotografica non è valida.')
    }
    for (const image of [person.photo, ...(person.gallery ?? [])]) {
      if (image && !/^data:image\/(?:png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/]+={0,2}$/.test(image) &&
        !/^moltisanti-image:v1:[A-Za-z0-9+/]+={0,2}$/.test(image)) {
        throw new Error('Le fotografie devono essere immagini raster codificate nell’archivio.')
      }
    }
    ids.add(person.id)
  }
  const relationshipIds = new Set<string>()
  for (const relationship of archive.relationships) {
    if (!relationship || typeof relationship !== 'object' || typeof relationship.id !== 'string' || !relationship.id || relationshipIds.has(relationship.id)) {
      throw new Error('ID relazione mancante o duplicato.')
    }
    if (!['parent-child', 'partner', 'union'].includes(relationship.type) || !ids.has(relationship.from) || !ids.has(relationship.to)) {
      throw new Error('La relazione contiene persone inesistenti o un tipo non valido.')
    }
    if (relationship.from === relationship.to) throw new Error('Una persona non può essere collegata a sé stessa.')
    if (relationship.type === 'union') {
      if (!['marriage', 'partnership'].includes(relationship.unionKind ?? '') ||
        !['current', 'ended'].includes(relationship.unionStatus ?? '') ||
        (relationship.unionEndReason !== undefined &&
          !['divorce', 'annulment', 'separation', 'death', 'other'].includes(relationship.unionEndReason))) {
        throw new Error('I dettagli dell’unione non sono validi.')
      }
      if (relationship.unionStatus === 'current' && relationship.unionEndReason !== undefined) {
        throw new Error('Un’unione attuale non può avere un motivo di conclusione.')
      }
    } else if (relationship.unionKind !== undefined || relationship.unionStatus !== undefined ||
      relationship.unionEndReason !== undefined) {
      throw new Error('I dettagli dell’unione sono consentiti solo per una relazione di unione.')
    }
    relationshipIds.add(relationship.id)
  }
  const parents = new Map<string, string[]>()
  for (const relation of archive.relationships) {
    if (relation.type === 'parent-child') parents.set(relation.from, [...(parents.get(relation.from) ?? []), relation.to])
  }
  const visited = new Set<string>()
  const active = new Set<string>()
  const hasCycle = (id: string): boolean => {
    if (active.has(id)) return true
    if (visited.has(id)) return false
    active.add(id)
    for (const child of parents.get(id) ?? []) if (hasCycle(child)) return true
    active.delete(id)
    visited.add(id)
    return false
  }
  for (const id of ids) if (hasCycle(id)) throw new Error('Le relazioni genitoriali contengono un ciclo.')
}

export function relationTo(
  archive: FamilyArchive,
  personId: string,
  type: RelationshipType,
  otherId: string,
  union?: { kind: UnionKind; status: UnionStatus; endReason?: UnionEndReason },
): FamilyArchive {
  const isUnionRequest = type === 'union' || type === 'partner'
  const samePair = (relationship: Relationship) => isUnionRequest
    ? isUnionRelationship(relationship) &&
      ((relationship.from === personId && relationship.to === otherId) ||
        (relationship.from === otherId && relationship.to === personId))
    : relationship.type === type && relationship.from === personId && relationship.to === otherId
  const exists = archive.relationships.some((relationship) => {
    if (!samePair(relationship)) return false
    if (!isUnionRequest) return true
    const details = unionDetails(relationship)
    if (!details) return false
    const requestedKind = type === 'partner' ? 'partnership' : union?.kind
    const requestedStatus = type === 'partner' ? 'current' : union?.status
    return details.kind === requestedKind && details.status === requestedStatus &&
      (details.status === 'ended' ? details.endReason === union?.endReason : true)
  })
  if (exists) throw new Error('Questa relazione è già presente.')
  if (type === 'union' && !union) throw new Error('Specificare tipo e stato dell’unione.')
  const relationship: Relationship = {
    id: crypto.randomUUID(),
    type,
    from: personId,
    to: otherId,
    ...(type === 'union' && union ? {
      unionKind: union.kind,
      unionStatus: union.status,
      ...(union.endReason ? { unionEndReason: union.endReason } : {}),
    } : {}),
  }
  const next = {
    ...archive,
    relationships: [...archive.relationships, relationship],
  }
  validateArchive(next)
  return next
}

export function generationMap(archive: FamilyArchive): Map<string, number> {
  const groups = partnerGroups(archive)
  const edges = archive.relationships.filter((relationship) => relationship.type === 'parent-child')
  const roots = [...new Set(archive.people.map((person) => groups.find(person.id)))].sort()
  const children = new Map(roots.map((root) => [root, new Set<string>()]))
  const indegree = new Map(roots.map((root) => [root, 0]))

  for (const edge of edges) {
    const parent = groups.find(edge.from)
    const child = groups.find(edge.to)
    if (parent === child) continue
    const descendants = children.get(parent)!
    if (descendants.has(child)) continue
    descendants.add(child)
    indegree.set(child, indegree.get(child)! + 1)
  }

  const ready = roots.filter((root) => indegree.get(root) === 0)
  const levels = new Map(roots.map((root) => [root, 0]))
  for (let index = 0; index < ready.length; index += 1) {
    const parent = ready[index]!
    for (const child of children.get(parent)!) {
      levels.set(child, Math.max(levels.get(child) ?? 0, (levels.get(parent) ?? 0) + 1))
      indegree.set(child, indegree.get(child)! - 1)
      if (indegree.get(child) === 0) ready.push(child)
    }
  }

  return new Map(archive.people.map((person) => [person.id, levels.get(groups.find(person.id)) ?? 0]))
}

export function birthdayInfo(date: string | undefined, today = new Date()): { date: Date; days: number } | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const [, monthValue, dayValue] = date.split('-').map(Number)
  const month = monthValue! - 1
  const day = dayValue!
  const leap = (year: number) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let year = today.getFullYear()
  let next = new Date(year, month, day)
  if (month === 1 && day === 29) {
    while (!leap(year) || next < start) {
      year += 1
      while (!leap(year)) year += 1
      next = new Date(year, month, day)
    }
  } else if (next < start) next = new Date(year + 1, month, day)
  return { date: next, days: Math.round((next.getTime() - start.getTime()) / 86_400_000) }
}

export function treePositions(archive: FamilyArchive): Map<string, { x: number; y: number }> {
  const generations = generationMap(archive)
  const partnerMap = partnerGroups(archive)
  const familyGroups = new Map<string, Person[]>()
  for (const person of archive.people) {
    const groupId = partnerMap.find(person.id)
    familyGroups.set(groupId, [...(familyGroups.get(groupId) ?? []), person])
  }

  const groups = [...familyGroups].map(([id, people]) => ({
    id,
    people: people.sort((a, b) =>
      a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName) || a.id.localeCompare(b.id)),
    level: generations.get(people[0]!.id) ?? 0,
  }))
  const layoutGroupById = new Map(groups.map((group) => [group.id, group]))
  const groupByPerson = new Map(groups.flatMap((group) => group.people.map((person) => [person.id, group.id] as const)))
  const parents = new Map(groups.map((group) => [group.id, new Set<string>()]))
  const children = new Map(groups.map((group) => [group.id, new Set<string>()]))
  const parentAnchors = new Map(groups.map((group) => [group.id, [] as LayoutAnchor[]]))
  const childAnchors = new Map(groups.map((group) => [group.id, [] as LayoutAnchor[]]))
  for (const relationship of archive.relationships) {
    if (relationship.type !== 'parent-child') continue
    const parent = groupByPerson.get(relationship.from)!
    const child = groupByPerson.get(relationship.to)!
    if (parent === child) continue
    parents.get(child)!.add(parent)
    children.get(parent)!.add(child)
    const parentGroup = layoutGroupById.get(parent)!
    const childGroup = layoutGroupById.get(child)!
    const parentOffset = personOffset(parentGroup, relationship.from)
    const childOffset = personOffset(childGroup, relationship.to)
    parentAnchors.get(child)!.push({ neighborId: parent, ownOffset: childOffset, neighborOffset: parentOffset })
    childAnchors.get(parent)!.push({ neighborId: child, ownOffset: parentOffset, neighborOffset: childOffset })
  }

  const parentsByPerson = new Map<string, Set<string>>()
  for (const relationship of archive.relationships) {
    if (relationship.type !== 'parent-child') continue
    const personParents = parentsByPerson.get(relationship.to) ?? new Set<string>()
    personParents.add(relationship.from)
    parentsByPerson.set(relationship.to, personParents)
  }
  const siblingFamilies = new Map<string, Set<string>>()
  for (const [personId, parentIds] of parentsByPerson) {
    const familyKey = JSON.stringify([...parentIds].sort())
    const familyGroups = siblingFamilies.get(familyKey) ?? new Set<string>()
    familyGroups.add(groupByPerson.get(personId)!)
    siblingFamilies.set(familyKey, familyGroups)
  }

  const maxLevel = Math.max(0, ...groups.map((group) => group.level))
  const layers = Array.from({ length: maxLevel + 1 }, (_, level) =>
    groups.filter((group) => group.level === level).sort((a, b) => a.id.localeCompare(b.id)))
  for (let pass = 0; pass < 12; pass += 1) {
    const previousOrder = layers.map((layer) => layer.map((group) => group.id).join('\u0000'))
    for (let level = 1; level <= maxLevel; level += 1) {
      reorderLayer(layers[level]!, layers[level - 1]!, parents, siblingFamilies)
    }
    for (let level = maxLevel - 1; level >= 0; level -= 1) {
      reorderLayer(layers[level]!, layers[level + 1]!, children, siblingFamilies)
    }
    if (layers.every((layer, index) =>
      layer.map((group) => group.id).join('\u0000') === previousOrder[index])) break
  }

  const groupCenters = new Map<string, number>()
  for (const layer of layers) {
    const width = layer.reduce((total, group) => total + groupWidth(group.people.length), 0) +
      Math.max(0, layer.length - 1) * 80
    let left = 500 - width / 2
    for (const group of layer) {
      const width = groupWidth(group.people.length)
      groupCenters.set(group.id, left + width / 2)
      left += width + 80
    }
  }
  for (let pass = 0; pass < 100; pass += 1) {
    const previousCenters = new Map(groupCenters)
    for (let level = 1; level <= maxLevel; level += 1) {
      positionLayer(layers[level]!, parentAnchors, groupCenters)
    }
    for (let level = maxLevel - 1; level >= 0; level -= 1) {
      positionLayer(layers[level]!, childAnchors, groupCenters)
    }
    const maximumMovement = groups.reduce((movement, group) =>
      Math.max(movement, Math.abs(groupCenters.get(group.id)! - previousCenters.get(group.id)!)), 0)
    if (maximumMovement < 0.01) break
  }

  const minimumX = Math.min(...groups.map((group) =>
    groupCenters.get(group.id)! - groupWidth(group.people.length) / 2))
  const maximumX = Math.max(...groups.map((group) =>
    groupCenters.get(group.id)! + groupWidth(group.people.length) / 2))
  const translateX = 500 - (minimumX + maximumX) / 2
  const positions = new Map<string, { x: number; y: number }>()
  for (const [level, layer] of layers.entries()) {
    for (const group of layer) {
      const left = groupCenters.get(group.id)! - groupWidth(group.people.length) / 2
      group.people.forEach((person, index) => {
        positions.set(person.id, { x: left + 80 + index * 190 + translateX, y: 100 + level * 190 })
      })
    }
  }
  return positions
}

interface PartnerGroups {
  find: (personId: string) => string
}

interface LayoutGroup {
  id: string
  people: Person[]
  level: number
}

function partnerGroups(archive: FamilyArchive): PartnerGroups {
  const parent = new Map(archive.people.map((person) => [person.id, person.id]))
  const find = (personId: string): string => {
    const root = parent.get(personId)!
    if (root !== personId) parent.set(personId, find(root))
    return parent.get(personId)!
  }
  const parentChild = archive.relationships.filter((relationship) => relationship.type === 'parent-child')
  const partners = archive.relationships.filter((relationship) => {
    if (!isUnionRelationship(relationship)) return false
    return unionDetails(relationship)?.status === 'current'
  })
    .sort((a, b) => {
      const aKey = [a.from, a.to].sort().join('\u0000')
      const bKey = [b.from, b.to].sort().join('\u0000')
      return aKey.localeCompare(bKey)
    })

  for (const relationship of partners) {
    const first = find(relationship.from)
    const second = find(relationship.to)
    if (first === second) continue

    const candidateRoot = (personId: string) => {
      const root = find(personId)
      return root === first || root === second ? first : root
    }
    const roots = [...new Set(archive.people.map((person) => candidateRoot(person.id)))]
    const children = new Map(roots.map((root) => [root, new Set<string>()]))
    const indegree = new Map(roots.map((root) => [root, 0]))
    let compatible = true
    for (const edge of parentChild) {
      const parentRoot = candidateRoot(edge.from)
      const childRoot = candidateRoot(edge.to)
      if (parentRoot === childRoot) {
        compatible = false
        break
      }
      const descendants = children.get(parentRoot)!
      if (!descendants.has(childRoot)) {
        descendants.add(childRoot)
        indegree.set(childRoot, indegree.get(childRoot)! + 1)
      }
    }
    if (!compatible) continue

    const ready = roots.filter((root) => indegree.get(root) === 0)
    let visited = 0
    for (let index = 0; index < ready.length; index += 1) {
      const root = ready[index]!
      visited += 1
      for (const child of children.get(root)!) {
        indegree.set(child, indegree.get(child)! - 1)
        if (indegree.get(child) === 0) ready.push(child)
      }
    }
    if (visited === roots.length) parent.set(second, first)
  }
  return { find }
}

function groupWidth(peopleCount: number): number {
  return 160 + Math.max(0, peopleCount - 1) * 190
}

interface LayoutAnchor {
  neighborId: string
  ownOffset: number
  neighborOffset: number
}

function personOffset(group: LayoutGroup, personId: string): number {
  const index = group.people.findIndex((person) => person.id === personId)
  return (index - (group.people.length - 1) / 2) * 190
}

function positionLayer(
  layer: LayoutGroup[],
  anchors: Map<string, LayoutAnchor[]>,
  centers: Map<string, number>,
): void {
  const offsets = [0]
  for (let index = 1; index < layer.length; index += 1) {
    offsets.push(offsets[index - 1]! +
      groupWidth(layer[index - 1]!.people.length) / 2 +
      groupWidth(layer[index]!.people.length) / 2 + 80)
  }
  const targets = layer.map((group) => {
    const neighborCenters = (anchors.get(group.id) ?? [])
      .map((anchor) => {
        const neighborCenter = centers.get(anchor.neighborId)
        return neighborCenter === undefined
          ? undefined
          : neighborCenter + anchor.neighborOffset - anchor.ownOffset
      })
      .filter((center): center is number => center !== undefined)
    return neighborCenters.length
      ? neighborCenters.reduce((total, center) => total + center, 0) / neighborCenters.length
      : centers.get(group.id)!
  })
  const blocks: { start: number; end: number; total: number; count: number }[] = []
  for (let index = 0; index < targets.length; index += 1) {
    const adjusted = targets[index]! - offsets[index]!
    blocks.push({ start: index, end: index, total: adjusted, count: 1 })
    while (blocks.length > 1) {
      const current = blocks[blocks.length - 1]!
      const previous = blocks[blocks.length - 2]!
      if (previous.total / previous.count <= current.total / current.count) break
      blocks.splice(-2, 2, {
        start: previous.start,
        end: current.end,
        total: previous.total + current.total,
        count: previous.count + current.count,
      })
    }
  }
  for (const block of blocks) {
    const adjustedCenter = block.total / block.count
    for (let index = block.start; index <= block.end; index += 1) {
      centers.set(layer[index]!.id, adjustedCenter + offsets[index]!)
    }
  }
}

function reorderLayer(
  layer: LayoutGroup[],
  neighbors: LayoutGroup[],
  links: Map<string, Set<string>>,
  siblingFamilies: Map<string, Set<string>>,
): void {
  const neighborCenter = new Map<string, number>()
  let neighborLeft = 0
  for (const group of neighbors) {
    neighborCenter.set(group.id, neighborLeft + groupWidth(group.people.length) / 2)
    neighborLeft += groupWidth(group.people.length) + 80
  }
  const originalOrder = new Map(layer.map((group, index) => [group.id, index]))
  const blocksByRoot = linkedLayerBlocks(layer, links, siblingFamilies)
  const barycenter = (groupId: string): number | null => {
    const indexes = [...(links.get(groupId) ?? [])]
      .map((neighborId) => neighborCenter.get(neighborId))
      .filter((center): center is number => center !== undefined)
    return indexes.length ? indexes.reduce((total, center) => total + center, 0) / indexes.length : null
  }
  const blocks = blocksByRoot.map((family) => {
    const familyGroupsInOrder = family.sort((a, b) =>
      (originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0))
    const centers = familyGroupsInOrder.map((group) => barycenter(group.id))
      .filter((value): value is number => value !== null)
    return {
      groups: familyGroupsInOrder,
      center: centers.length ? centers.reduce((total, value) => total + value, 0) / centers.length : null,
      originalIndex: Math.min(...familyGroupsInOrder.map((group) => originalOrder.get(group.id) ?? 0)),
    }
  })
  blocks.sort((a, b) => {
    const aCenter = a.center
    const bCenter = b.center
    if (aCenter === null && bCenter !== null) return a.originalIndex - b.originalIndex
    if (aCenter !== null && bCenter === null) return a.originalIndex - b.originalIndex
    return (aCenter ?? 0) - (bCenter ?? 0) || a.originalIndex - b.originalIndex
  })
  layer.splice(0, layer.length, ...blocks.flatMap((block) => block.groups))
}

function linkedLayerBlocks(
  layer: LayoutGroup[],
  links: Map<string, Set<string>>,
  siblingFamilies: Map<string, Set<string>>,
): LayoutGroup[][] {
  const familyParents = new Map(layer.map((group) => [group.id, group.id]))
  const findFamily = (groupId: string): string => {
    const root = familyParents.get(groupId)!
    if (root !== groupId) familyParents.set(groupId, findFamily(root))
    return familyParents.get(groupId)!
  }
  const joinFamily = (firstId: string, secondId: string) => {
    const firstRoot = findFamily(firstId)
    const secondRoot = findFamily(secondId)
    if (firstRoot !== secondRoot) familyParents.set(secondRoot, firstRoot)
  }
  const linkedGroups = new Map<string, string[]>()
  for (const group of layer) {
    const linked = [...(links.get(group.id) ?? [])].sort()
    if (!linked.length) continue
    const signature = JSON.stringify(linked)
    linkedGroups.set(signature, [...(linkedGroups.get(signature) ?? []), group.id])
  }
  for (const groupIds of linkedGroups.values()) {
    for (let index = 1; index < groupIds.length; index += 1) joinFamily(groupIds[0]!, groupIds[index]!)
  }
  for (const family of siblingFamilies.values()) {
    const groupIds = [...family].filter((groupId) => familyParents.has(groupId))
    for (let index = 1; index < groupIds.length; index += 1) joinFamily(groupIds[0]!, groupIds[index]!)
  }
  const blocksByRoot = new Map<string, LayoutGroup[]>()
  for (const group of layer) {
    const root = findFamily(group.id)
    blocksByRoot.set(root, [...(blocksByRoot.get(root) ?? []), group])
  }
  return [...blocksByRoot.values()]
}
