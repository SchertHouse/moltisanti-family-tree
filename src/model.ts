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
  const levels = new Map(archive.people.map((person) => [person.id, 0]))
  const edges = archive.relationships.filter((r) => r.type === 'parent-child')
  for (let pass = 0; pass < archive.people.length; pass += 1) {
    let changed = false
    for (const edge of edges) {
      const parent = levels.get(edge.from) ?? 0
      const child = levels.get(edge.to) ?? 0
      if (child <= parent) {
        levels.set(edge.to, parent + 1)
        changed = true
      }
    }
    if (!changed) break
  }
  return levels
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
  const grouped = new Map<number, Person[]>()
  for (const person of archive.people) {
    const level = generations.get(person.id) ?? 0
    grouped.set(level, [...(grouped.get(level) ?? []), person])
  }
  const positions = new Map<string, { x: number; y: number }>()
  for (const [level, people] of grouped) {
    const span = (people.length - 1) * 230
    people.forEach((person, index) => positions.set(person.id, { x: 500 - span / 2 + index * 230, y: 100 + level * 190 }))
  }
  return positions
}
