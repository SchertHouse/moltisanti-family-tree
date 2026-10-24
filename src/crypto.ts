import { validateArchive, type FamilyArchive } from './model'
import { normalizeLegacyImage } from './imageProcessing'

export interface EncryptedArchive {
  format: 'moltisanti-encrypted'
  formatVersion: 1
  algorithm: 'AES-256-GCM'
  kdf: 'PBKDF2-SHA-256'
  iterations: number
  salt: string
  iv: string
  ciphertext: string
}

interface EncryptedImage {
  format: 'moltisanti-image'
  version: 1
  mimeType: string
  salt: string
  iv: string
  ciphertext: string
}

const ITERATIONS = 310_000
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function base64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

function unbase64(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function encodeJson(value: unknown): string {
  return base64(encoder.encode(JSON.stringify(value)))
}

function decodeJson<T>(value: string): T {
  return JSON.parse(decoder.decode(unbase64(value))) as T
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  if (!passphrase) throw new Error('Inserire la passphrase di cifratura.')
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function isEncryptedImage(value: string): boolean {
  return /^moltisanti-image:v1:[A-Za-z0-9+/]+={0,2}$/.test(value)
}

export async function encryptImageDataUrl(dataUrl: string, passphrase: string): Promise<string> {
  const match = /^data:(image\/(?:jpeg|png|webp|gif|avif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!match) throw new Error('Formato immagine normalizzata non valido.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const plaintext = unbase64(match[2]!)
  const additionalData = encoder.encode(`moltisanti-image:v1:${match[1]}`)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, key, plaintext)
  const envelope: EncryptedImage = {
    format: 'moltisanti-image',
    version: 1,
    mimeType: match[1]!,
    salt: base64(salt),
    iv: base64(iv),
    ciphertext: base64(new Uint8Array(ciphertext)),
  }
  return `moltisanti-image:v1:${encodeJson(envelope)}`
}

export async function decryptImageDataUrl(value: string, passphrase: string): Promise<string> {
  if (!isEncryptedImage(value)) throw new Error('Formato immagine cifrata non valido.')
  let envelope: EncryptedImage
  try {
    envelope = decodeJson<EncryptedImage>(value.slice('moltisanti-image:v1:'.length))
  } catch {
    throw new Error('Immagine cifrata danneggiata.')
  }
  if (envelope.format !== 'moltisanti-image' || envelope.version !== 1 ||
    !/^image\/(?:jpeg|png|webp|gif|avif)$/.test(envelope.mimeType) ||
    typeof envelope.salt !== 'string' || typeof envelope.iv !== 'string' || typeof envelope.ciphertext !== 'string') {
    throw new Error('Formato immagine cifrata non supportato.')
  }
  const salt = unbase64(envelope.salt)
  const iv = unbase64(envelope.iv)
  const ciphertext = unbase64(envelope.ciphertext)
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length === 0) {
    throw new Error('Immagine cifrata danneggiata.')
  }
  try {
    const key = await deriveKey(passphrase, salt)
    const additionalData = encoder.encode(`moltisanti-image:v1:${envelope.mimeType}`)
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData }, key, ciphertext)
    return `data:${envelope.mimeType};base64,${base64(new Uint8Array(plaintext))}`
  } catch {
    throw new Error('Chiave immagine errata o immagine alterata.')
  }
}

export async function prepareArchivePhotos(
  archive: FamilyArchive,
  passphrase: string,
  sourcePassphrase = passphrase,
): Promise<FamilyArchive> {
  validateArchive(archive)
  if (archive.people.some((person) => person.gallery?.length)) {
    throw new Error('L’archivio contiene gallerie non supportate: conservare una sola fotografia per persona.')
  }
  const prepare = async (value: string | undefined): Promise<string | undefined> => {
    if (!value) return undefined
    if (!isEncryptedImage(value)) return encryptImageDataUrl(await normalizeLegacyImage(value), passphrase)
    const plaintext = await decryptImageDataUrl(value, sourcePassphrase)
    return sourcePassphrase === passphrase ? value : encryptImageDataUrl(plaintext, passphrase)
  }
  const people = []
  for (const person of archive.people) {
    const photo = await prepare(person.photo)
    const gallery: string[] = []
    for (const image of person.gallery ?? []) gallery.push((await prepare(image))!)
    people.push({
      ...person,
      photo,
      ...(person.gallery ? { gallery } : {}),
    })
  }
  const normalized = { ...archive, people }
  validateArchive(normalized)
  return normalized
}

