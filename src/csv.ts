import { isSexAtBirth, validateArchive, type FamilyArchive, type Person, type Relationship } from './model'

const csvVersion = '2'
const supportedCsvVersions = new Set(['1', csvVersion])
const headers = [
  'csvVersion', 'recordType', 'id',
  'firstName', 'lastName', 'alternateName', 'sexAtBirth', 'birthDate', 'deathDate', 'birthPlace',
  'profession', 'residence', 'nationality', 'biography', 'email', 'whatsapp', 'notes', 'sources',
  'relationshipType', 'from', 'to', 'unionKind', 'unionStatus', 'unionEndReason',
] as const

const personFields = [
  'firstName', 'lastName', 'alternateName', 'birthDate', 'deathDate', 'birthPlace', 'profession',
  'residence', 'nationality', 'biography', 'email', 'whatsapp', 'notes', 'sources',
] as const satisfies readonly (keyof Person)[]

type CsvRow = Record<(typeof headers)[number], string>

export interface CsvImportSummary {
  peopleAdded: number
  peopleUpdated: number
  relationshipsAdded: number
  relationshipsUpdated: number
}

export interface CsvImportPreview {
  archive: FamilyArchive
  summary: CsvImportSummary
}

function escapeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let closedQuote = false

  const finishRow = () => {
    row.push(field)
    if (row.some((cell) => cell.trim())) rows.push(row)
    row = []
    field = ''
    closedQuote = false
  }

  for (let index = text.charCodeAt(0) === 0xfeff ? 1 : 0; index < text.length; index += 1) {
    const character = text[index]!
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
        closedQuote = true
      } else {
        field += character
      }
      continue
    }

    if (closedQuote && character !== ',' && character !== '\r' && character !== '\n') {
      throw new Error('CSV non valido: testo dopo una cella tra virgolette.')
    }
    if (character === '"') {
      if (field.length > 0) throw new Error('CSV non valido: virgolette in una cella non quotata.')
      quoted = true
    } else if (character === ',') {
      row.push(field)
      field = ''
      closedQuote = false
    } else if (character === '\r' || character === '\n') {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      finishRow()
    } else {
      field += character
    }
  }

  if (quoted) throw new Error('CSV non valido: virgolette non bilanciate.')
  if (field.length > 0 || row.length > 0 || closedQuote) finishRow()
  return rows
}

function personRow(person: Person): CsvRow {
  return {
    csvVersion,
    recordType: 'person',
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    alternateName: person.alternateName ?? '',
    sexAtBirth: person.sexAtBirth ?? '',
    birthDate: person.birthDate ?? '',
    deathDate: person.deathDate ?? '',
    birthPlace: person.birthPlace ?? '',
    profession: person.profession ?? '',
    residence: person.residence ?? '',
    nationality: person.nationality ?? '',
    biography: person.biography ?? '',
    email: person.email ?? '',
    whatsapp: person.whatsapp ?? '',
    notes: person.notes ?? '',
    sources: person.sources ?? '',
    relationshipType: '',
    from: '',
    to: '',
    unionKind: '',
    unionStatus: '',
    unionEndReason: '',
  }
}

function relationshipRow(relationship: Relationship): CsvRow {
  return {
    csvVersion,
    recordType: 'relationship',
    id: relationship.id,
    firstName: '',
    lastName: '',
    alternateName: '',
    sexAtBirth: '',
    birthDate: '',
    deathDate: '',
    birthPlace: '',
    profession: '',
    residence: '',
    nationality: '',
    biography: '',
    email: '',
    whatsapp: '',
    notes: '',
    sources: '',
    relationshipType: relationship.type,
    from: relationship.from,
    to: relationship.to,
    unionKind: relationship.unionKind ?? '',
    unionStatus: relationship.unionStatus ?? '',
    unionEndReason: relationship.unionEndReason ?? '',
  }
}

