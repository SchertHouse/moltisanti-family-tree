export type RelationshipType = 'parent-child' | 'partner'

export interface Person {
  id: string
  firstName: string
  lastName: string
  birthDate?: string
  deathDate?: string
  birthPlace?: string
  biography?: string
  email?: string
  whatsapp?: string
  photo?: string
  gallery?: string[]
  notes?: string
  sources?: string
}

export interface Relationship {
  id: string
  type: RelationshipType
  from: string
  to: string
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
    if (!['parent-child', 'partner'].includes(relationship.type) || !ids.has(relationship.from) || !ids.has(relationship.to)) {
      throw new Error('La relazione contiene persone inesistenti o un tipo non valido.')
    }
    if (relationship.from === relationship.to) throw new Error('Una persona non può essere collegata a sé stessa.')
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

export function relationTo(archive: FamilyArchive, personId: string, type: RelationshipType, otherId: string): FamilyArchive {
  const exists = archive.relationships.some((r) =>
    r.type === type && (type === 'partner'
      ? (r.from === personId && r.to === otherId) || (r.from === otherId && r.to === personId)
      : r.from === personId && r.to === otherId))
  if (exists) throw new Error('Questa relazione è già presente.')
  const next = {
    ...archive,
    relationships: [...archive.relationships, { id: crypto.randomUUID(), type, from: personId, to: otherId }],
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
  const groupByPerson = new Map(groups.flatMap((group) => group.people.map((person) => [person.id, group.id] as const)))
  const parents = new Map(groups.map((group) => [group.id, new Set<string>()]))
  const children = new Map(groups.map((group) => [group.id, new Set<string>()]))
  for (const relationship of archive.relationships) {
    if (relationship.type !== 'parent-child') continue
    const parent = groupByPerson.get(relationship.from)!
    const child = groupByPerson.get(relationship.to)!
    if (parent === child) continue
    parents.get(child)!.add(parent)
    children.get(parent)!.add(child)
  }

  const maxLevel = Math.max(0, ...groups.map((group) => group.level))
  const layers = Array.from({ length: maxLevel + 1 }, (_, level) =>
    groups.filter((group) => group.level === level).sort((a, b) => a.id.localeCompare(b.id)))
  for (let pass = 0; pass < 4; pass += 1) {
    for (let level = 1; level <= maxLevel; level += 1) {
      reorderLayer(layers[level]!, layers[level - 1]!, parents)
    }
    for (let level = maxLevel - 1; level >= 0; level -= 1) {
      reorderLayer(layers[level]!, layers[level + 1]!, children)
    }
  }

  const positions = new Map<string, { x: number; y: number }>()
  for (const [level, layer] of layers.entries()) {
    const width = layer.reduce((total, group) => total + groupWidth(group.people.length), 0) +
      Math.max(0, layer.length - 1) * 80
    let left = 500 - width / 2
    for (const group of layer) {
      group.people.forEach((person, index) => {
        positions.set(person.id, { x: left + 80 + index * 190, y: 100 + level * 190 })
      })
      left += groupWidth(group.people.length) + 80
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
  const partners = archive.relationships.filter((relationship) => relationship.type === 'partner')
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

function reorderLayer(
  layer: LayoutGroup[],
  neighbors: LayoutGroup[],
  links: Map<string, Set<string>>,
): void {
  const neighborIndex = new Map(neighbors.map((group, index) => [group.id, index]))
  const originalOrder = new Map(layer.map((group, index) => [group.id, index]))
  const barycenter = (groupId: string): number | null => {
    const indexes = [...(links.get(groupId) ?? [])]
      .map((neighborId) => neighborIndex.get(neighborId))
      .filter((index): index is number => index !== undefined)
    return indexes.length ? indexes.reduce((total, index) => total + index, 0) / indexes.length : null
  }
  layer.sort((a, b) => {
    const aCenter = barycenter(a.id)
    const bCenter = barycenter(b.id)
    if (aCenter === null && bCenter !== null) return (originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0)
    if (aCenter !== null && bCenter === null) return (originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0)
    return (aCenter ?? 0) - (bCenter ?? 0) ||
      (originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0)
  })
}
