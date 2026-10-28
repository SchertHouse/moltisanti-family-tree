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
  for (const id of ids) {
    if (visited.has(id)) continue
    const stack = [{ id, nextChild: 0, children: parents.get(id) ?? [] }]
    active.add(id)
    while (stack.length > 0) {
      const current = stack[stack.length - 1]!
      const child = current.children[current.nextChild]
      if (child === undefined) {
        stack.pop()
        active.delete(current.id)
        visited.add(current.id)
        continue
      }
      current.nextChild += 1
      if (active.has(child)) throw new Error('Le relazioni genitoriali contengono un ciclo.')
      if (visited.has(child)) continue
      active.add(child)
      stack.push({ id: child, nextChild: 0, children: parents.get(child) ?? [] })
    }
  }
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

export type BirthdayInfo =
  | { precision: 'day'; date: Date; days: number }
  | { precision: 'month'; month: number }

export function birthdayInfo(date: string | undefined, today = new Date()): BirthdayInfo | null {
  if (!date || !/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(date)) return null
  const [, monthValue, dayValue] = date.split('-')
  if (!monthValue) return null
  const month = Number(monthValue) - 1
  if (month < 0 || month > 11) return null
  if (!dayValue) return { precision: 'month', month }
  const day = Number(dayValue)
  const birthDate = new Date(2000, month, day)
  if (birthDate.getMonth() !== month || birthDate.getDate() !== day) return null
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
  return {
    precision: 'day',
    date: next,
    days: Math.round((next.getTime() - start.getTime()) / 86_400_000),
  }
}