export async function decryptArchivePhotos(
  archive: FamilyArchive,
  passphrase: string,
): Promise<FamilyArchive> {
  validateArchive(archive)
  const decrypt = async (value: string | undefined): Promise<string | undefined> =>
    value && isEncryptedImage(value) ? decryptImageDataUrl(value, passphrase) : value
  const people = []
  for (const person of archive.people) {
    const photo = await decrypt(person.photo)
    const gallery: string[] = []
    for (const image of person.gallery ?? []) gallery.push((await decrypt(image))!)
    people.push({
      ...person,
      photo,
      ...(person.gallery ? { gallery } : {}),
    })
  }
  const plaintext = { ...archive, people }
  validateArchive(plaintext)
  return plaintext
}

export async function encryptArchive(archive: FamilyArchive, passphrase: string): Promise<EncryptedArchive> {
  validateArchive(archive)
  if (passphrase.length < 12) throw new Error('Usare una passphrase di almeno 12 caratteri.')
  const prepared = await prepareArchivePhotos(archive, passphrase)
  return encryptPreparedArchive(prepared, passphrase)
}

export async function encryptPreparedArchive(archive: FamilyArchive, passphrase: string): Promise<EncryptedArchive> {
  validateArchive(archive)
  if (passphrase.length < 12) throw new Error('Usare una passphrase di almeno 12 caratteri.')
  for (const person of archive.people) {
    if (person.gallery?.length) {
      throw new Error('L’archivio contiene gallerie non supportate: conservare una sola fotografia per persona.')
    }
    if (person.photo && !isEncryptedImage(person.photo)) {
      throw new Error('Le immagini devono essere normalizzate e cifrate prima del salvataggio.')
    }
  }
  const plaintext = encoder.encode(JSON.stringify(archive))
  if (plaintext.length > 25 * 1024 * 1024) throw new Error('L’archivio supera il limite di 25 MB.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext,
  )
  return {
    format: 'moltisanti-encrypted',
    formatVersion: 1,
    algorithm: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA-256',
    iterations: ITERATIONS,
    salt: base64(salt),
    iv: base64(iv),
    ciphertext: base64(new Uint8Array(ciphertext)),
  }
}

export async function decryptArchive(value: unknown, passphrase: string): Promise<FamilyArchive> {
  if (!value || typeof value !== 'object') throw new Error('Formato archivio cifrato non valido.')
  const envelope = value as Partial<EncryptedArchive>
  if (
    envelope.format !== 'moltisanti-encrypted' || envelope.formatVersion !== 1 ||
    envelope.algorithm !== 'AES-256-GCM' || envelope.kdf !== 'PBKDF2-SHA-256' ||
    envelope.iterations !== ITERATIONS || typeof envelope.salt !== 'string' ||
    typeof envelope.iv !== 'string' || typeof envelope.ciphertext !== 'string'
  ) throw new Error('Formato o parametri dell’archivio cifrato non supportati.')
  const salt = unbase64(envelope.salt)
  const iv = unbase64(envelope.iv)
  const ciphertext = unbase64(envelope.ciphertext)
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16 || ciphertext.length > 25 * 1024 * 1024) {
    throw new Error('Archivio cifrato danneggiato o troppo grande.')
  }
  let plaintext: ArrayBuffer
  try {
    const key = await deriveKey(passphrase, salt)
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  } catch {
    throw new Error('Passphrase errata o archivio alterato.')
  }
  let archive: unknown
  try {
    archive = JSON.parse(decoder.decode(plaintext))
  } catch {
    throw new Error('Archivio cifrato non contiene dati JSON validi.')
  }
  validateArchive(archive)
  return archive
}
