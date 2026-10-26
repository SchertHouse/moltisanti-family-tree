import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { encryptImageDataUrl } from './crypto'
import { createGedzip } from './gedzip'
import type { FamilyArchive } from './model'

describe('GEDZIP export', () => {
  it('includes primary photos and galleries and links them from GEDCOM', async () => {
    const passphrase = 'family photos passphrase'
    const encryptedPhoto = await encryptImageDataUrl('data:image/jpeg;base64,cGhvdG8=', passphrase)
    const archive: FamilyArchive = {
      schemaVersion: 1,
      people: [{
        id: 'person',
        firstName: 'Ada',
        lastName: 'Lovelace',
        photo: encryptedPhoto,
        gallery: ['data:image/png;base64,Z2FsbGVyeQ=='],
      }],
      relationships: [],
    }

    const zip = unzipSync(await createGedzip(archive, passphrase))
    const gedcom = new TextDecoder().decode(zip['gedcom.ged'])

    expect(Object.keys(zip).sort()).toEqual(['gedcom.ged', 'media/photo-1.jpg', 'media/photo-2.png'])
    expect(new TextDecoder().decode(zip['media/photo-1.jpg'])).toBe('photo')
    expect(new TextDecoder().decode(zip['media/photo-2.png'])).toBe('gallery')
    expect(gedcom).toContain('1 OBJE @O1@')
    expect(gedcom).toContain('1 OBJE @O2@')
    expect(gedcom).toContain('0 @O1@ OBJE\r\n1 FILE media/photo-1.jpg\r\n2 FORM image/jpeg')
    expect(gedcom).toContain('0 @O2@ OBJE\r\n1 FILE media/photo-2.png\r\n2 FORM image/png')
    expect([...zip['gedcom.ged']!.slice(0, 3)]).toEqual([0xEF, 0xBB, 0xBF])
  })

  it('requires the passphrase for encrypted images and fails rather than omitting them', async () => {
    const encryptedPhoto = await encryptImageDataUrl('data:image/jpeg;base64,cGhvdG8=', 'family passphrase')
    const archive: FamilyArchive = {
      schemaVersion: 1,
      people: [{ id: 'person', firstName: 'Ada', lastName: 'Lovelace', photo: encryptedPhoto }],
      relationships: [],
    }

    await expect(createGedzip(archive, '')).rejects.toThrow(/passphrase/)
  })

  it('preserves union details in the GEDCOM file inside the package', async () => {
    const archive: FamilyArchive = {
      schemaVersion: 1,
      people: [
        { id: 'person-a', firstName: 'Ada', lastName: 'Family' },
        { id: 'person-b', firstName: 'Bea', lastName: 'Family' },
      ],
      relationships: [{
        id: 'union',
        type: 'union',
        from: 'person-a',
        to: 'person-b',
        unionKind: 'partnership',
        unionStatus: 'ended',
        unionEndReason: 'separation',
      }],
    }

    const zip = unzipSync(await createGedzip(archive, ''))
    const gedcom = new TextDecoder().decode(zip['gedcom.ged'])

    expect(gedcom).toContain('2 VERS 7.0')
    expect(gedcom).toContain('2 TYPE PARTNERSHIP\r\n1 _UNION\r\n2 _TYPE PARTNERSHIP\r\n2 _STATUS ENDED\r\n2 _ENDREASON SEPARATION')
  })
})
