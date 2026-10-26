import { describe, expect, it } from 'vitest'
import { toGedcom } from './gedcom'
import type { FamilyArchive } from './model'

describe('GEDCOM 7 export', () => {
  it('exports people, dates, notes, and family records without inferring partner gender', () => {
    const archive: FamilyArchive = {
      schemaVersion: 1,
      people: [
        { id: 'parent-1', firstName: 'Ada', lastName: 'Lovelace', birthDate: '1815-12-10', birthPlace: 'London' },
        { id: 'parent-2', firstName: 'Charles', lastName: 'Babbage', deathDate: '1871-10' },
        { id: 'child', firstName: 'Ann', lastName: 'Lovelace', birthDate: '1836', biography: 'First line\nSecond line' },
      ],
      relationships: [
        { id: 'partner', type: 'partner', from: 'parent-1', to: 'parent-2' },
        { id: 'parent-1-child', type: 'parent-child', from: 'parent-1', to: 'child' },
        { id: 'parent-2-child', type: 'parent-child', from: 'parent-2', to: 'child' },
      ],
    }

    const gedcom = toGedcom(archive)

    expect(gedcom).toContain('1 GEDC\r\n2 VERS 7.0\r\n2 FORM LINEAGE-LINKED')
    expect(gedcom).toContain('1 NAME Ada /Lovelace/')
    expect(gedcom).toContain('2 DATE 10 DEC 1815')
    expect(gedcom).toContain('2 PLAC London')
    expect(gedcom).toContain('2 DATE OCT 1871')
    expect(gedcom).toContain('2 DATE 1836')
    expect(gedcom).toContain('2 CONT Second line')
    expect(gedcom).toContain('0 @F1@ FAM')
    expect(gedcom).toContain('1 FAMS @F1@')
    expect(gedcom).toContain('1 FAMC @F1@')
    expect(gedcom).toContain('0 @F1@ FAM\r\n1 HUSB @I1@\r\n1 WIFE @I2@\r\n1 CHIL @I3@')
    expect(gedcom).not.toMatch(/\bSEX\b/)
    expect(gedcom).toMatch(/0 TRLR\r\n$/)
  })

  it('maps optional person fields to their GEDCOM structures', () => {
    const archive: FamilyArchive = {
      schemaVersion: 1,
      people: [{
        id: 'person',
        firstName: 'Alex',
        lastName: 'Family',
        alternateName: 'Alexandra Alias',
        sexAtBirth: 'X',
        profession: 'Researcher',
        residence: 'Rome',
        nationality: 'Italian',
      }],
      relationships: [],
    }

    const gedcom = toGedcom(archive)

    expect(gedcom).toContain('1 NAME Alexandra Alias\r\n2 TYPE AKA')
    expect(gedcom).toContain('1 SEX X')
    expect(gedcom).toContain('1 OCCU Researcher')
    expect(gedcom).toContain('1 RESI Rome')
    expect(gedcom).toContain('1 NATI Italian')
  })

  it('represents additional parents with the GEDCOM family association role', () => {
    const archive: FamilyArchive = {
      schemaVersion: 1,
      people: [
        { id: 'parent-1', firstName: 'A', lastName: 'One' },
        { id: 'parent-2', firstName: 'B', lastName: 'Two' },
        { id: 'parent-3', firstName: 'C', lastName: 'Three' },
        { id: 'child', firstName: 'D', lastName: 'Four' },
      ],
      relationships: [
        { id: 'parent-1-child', type: 'parent-child', from: 'parent-1', to: 'child' },
        { id: 'parent-2-child', type: 'parent-child', from: 'parent-2', to: 'child' },
        { id: 'parent-3-child', type: 'parent-child', from: 'parent-3', to: 'child' },
      ],
    }

    const gedcom = toGedcom(archive)

    expect(gedcom).toContain('0 @F1@ FAM\r\n1 HUSB @I1@\r\n1 WIFE @I2@\r\n1 ASSO @I3@\r\n2 ROLE PARENT\r\n1 CHIL @I4@')
    expect(gedcom).toContain('1 FAMC @F1@')
  })

  it('escapes payload delimiters and excludes photos and contact details', () => {
    const archive: FamilyArchive = {
      schemaVersion: 1,
      people: [{
        id: 'person',
        firstName: 'A@da',
        lastName: 'Lovelace',
        notes: 'A note @ value\n\nNext',
        email: 'ada@example.com',
        whatsapp: '+1234567',
        photo: 'data:image/jpeg;base64,private-photo',
      }],
      relationships: [],
    }

    const gedcom = toGedcom(archive)

    expect(gedcom).toContain('1 NAME A@@da /Lovelace/')
    expect(gedcom).toContain('1 NOTE A note @@ value\r\n2 CONT\r\n2 CONT Next')
    expect(gedcom).not.toContain('ada@example.com')
    expect(gedcom).not.toContain('+1234567')
    expect(gedcom).not.toContain('private-photo')
  })
})
