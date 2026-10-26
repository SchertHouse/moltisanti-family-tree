import { isUnionRelationship, unionDetails, type FamilyArchive, type Person, type Relationship } from './model'

const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export interface GedcomMediaReference {
  ref: string
  path: string
  mimeType: string
}

function gedcomDate(value: string): string {
  const [year, month, day] = value.split('-')
  if (!month) return year!
  const monthName = months[Number(month) - 1]
  if (!day) return `${monthName} ${year}`
  return `${Number(day)} ${monthName} ${year}`
}

function payloadLines(level: number, tag: string, value: string): string[] {
  const lines = [...value]
    .map((character) => {
      const code = character.charCodeAt(0)
      return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127 ? ' ' : character
    })
    .join('')
    .replace(/@/g, '@@')
    .split(/\r\n|\r|\n/)
  return lines.map((line, index) =>
    `${index === 0 ? level : level + 1} ${index === 0 ? tag : 'CONT'}${line ? ` ${line}` : ''}`)
}

function personName(person: Person): string {
  const firstName = person.firstName.replace(/\//g, '\\/')
  const lastName = person.lastName.replace(/\//g, '\\/')
  return `${firstName} /${lastName}/`
}

export function toGedcom(
  archive: FamilyArchive,
  mediaByPerson: ReadonlyMap<string, GedcomMediaReference[]> = new Map(),
): string {
  const individualRefs = new Map(archive.people.map((person, index) => [person.id, `@I${index + 1}@`]))
  const peopleById = new Map(archive.people.map((person) => [person.id, person]))
  const parentIdsByChild = new Map<string, string[]>()
  const familyGroups = new Map<string, {
    ref: string
    memberIds: string[]
    childIds: string[]
    unionRelationships: Relationship[]
  }>()
  const getFamily = (memberIds: string[]) => {
    const members = [...new Set(memberIds)].sort()
    const key = JSON.stringify(members)
    const family = familyGroups.get(key) ?? {
      ref: `@F${familyGroups.size + 1}@`,
      memberIds: members,
      childIds: [],
      unionRelationships: [],
    }
    familyGroups.set(key, family)
    return family
  }

  for (const relationship of archive.relationships) {
    if (relationship.type === 'parent-child') {
      parentIdsByChild.set(relationship.to, [
        ...(parentIdsByChild.get(relationship.to) ?? []),
        relationship.from,
      ])
    }
    if (isUnionRelationship(relationship)) {
      getFamily([relationship.from, relationship.to]).unionRelationships.push(relationship)
    }
  }

  for (const person of archive.people) {
    const parentIds = [...new Set(parentIdsByChild.get(person.id) ?? [])].sort()
    if (parentIds.length === 0) continue
    const family = getFamily(parentIds)
    family.childIds.push(person.id)
  }
  const familyRefByChild = new Map<string, string>()
  for (const family of familyGroups.values()) {
    const childIds = family.childIds.sort((leftId, rightId) => {
      const leftDate = peopleById.get(leftId)?.birthDate
      const rightDate = peopleById.get(rightId)?.birthDate
      if (!leftDate) return rightDate ? 1 : 0
      if (!rightDate) return -1
      return leftDate.localeCompare(rightDate)
    })
    for (const childId of childIds) familyRefByChild.set(childId, family.ref)
  }
  const familyRefsByPartner = new Map<string, string[]>()
  for (const family of familyGroups.values()) {
    for (const memberId of family.memberIds.slice(0, 2)) {
      familyRefsByPartner.set(memberId, [...(familyRefsByPartner.get(memberId) ?? []), family.ref])
    }
  }

  const lines = [
    '0 HEAD',
    '1 SOUR Moltisanti Family Tree',
    '1 GEDC',
    '2 VERS 7.0',
    '2 FORM LINEAGE-LINKED',
    '1 CHAR UTF-8',
    '1 SUBM @U1@',
    '0 @U1@ SUBM',
    ...payloadLines(1, 'NAME', 'Moltisanti Family Tree'),
  ]

  for (const person of archive.people) {
    const ref = individualRefs.get(person.id)!
    lines.push(`0 ${ref} INDI`)
    lines.push(...payloadLines(1, 'NAME', personName(person)))
    lines.push(...payloadLines(2, 'GIVN', person.firstName))
    lines.push(...payloadLines(2, 'SURN', person.lastName))
    if (person.alternateName) {
      lines.push(...payloadLines(1, 'NAME', person.alternateName))
      lines.push('2 TYPE AKA')
    }
    if (person.sexAtBirth) lines.push(...payloadLines(1, 'SEX', person.sexAtBirth))
    if (person.birthDate || person.birthPlace) {
      lines.push('1 BIRT')
      if (person.birthDate) lines.push(...payloadLines(2, 'DATE', gedcomDate(person.birthDate)))
      if (person.birthPlace) lines.push(...payloadLines(2, 'PLAC', person.birthPlace))
    }
    if (person.deathDate) {
      lines.push('1 DEAT')
      lines.push(...payloadLines(2, 'DATE', gedcomDate(person.deathDate)))
    }
    if (person.profession) lines.push(...payloadLines(1, 'OCCU', person.profession))
    if (person.residence) lines.push(...payloadLines(1, 'RESI', person.residence))
    if (person.nationality) lines.push(...payloadLines(1, 'NATI', person.nationality))
    if (person.biography) lines.push(...payloadLines(1, 'NOTE', person.biography))
    if (person.notes) lines.push(...payloadLines(1, 'NOTE', person.notes))
    if (person.sources) lines.push(...payloadLines(1, 'NOTE', `Sources: ${person.sources}`))
    const familyRef = familyRefByChild.get(person.id)
    if (familyRef) lines.push(`1 FAMC ${familyRef}`)
    for (const partnerFamilyRef of familyRefsByPartner.get(person.id) ?? []) {
      lines.push(`1 FAMS ${partnerFamilyRef}`)
    }
    for (const media of mediaByPerson.get(person.id) ?? []) lines.push(`1 OBJE ${media.ref}`)
  }

  for (const family of familyGroups.values()) {
    lines.push(`0 ${family.ref} FAM`)
    if (family.memberIds[0]) lines.push(`1 HUSB ${individualRefs.get(family.memberIds[0])!}`)
    if (family.memberIds[1]) lines.push(`1 WIFE ${individualRefs.get(family.memberIds[1])!}`)
    for (const relationship of family.unionRelationships) {
      const union = unionDetails(relationship)
      if (!union) continue
      if (union.kind === 'marriage') {
        lines.push('1 MARR')
        if (union.status === 'ended' && union.endReason === 'divorce') lines.push('1 DIV')
        if (union.status === 'ended' && union.endReason === 'annulment') lines.push('1 ANUL')
      } else {
        lines.push('1 EVEN')
        lines.push('2 TYPE PARTNERSHIP')
      }
      lines.push('1 _UNION')
      lines.push(`2 _TYPE ${union.kind.toUpperCase()}`)
      lines.push(`2 _STATUS ${union.status.toUpperCase()}`)
      if (union.endReason) lines.push(`2 _ENDREASON ${union.endReason.toUpperCase()}`)
    }
    for (const additionalParentId of family.memberIds.slice(2)) {
      lines.push(`1 ASSO ${individualRefs.get(additionalParentId)!}`)
      lines.push('2 ROLE PARENT')
    }
    for (const childId of family.childIds) {
      lines.push(`1 CHIL ${individualRefs.get(childId)!}`)
    }
  }
  for (const media of [...mediaByPerson.values()].flat()) {
    lines.push(`0 ${media.ref} OBJE`)
    lines.push(...payloadLines(1, 'FILE', media.path))
    lines.push(...payloadLines(2, 'FORM', media.mimeType))
  }
  lines.push('0 TRLR')

  return `${lines.join('\r\n')}\r\n`
}