export function treePositions(archive: FamilyArchive): Map<string, { x: number; y: number }> {
  const generations = generationMap(archive)
  const partnerMap = partnerGroups(archive)
  const familyGroups = new Map<string, Person[]>()
  for (const person of archive.people) {
    const groupId = partnerMap.find(person.id)
    familyGroups.set(groupId, [...(familyGroups.get(groupId) ?? []), person])
  }

  const coParentsByParent = new Map<string, Set<string>>()
  const parentsByChild = new Map<string, Set<string>>()
  for (const relationship of archive.relationships) {
    if (relationship.type !== 'parent-child') continue
    const parents = parentsByChild.get(relationship.to) ?? new Set<string>()
    parents.add(relationship.from)
    parentsByChild.set(relationship.to, parents)
  }
  for (const parentIds of parentsByChild.values()) {
    for (const parentId of parentIds) {
      const coParents = coParentsByParent.get(parentId) ?? new Set<string>()
      for (const coParentId of parentIds) {
        if (coParentId !== parentId) coParents.add(coParentId)
      }
      coParentsByParent.set(parentId, coParents)
    }
  }

  const groups = [...familyGroups].map(([id, people]) => ({
    id,
    people: orderPartnerGroup(people, coParentsByParent),
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
    const childGroupId = groupByPerson.get(personId)!
    const familyKeys = [
      JSON.stringify([...parentIds].sort()),
      ...[...parentIds].map((parentId) => JSON.stringify([groupByPerson.get(parentId)])),
    ]
    for (const familyKey of familyKeys) {
      const familyGroups = siblingFamilies.get(familyKey) ?? new Set<string>()
      familyGroups.add(childGroupId)
      siblingFamilies.set(familyKey, familyGroups)
    }
  }

  const maxLevel = groups.reduce((maximum, group) => Math.max(maximum, group.level), 0)
  const layers = Array.from({ length: maxLevel + 1 }, () => [] as LayoutGroup[])
  for (const group of groups) layers[group.level]!.push(group)
  for (const layer of layers) layer.sort((a, b) => a.id.localeCompare(b.id))
  for (let pass = 0; pass < 12; pass += 1) {
    const previousOrder = layers.map((layer) => layer.map((group) => group.id).join('\u0000'))
    for (let level = 1; level <= maxLevel; level += 1) {
      reorderLayer(layers[level]!, layers[level - 1]!, parents, siblingFamilies, parentAnchors)
    }
    for (let level = maxLevel - 1; level >= 0; level -= 1) {
      reorderLayer(layers[level]!, layers[level + 1]!, children, siblingFamilies, childAnchors)
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

  const minimumX = groups.reduce((minimum, group) =>
    Math.min(minimum, groupCenters.get(group.id)! - groupWidth(group.people.length) / 2), Infinity)
  const maximumX = groups.reduce((maximum, group) =>
    Math.max(maximum, groupCenters.get(group.id)! + groupWidth(group.people.length) / 2), -Infinity)
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

export interface FamilyConnectorRoute {
  key: string
  parentIds: string[]
  childIds: string[]
  parentBusY: number
  childrenBusY: number
  parentBranchXs: Record<string, number>
}

export interface FamilyConnectorBridge {
  key: string
  x: number
  y: number
}

export interface PartnerConnectorGeometry {
  path: string
  heartX: number
  heartY: number
}

export function partnerConnectorGeometry(
  fromId: string,
  toId: string,
  positions: ReadonlyMap<string, { x: number; y: number }>,
  visiblePersonIds: Iterable<string> = positions.keys(),
  descendantBusYByPerson: ReadonlyMap<string, number> = new Map(),
): PartnerConnectorGeometry {
  const from = positions.get(fromId)
  const to = positions.get(toId)
  if (!from || !to) throw new Error('Coordinate del connettore partner mancanti.')

  const direction = to.x >= from.x ? 1 : -1
  const start = { x: from.x + direction * 80, y: from.y }
  const end = { x: to.x - direction * 80, y: to.y }
  const control1 = from.y === to.y
    ? null
    : { x: start.x + direction * 25, y: start.y - 15 }
  const control2 = from.y === to.y
    ? null
    : { x: end.x - direction * 25, y: end.y - 15 }
  const visibleIds = [...visiblePersonIds].filter((id) => id !== fromId && id !== toId)
  const obstacles = visibleIds.map((id) => positions.get(id)).filter(
    (point): point is { x: number; y: number } => point !== undefined,
  )

  const cubicPoint = (
    first: { x: number; y: number },
    second: { x: number; y: number },
    third: { x: number; y: number },
    fourth: { x: number; y: number },
    t: number,
  ) => {
    const inverse = 1 - t
    return {
      x: inverse ** 3 * first.x + 3 * inverse ** 2 * t * second.x +
        3 * inverse * t ** 2 * third.x + t ** 3 * fourth.x,
      y: inverse ** 3 * first.y + 3 * inverse ** 2 * t * second.y +
        3 * inverse * t ** 2 * third.y + t ** 3 * fourth.y,
    }
  }
  const hitsCubic = (
    first: { x: number; y: number },
    firstControl: { x: number; y: number },
    secondControl: { x: number; y: number },
    last: { x: number; y: number },
  ) => obstacles.some((obstacle) => {
    for (let index = 0; index <= 40; index += 1) {
      const point = cubicPoint(first, firstControl, secondControl, last, index / 40)
      if (Math.abs(point.x - obstacle.x) < 84 && Math.abs(point.y - obstacle.y) < 56) return true
    }
    return false
  })

  const hitsPerson = (firstControl: { x: number; y: number }, secondControl: { x: number; y: number }) =>
    hitsCubic(start, firstControl, secondControl, end)

  if (control1 && control2 && !hitsPerson(control1, control2)) {
    const midpoint = cubicPoint(start, control1, control2, end, 0.5)
    return {
      path: `M ${start.x} ${start.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`,
      heartX: midpoint.x,
      heartY: midpoint.y,
    }
  }
  if (!control1 && !control2 && !hitsPerson(start, end)) {
    return {
      path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
      heartX: (start.x + end.x) / 2,
      heartY: (start.y + end.y) / 2,
    }
  }

  if (start.y === end.y) {
    const bypassCandidates = visibleIds.flatMap((id) => {
      const obstacle = positions.get(id)
      if (!obstacle || obstacle.x <= Math.min(start.x, end.x) || obstacle.x >= Math.max(start.x, end.x) ||
        Math.abs(obstacle.y - start.y) >= 56) return []
      return [-1, 1].map((sign) => {
        const edgeY = obstacle.y + sign * 52
        const busY = descendantBusYByPerson.get(id)
        const isBusBetween = busY !== undefined && (sign < 0 ? busY < edgeY : busY > edgeY)
        return {
          x: obstacle.x,
          y: isBusBetween ? (edgeY + busY) / 2 : edgeY + sign * 8,
          sign,
          hasBusGap: isBusBetween,
        }
      })
    }).sort((a, b) => Number(b.hasBusGap) - Number(a.hasBusGap) ||
      Math.abs(a.y - start.y) - Math.abs(b.y - start.y) || a.sign - b.sign)

    for (const candidate of bypassCandidates) {
      const sourceCorner = { x: from.x + direction * 80, y: from.y + candidate.sign * 52 }
      const targetCorner = { x: to.x - direction * 80, y: to.y + candidate.sign * 52 }
      const midpoint = { x: candidate.x, y: candidate.y }
      for (let controlDistance = 8; controlDistance <= 2400; controlDistance += 4) {
        const firstControl = {
          x: sourceCorner.x + direction * controlDistance,
          y: sourceCorner.y + candidate.sign * controlDistance,
        }
        const secondControl = {
          x: midpoint.x - direction * controlDistance,
          y: midpoint.y,
        }
        const thirdControl = {
          x: midpoint.x + direction * controlDistance,
          y: midpoint.y,
        }
        const fourthControl = {
          x: targetCorner.x - direction * controlDistance,
          y: targetCorner.y + candidate.sign * controlDistance,
        }
        if (hitsCubic(sourceCorner, firstControl, secondControl, midpoint) ||
          hitsCubic(midpoint, thirdControl, fourthControl, targetCorner)) continue
        return {
          path: `M ${sourceCorner.x} ${sourceCorner.y} C ${firstControl.x} ${firstControl.y}, ${secondControl.x} ${secondControl.y}, ${midpoint.x} ${midpoint.y} C ${thirdControl.x} ${thirdControl.y}, ${fourthControl.x} ${fourthControl.y}, ${targetCorner.x} ${targetCorner.y}`,
          heartX: midpoint.x,
          heartY: midpoint.y,
        }
      }
    }
  }

  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy) || 1
  const normal = { x: -dy / length, y: dx / length }
  for (let amplitude = 56; amplitude <= 2400; amplitude += 8) {
    for (const sign of [-1, 1]) {
      const firstCurveControl = {
        x: start.x + dx / 3 + normal.x * amplitude * sign,
        y: start.y + dy / 3 + normal.y * amplitude * sign,
      }
      const secondCurveControl = {
        x: end.x - dx / 3 + normal.x * amplitude * sign,
        y: end.y - dy / 3 + normal.y * amplitude * sign,
      }
      if (hitsPerson(firstCurveControl, secondCurveControl)) continue
      const midpoint = cubicPoint(start, firstCurveControl, secondCurveControl, end, 0.5)
      return {
        path: `M ${start.x} ${start.y} C ${firstCurveControl.x} ${firstCurveControl.y}, ${secondCurveControl.x} ${secondCurveControl.y}, ${end.x} ${end.y}`,
        heartX: midpoint.x,
        heartY: midpoint.y,
      }
    }
  }
  throw new Error('Impossibile instradare il connettore partner senza attraversare una persona.')
}

export function familyConnectorPath(
  route: FamilyConnectorRoute,
  positions: ReadonlyMap<string, { x: number; y: number }>,
): string {
  const parentPoints = route.parentIds.map((id) => positions.get(id)!)
  const childPoints = route.childIds.map((id) => positions.get(id)!)
  const parentBranchPositions = route.parentIds.map((id, index) =>
    route.parentBranchXs[id] ?? parentPoints[index]!.x)
  const parentLeft = Math.min(...parentBranchPositions)
  const parentRight = Math.max(...parentBranchPositions)
  const parentCenter = (parentLeft + parentRight) / 2
  const childLeft = Math.min(...childPoints.map((point) => point.x))
  const childRight = Math.max(...childPoints.map((point) => point.x))
  const parentBranches = route.parentIds.map((id, index) => {
    const point = parentPoints[index]!
    const branchX = route.parentBranchXs[id] ?? point.x
    return `M ${branchX} ${point.y + 52} L ${branchX} ${route.parentBusY}`
  }).join(' ')
  const parentsBus = parentPoints.length > 1
    ? `M ${parentLeft} ${route.parentBusY} L ${parentRight} ${route.parentBusY}`
    : ''
  const familyTrunk = childPoints.length === 1
    ? ''
    : `M ${parentCenter} ${route.parentBusY} L ${parentCenter} ${route.childrenBusY}`
  const childrenBus = childPoints.length === 1
    ? ''
    : parentCenter < childLeft
      ? `M ${parentCenter} ${route.childrenBusY} L ${childLeft} ${route.childrenBusY} L ${childRight} ${route.childrenBusY}`
      : parentCenter > childRight
        ? `M ${parentCenter} ${route.childrenBusY} L ${childRight} ${route.childrenBusY} L ${childLeft} ${route.childrenBusY}`
        : parentCenter === childLeft
          ? `M ${parentCenter} ${route.childrenBusY} L ${childRight} ${route.childrenBusY}`
          : parentCenter === childRight
            ? `M ${parentCenter} ${route.childrenBusY} L ${childLeft} ${route.childrenBusY}`
            : `M ${childLeft} ${route.childrenBusY} L ${parentCenter} ${route.childrenBusY} M ${parentCenter} ${route.childrenBusY} L ${childRight} ${route.childrenBusY}`
  const childBranches = childPoints.length === 1
    ? childPoints[0]!.x >= parentLeft && childPoints[0]!.x <= parentRight
      ? `M ${childPoints[0]!.x} ${route.parentBusY} L ${childPoints[0]!.x} ${childPoints[0]!.y - 54}`
      : `M ${childPoints[0]!.x < parentLeft ? parentLeft : parentRight} ${route.parentBusY} L ${childPoints[0]!.x} ${route.parentBusY} L ${childPoints[0]!.x} ${childPoints[0]!.y - 54}`
    : childPoints.map((point) =>
      `M ${point.x} ${route.childrenBusY} L ${point.x} ${point.y - 54}`).join(' ')
  return `${parentBranches} ${parentsBus} ${familyTrunk} ${childrenBus} ${childBranches}`
}

export function familyConnectorRoutes(
  archive: FamilyArchive,
  positions: ReadonlyMap<string, { x: number; y: number }>,
): FamilyConnectorRoute[] {
  const families = new Map<string, { parentIds: string[]; childIds: string[] }>()
  const parentsByChild = new Map<string, Set<string>>()
  for (const relationship of archive.relationships) {
    if (relationship.type !== 'parent-child') continue
    const parents = parentsByChild.get(relationship.to) ?? new Set<string>()
    parents.add(relationship.from)
    parentsByChild.set(relationship.to, parents)
  }
  for (const [childId, unsortedParentIds] of parentsByChild) {
    const parentIds = [...unsortedParentIds].sort()
    const key = JSON.stringify(parentIds)
    const family = families.get(key) ?? { parentIds, childIds: [] }
    family.childIds.push(childId)
    families.set(key, family)
  }

  const sharedParentFamilies = new Map<string, { key: string; coParentCenter: number }[]>()
  for (const [key, family] of families) {
    const parents = family.parentIds.map((id) => positions.get(id)!)
    for (const parentId of family.parentIds) {
      const coParents = parents.filter((_, index) => family.parentIds[index] !== parentId)
      const coParentCenter = coParents.length
        ? coParents.reduce((total, point) => total + point.x, 0) / coParents.length
        : positions.get(parentId)!.x
      const routes = sharedParentFamilies.get(parentId) ?? []
      routes.push({ key, coParentCenter })
      sharedParentFamilies.set(parentId, routes)
    }
  }
  const parentBranchXs = new Map<string, Record<string, number>>()
  for (const [parentId, routes] of sharedParentFamilies) {
    routes.sort((a, b) => a.coParentCenter - b.coParentCenter || a.key.localeCompare(b.key))
    for (const [index, route] of routes.entries()) {
      if (routes.length < 2) continue
      const parentX = positions.get(parentId)!.x
      const offset = (index - (routes.length - 1) / 2) * 16
      const branchXs = parentBranchXs.get(route.key) ?? {}
      branchXs[parentId] = parentX + offset
      parentBranchXs.set(route.key, branchXs)
    }
  }

  const routesByRow = new Map<string, {
    key: string
    family: { parentIds: string[]; childIds: string[] }
    left: number
    right: number
    parentBottom: number
    childTop: number
  }[]>()
  for (const [key, family] of families) {
    const parentPoints = family.parentIds.map((id) => positions.get(id))
    const childPoints = family.childIds.map((id) => positions.get(id))
    if (parentPoints.some((point) => point === undefined) || childPoints.some((point) => point === undefined)) {
      throw new Error('Coordinate del connettore familiare mancanti.')
    }
    const parents = parentPoints.filter((point): point is { x: number; y: number } => point !== undefined)
    const children = childPoints.filter((point): point is { x: number; y: number } => point !== undefined)
    const parentBottom = Math.max(...parents.map((point) => point.y + 54))
    const childTop = Math.min(...children.map((point) => point.y - 54))
    const rowKey = `${parentBottom}:${childTop}`
    const row = routesByRow.get(rowKey) ?? []
    row.push({
      key,
      family,
      left: Math.min(...parents.map((point) => point.x)),
      right: Math.max(...parents.map((point) => point.x)),
      parentBottom,
      childTop,
    })
    routesByRow.set(rowKey, row)
  }

  const busPositions = new Map<string, number>()
  for (const row of routesByRow.values()) {
    row.sort((a, b) => a.left - b.left || a.right - b.right || a.key.localeCompare(b.key))
    const laneRights: number[] = []
    const assignments = new Map<string, number>()
    for (const route of row) {
      let lane = laneRights.findIndex((right) => right < route.left)
      if (lane === -1) lane = laneRights.length
      laneRights[lane] = route.right
      assignments.set(route.key, lane)
    }
    for (const route of row) {
      const lane = assignments.get(route.key)!
      const gap = Math.max(0, route.childTop - route.parentBottom)
      busPositions.set(route.key, route.parentBottom + (gap * (lane + 1)) / (laneRights.length + 1))
    }
  }

  return [...families.entries()].map(([key, family]) => {
    const childPoints = family.childIds.map((id) => positions.get(id)!)
    const childTop = Math.min(...childPoints.map((point) => point.y - 54))
    return {
      key,
      parentIds: family.parentIds,
      childIds: [...new Set(family.childIds)].sort(),
      parentBusY: busPositions.get(key)!,
      childrenBusY: childTop - 20,
      parentBranchXs: parentBranchXs.get(key) ?? {},
    }
  })
}

export function familyConnectorBridges(
  routes: FamilyConnectorRoute[],
  positions: ReadonlyMap<string, { x: number; y: number }>,
): FamilyConnectorBridge[] {
  const segments = routes.map((route) => {
    const parents = route.parentIds.map((id) => positions.get(id)!)
    const children = route.childIds.map((id) => positions.get(id)!)
    const parentBranchPositions = route.parentIds.map((id, index) =>
      route.parentBranchXs[id] ?? parents[index]!.x)
    const parentLeft = Math.min(...parentBranchPositions)
    const parentRight = Math.max(...parentBranchPositions)
    const parentCenter = (parentLeft + parentRight) / 2
    const childLeft = Math.min(...children.map((point) => point.x))
    const childRight = Math.max(...children.map((point) => point.x))
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = []
    for (const [index, parentId] of route.parentIds.entries()) {
      const point = parents[index]!
      const branchX = route.parentBranchXs[parentId] ?? point.x
      if (branchX !== point.x) lines.push({ x1: point.x, y1: point.y + 54, x2: branchX, y2: point.y + 54 })
      lines.push({ x1: branchX, y1: point.y + 54, x2: branchX, y2: route.parentBusY })
    }
    if (parents.length > 1) {
      lines.push({ x1: parentLeft, y1: route.parentBusY, x2: parentRight, y2: route.parentBusY })
    }
    if (children.length === 1) {
      const childX = children[0]!.x
      if (childX < parentLeft || childX > parentRight) {
        const busEdge = childX < parentLeft ? parentLeft : parentRight
        lines.push({ x1: busEdge, y1: route.parentBusY, x2: childX, y2: route.parentBusY })
      }
      lines.push({ x1: childX, y1: route.parentBusY, x2: childX, y2: children[0]!.y - 54 })
    } else {
      lines.push({ x1: parentCenter, y1: route.parentBusY, x2: parentCenter, y2: route.childrenBusY })
      lines.push({
        x1: Math.min(childLeft, parentCenter),
        y1: route.childrenBusY,
        x2: Math.max(childRight, parentCenter),
        y2: route.childrenBusY,
      })
      for (const child of children) {
        lines.push({ x1: child.x, y1: route.childrenBusY, x2: child.x, y2: child.y - 54 })
      }
    }
    return { route, lines }
  })
  const bridges = new Map<string, FamilyConnectorBridge>()
  for (let firstIndex = 0; firstIndex < segments.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < segments.length; secondIndex += 1) {
      for (const first of segments[firstIndex]!.lines) {
        for (const second of segments[secondIndex]!.lines) {
          const horizontal = first.y1 === first.y2 ? first : second.y1 === second.y2 ? second : null
          const vertical = first.x1 === first.x2 ? first : second.x1 === second.x2 ? second : null
          if (!horizontal || !vertical) continue
          const x = vertical.x1
          const y = horizontal.y1
          const withinHorizontal = x > Math.min(horizontal.x1, horizontal.x2) + 8 &&
            x < Math.max(horizontal.x1, horizontal.x2) - 8
          const withinVertical = y > Math.min(vertical.y1, vertical.y2) + 8 &&
            y < Math.max(vertical.y1, vertical.y2) - 8
          if (!withinHorizontal || !withinVertical) continue
          const key = `${x}:${y}`
          bridges.set(key, { key, x, y })
        }
      }
    }
  }
  return [...bridges.values()]
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
  const layoutUnions = archive.relationships.filter((relationship) => {
    if (!isUnionRelationship(relationship)) return false
    const details = unionDetails(relationship)
    return details?.status === 'current' || details?.kind === 'marriage'
  })
    .sort((a, b) => {
      const aKey = [a.from, a.to].sort().join('\u0000')
      const bKey = [b.from, b.to].sort().join('\u0000')
      return aKey.localeCompare(bKey)
    })

  for (const relationship of layoutUnions) {
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

function orderPartnerGroup(people: Person[], coParentsByParent: Map<string, Set<string>>): Person[] {
  const sorted = [...people].sort((a, b) =>
    a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName) || a.id.localeCompare(b.id))
  const memberIds = new Set(sorted.map((person) => person.id))
  const centralParent = sorted.find((person) =>
    [...(coParentsByParent.get(person.id) ?? [])].filter((coParentId) => memberIds.has(coParentId)).length > 1)
  if (!centralParent) return sorted

  const partners = sorted.filter((person) => person.id !== centralParent.id)
  const centerIndex = Math.floor(sorted.length / 2)
  return [...partners.slice(0, centerIndex), centralParent, ...partners.slice(centerIndex)]
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
  if (layer.length === 1) {
    const group = layer[0]!
    const neighborCenters = (anchors.get(group.id) ?? [])
      .map((anchor) => {
        const neighborCenter = centers.get(anchor.neighborId)
        return neighborCenter === undefined
          ? undefined
          : neighborCenter + anchor.neighborOffset - anchor.ownOffset
      })
      .filter((center): center is number => center !== undefined)
    if (neighborCenters.length) {
      centers.set(group.id, neighborCenters.reduce((total, center) => total + center, 0) / neighborCenters.length)
    }
    return
  }
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
  anchors: Map<string, LayoutAnchor[]>,
): void {
  if (layer.length < 2) return
  const neighborCenter = new Map<string, number>()
  let neighborLeft = 0
  for (const group of neighbors) {
    neighborCenter.set(group.id, neighborLeft + groupWidth(group.people.length) / 2)
    neighborLeft += groupWidth(group.people.length) + 80
  }
  const originalOrder = new Map(layer.map((group, index) => [group.id, index]))
  const blocksByRoot = linkedLayerBlocks(layer, links, siblingFamilies)
  const barycenter = (groupId: string): number | null => {
    const targets = (anchors.get(groupId) ?? [])
      .map((anchor) => {
        const center = neighborCenter.get(anchor.neighborId)
        return center === undefined ? undefined : center + anchor.neighborOffset - anchor.ownOffset
      })
      .filter((center): center is number => center !== undefined)
    return targets.length ? targets.reduce((total, center) => total + center, 0) / targets.length : null
  }
  const blocks = blocksByRoot.map((family) => {
    const familyGroupsInOrder = family.sort((a, b) =>
      (originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0))
    familyGroupsInOrder.sort((a, b) => {
      const aCenter = barycenter(a.id)
      const bCenter = barycenter(b.id)
      if (aCenter === null || bCenter === null) {
        return (originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0)
      }
      return aCenter - bCenter || (originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0)
    })
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
