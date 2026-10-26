import { zipSync } from 'fflate'
import { decryptImageDataUrl, isEncryptedImage } from './crypto'
import type { FamilyArchive } from './model'
import { toGedcom, type GedcomMediaReference } from './gedcom'

const encoder = new TextEncoder()

function dataUrlBytes(dataUrl: string): { mimeType: string; bytes: Uint8Array; extension: string } {
  const match = /^data:(image\/(?:jpeg|png|webp|gif|avif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!match) throw new Error('Formato immagine non supportato per l’export GEDZIP.')
  const mimeType = match[1]!
  const binary = atob(match[2]!)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.slice('image/'.length)
  return { mimeType, bytes, extension }
}

export async function createGedzip(archive: FamilyArchive, passphrase: string): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {}
  const mediaByPerson = new Map<string, GedcomMediaReference[]>()
  let mediaIndex = 0

  for (const person of archive.people) {
    const mediaReferences: GedcomMediaReference[] = []
    for (const image of [person.photo, ...(person.gallery ?? [])]) {
      if (!image) continue
      if (isEncryptedImage(image) && !passphrase) {
        throw new Error('Inserire la passphrase dell’archivio per esportare le fotografie protette.')
      }
      const plaintext = isEncryptedImage(image) ? await decryptImageDataUrl(image, passphrase) : image
      const { mimeType, bytes, extension } = dataUrlBytes(plaintext)
      mediaIndex += 1
      const path = `media/photo-${mediaIndex}.${extension}`
      const reference = `@O${mediaIndex}@`
      files[path] = bytes
      mediaReferences.push({ ref: reference, path, mimeType })
    }
    if (mediaReferences.length > 0) mediaByPerson.set(person.id, mediaReferences)
  }

  files['gedcom.ged'] = encoder.encode(`\uFEFF${toGedcom(archive, mediaByPerson)}`)
  return zipSync(files)
}
