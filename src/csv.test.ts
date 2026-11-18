import { describe, expect, it } from 'vitest'
import { emptyArchive } from './model'
import { exportArchiveCsv, importArchiveCsv } from './csv'

describe('CSV archive exchange', () => {
  it('round-trips stable person and relationship IDs without profile photos', () => {
    const archive = {
      ...emptyArchive(),
      people: [
        {
          id: 'person-1',
          firstName: 'Ada',
          lastName: 'Lovelace',
          biography: 'First line,\nsecond "quoted" line',
          email: 'ada@example.test',
          photo: 'moltisanti-image:v1:cGhvdG8=',
        },
        { id: 'person-2', firstName: 'Charles', lastName: 'Babbage' },
      ],
      relationships: [
        { id: 'relation-1', type: 'parent-child' as const, from: 'person-1', to: 'person-2' },
      ],
    }

    const csv = exportArchiveCsv(archive)
    const imported = importArchiveCsv(emptyArchive(), csv)

    const [headerLine, personLine] = csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n')
    expect(headerLine!.split(',')).not.toContain('photoBase64')
    expect(headerLine!.split(',')).not.toContain('photoMimeType')
    expect(personLine!.split(',')[0]).toBe('2')
    expect(imported.archive).toEqual({
      ...archive,
      people: [
        {
          id: 'person-1',
          firstName: 'Ada',
          lastName: 'Lovelace',
          biography: 'First line,\nsecond "quoted" line',
          email: 'ada@example.test',
        },
        { id: 'person-2', firstName: 'Charles', lastName: 'Babbage' },
      ],
    })
    expect(imported.summary).toEqual({
      peopleAdded: 2,
      peopleUpdated: 0,
      relationshipsAdded: 1,
      relationshipsUpdated: 0,
    })
  })

  it('merges by ID, preserves blank cells and records absent from the CSV', () => {
    const current = {
      ...emptyArchive(),
      people: [
        { id: 'person-1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test' },
        { id: 'person-2', firstName: 'Grace', lastName: 'Hopper' },
      ],
      relationships: [
        { id: 'relation-1', type: 'partner' as const, from: 'person-1', to: 'person-2' },
      ],
    }
    const incoming = {
      ...emptyArchive(),
      people: [
        { id: 'person-1', firstName: 'Augusta Ada', lastName: 'Lovelace', email: '' },
        { id: 'person-3', firstName: 'Charles', lastName: 'Babbage' },
      ],
      relationships: [
        { id: 'relation-2', type: 'parent-child' as const, from: 'person-1', to: 'person-3' },
      ],
    }

    const imported = importArchiveCsv(current, exportArchiveCsv(incoming))

    expect(imported.archive.people).toEqual([
      { id: 'person-1', firstName: 'Augusta Ada', lastName: 'Lovelace', email: 'ada@example.test' },
      { id: 'person-2', firstName: 'Grace', lastName: 'Hopper' },
      { id: 'person-3', firstName: 'Charles', lastName: 'Babbage' },
    ])
    expect(imported.archive.relationships).toEqual([
      { id: 'relation-1', type: 'partner', from: 'person-1', to: 'person-2' },
      { id: 'relation-2', type: 'parent-child', from: 'person-1', to: 'person-3' },
    ])
    expect(imported.summary).toEqual({
      peopleAdded: 1,
      peopleUpdated: 1,
      relationshipsAdded: 1,
      relationshipsUpdated: 0,
    })
  })

  it('ignores legacy photo columns and preserves the existing profile photo', () => {
    const photo = 'data:image/jpeg;base64,cGhvdG8='
    const current = {
      ...emptyArchive(),
      people: [{ id: 'person-1', firstName: 'Ada', lastName: 'Lovelace', photo }],
    }
    const [headerLine, personLine] = exportArchiveCsv(current)
      .replace(/^\uFEFF/, '')
      .trimEnd()
      .split('\r\n')
    const header = headerLine!.split(',')
    const values = personLine!.split(',')
    const photoColumnIndex = header.indexOf('whatsapp') + 1
    header.splice(photoColumnIndex, 0, 'photoMimeType', 'photoBase64')
    values.splice(photoColumnIndex, 0, 'image/jpeg', 'bmV3LWltYWdl')
    values[header.indexOf('csvVersion')] = '1'

    const legacyCsv = [header.join(','), values.join(',')].join('\r\n')
    const imported = importArchiveCsv(current, legacyCsv)

    expect(imported.archive.people[0]!.photo).toBe(photo)
    expect(imported.summary.peopleUpdated).toBe(0)
  })

  it('rejects duplicate IDs and orphan relationships', () => {
    const person = { id: 'person-1', firstName: 'Ada', lastName: 'Lovelace' }
    const duplicateIds = exportArchiveCsv({
      ...emptyArchive(),
      people: [person, { id: 'person-2', firstName: 'Grace', lastName: 'Hopper' }],
    }).replace('person-2', 'person-1')
    expect(() => importArchiveCsv(emptyArchive(), duplicateIds)).toThrow(/ID persona duplicato/)

    const orphanRelationship = exportArchiveCsv({
      ...emptyArchive(),
      people: [person, { id: 'person-2', firstName: 'Grace', lastName: 'Hopper' }],
      relationships: [{ id: 'relation-1', type: 'parent-child', from: 'person-1', to: 'person-2' }],
    }).replace(',parent-child,person-1,person-2,,,', ',parent-child,person-1,missing,,,')
    expect(() => importArchiveCsv(emptyArchive(), orphanRelationship)).toThrow(/persone inesistenti/)
  })
})