export function exportArchiveCsv(archive: FamilyArchive): string {
  validateArchive(archive)
  const records = [
    ...archive.people.map(personRow),
    ...archive.relationships.map(relationshipRow),
  ]
  const lines = [
    headers.join(','),
    ...records.map((record) => headers.map((header) => escapeCsvField(record[header])).join(',')),
  ]
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

function parsePerson(row: CsvRow, existing: Person | undefined): Person {
  const person: Person = existing
    ? { ...existing }
    : { id: row.id.trim(), firstName: '', lastName: '' }

  for (const field of personFields) {
    const value = row[field]
    if (value.trim()) person[field] = value
  }

  const sexAtBirth = row.sexAtBirth.trim()
  if (sexAtBirth) {
    if (!isSexAtBirth(sexAtBirth)) throw new Error(`Sesso alla nascita non valido per la persona ${row.id}.`)
    person.sexAtBirth = sexAtBirth
  }

  return person
}

function parseRelationship(row: CsvRow, existing: Relationship | undefined): Relationship {
  const relationshipType = row.relationshipType.trim()
  if (!relationshipType) throw new Error(`Tipo relazione mancante per la relazione ${row.id}.`)
  if (!['parent-child', 'partner', 'union'].includes(relationshipType)) {
    throw new Error(`Tipo relazione non valido per la relazione ${row.id}.`)
  }

  const type = relationshipType as Relationship['type']
  const relationship: Relationship = existing
    ? { ...existing, type }
    : { id: row.id.trim(), type, from: '', to: '' }
  const from = row.from.trim()
  const to = row.to.trim()
  if (from) relationship.from = from
  if (to) relationship.to = to

  if (type !== 'union') {
    delete relationship.unionKind
    delete relationship.unionStatus
    delete relationship.unionEndReason
    return relationship
  }

  const unionKind = row.unionKind.trim()
  const unionStatus = row.unionStatus.trim()
  const unionEndReason = row.unionEndReason.trim()
  if (unionKind) relationship.unionKind = unionKind as NonNullable<Relationship['unionKind']>
  if (unionStatus) relationship.unionStatus = unionStatus as NonNullable<Relationship['unionStatus']>
  if (unionEndReason) relationship.unionEndReason = unionEndReason as NonNullable<Relationship['unionEndReason']>
  return relationship
}

export function importArchiveCsv(current: FamilyArchive, text: string): CsvImportPreview {
  validateArchive(current)
  const rows = parseCsv(text)
  if (rows.length === 0) throw new Error('Il file CSV è vuoto.')

  const header = rows[0]!.map((value) => value.trim())
  const headerIndexes = new Map<string, number>()
  header.forEach((value, index) => {
    if (!value || headerIndexes.has(value)) throw new Error('Intestazioni CSV mancanti o duplicate.')
    headerIndexes.set(value, index)
  })
  for (const requiredHeader of headers) {
    if (!headerIndexes.has(requiredHeader)) throw new Error(`Colonna CSV mancante: ${requiredHeader}.`)
  }

  const dataRows = rows.slice(1)
  if (dataRows.length === 0) throw new Error('Il file CSV non contiene record.')
  const parsedRows: CsvRow[] = dataRows.map((values, rowIndex) => {
    if (values.length !== header.length) {
      throw new Error(`Numero di colonne errato alla riga ${rowIndex + 2}.`)
    }
    const row = Object.fromEntries(headers.map((field) => [field, values[headerIndexes.get(field)!] ?? ''])) as CsvRow
    if (!supportedCsvVersions.has(row.csvVersion)) {
      throw new Error(`Versione CSV non supportata alla riga ${rowIndex + 2}.`)
    }
    if (row.recordType !== 'person' && row.recordType !== 'relationship') {
      throw new Error(`Tipo record non valido alla riga ${rowIndex + 2}.`)
    }
    if (!row.id.trim()) throw new Error(`ID mancante alla riga ${rowIndex + 2}.`)
    return row
  })

  const personRows = parsedRows.filter((row) => row.recordType === 'person')
  const relationshipRows = parsedRows.filter((row) => row.recordType === 'relationship')
  const personRowIds = new Set<string>()
  const relationshipRowIds = new Set<string>()
  const currentPeople = new Map(current.people.map((person) => [person.id, person]))
  const currentRelationships = new Map(current.relationships.map((relationship) => [relationship.id, relationship]))
  const people = [...current.people]
  const relationships = [...current.relationships]
  const peopleIndex = new Map(people.map((person, index) => [person.id, index]))
  const relationshipsIndex = new Map(relationships.map((relationship, index) => [relationship.id, index]))
  const summary: CsvImportSummary = {
    peopleAdded: 0,
    peopleUpdated: 0,
    relationshipsAdded: 0,
    relationshipsUpdated: 0,
  }

  for (const row of personRows) {
    const id = row.id.trim()
    if (personRowIds.has(id)) throw new Error(`ID persona duplicato nel CSV: ${id}.`)
    personRowIds.add(id)
    const existing = currentPeople.get(id)
    const person = parsePerson(row, existing)
    if (!person.firstName.trim() || !person.lastName.trim()) {
      throw new Error(`Nome e cognome mancanti per la persona ${id}.`)
    }
    const index = peopleIndex.get(id)
    if (index === undefined) {
      peopleIndex.set(id, people.length)
      people.push(person)
      summary.peopleAdded += 1
    } else {
      people[index] = person
      if (JSON.stringify(existing) !== JSON.stringify(person)) summary.peopleUpdated += 1
    }
  }

  for (const row of relationshipRows) {
    const id = row.id.trim()
    if (relationshipRowIds.has(id)) throw new Error(`ID relazione duplicato nel CSV: ${id}.`)
    relationshipRowIds.add(id)
    const existing = currentRelationships.get(id)
    const relationship = parseRelationship(row, existing)
    const index = relationshipsIndex.get(id)
    if (index === undefined) {
      relationshipsIndex.set(id, relationships.length)
      relationships.push(relationship)
      summary.relationshipsAdded += 1
    } else {
      relationships[index] = relationship
      if (JSON.stringify(existing) !== JSON.stringify(relationship)) summary.relationshipsUpdated += 1
    }
  }

  const archive = { ...current, people, relationships }
  validateArchive(archive)
  return { archive, summary }
}
