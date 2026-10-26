import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  decryptArchive, decryptArchivePhotos, decryptImageDataUrl, encryptArchive, encryptImageDataUrl, isEncryptedImage,
} from './crypto'
import { emptyArchive } from './model'

describe('encrypted archive', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('round-trips with the correct key and rejects wrong keys and tampering', async () => {
    const encrypted = await encryptArchive(emptyArchive(), 'family secret')
    const secondEncryption = await encryptArchive(emptyArchive(), 'family secret')
    expect(secondEncryption.iv).not.toBe(encrypted.iv)
    expect(secondEncryption.salt).not.toBe(encrypted.salt)
    expect(await decryptArchive(encrypted, 'family secret')).toEqual(emptyArchive())
    await expect(encryptArchive(emptyArchive(), 'weak')).rejects.toThrow(/12 caratteri/)
    await expect(decryptArchive(encrypted, 'wrong')).rejects.toThrow(/errata o archivio alterato/)
    await expect(decryptArchive({ ...encrypted, ciphertext: `${encrypted.ciphertext.slice(0, -4)}AAAA` }, 'family secret'))
      .rejects.toThrow()
  }, 30_000)

  it('encrypts normalized photos individually and validates them on retrieval', async () => {
    const passphrase = 'family secret'
    const image = 'data:image/jpeg;base64,cGhvdG8='
    const encryptedImage = await encryptImageDataUrl(image, passphrase)
    expect(isEncryptedImage(encryptedImage)).toBe(true)
    expect(encryptedImage).not.toContain('cGhvdG8=')
    await expect(decryptImageDataUrl(encryptedImage, passphrase)).resolves.toBe(image)
    await expect(decryptImageDataUrl(encryptedImage, 'incorrect password')).rejects.toThrow(/Chiave immagine/)

    const archive = emptyArchive()
    archive.people.push({ id: 'person-1', firstName: 'Ada', lastName: 'Lovelace', photo: image })
    const bitmap = { width: 200, height: 200, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => ({ fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }),
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,bm9ybWFsaXplZA==')
    const envelope = await encryptArchive(archive, passphrase)
    const restored = await decryptArchive(envelope, passphrase)
    expect(restored.people[0]?.photo).toMatch(/^moltisanti-image:v1:/)
    await expect(decryptImageDataUrl(restored.people[0]!.photo!, passphrase))
      .resolves.toBe('data:image/jpeg;base64,bm9ybWFsaXplZA==')
    await expect(decryptArchivePhotos(restored, passphrase)).resolves.toMatchObject({
      people: [{ photo: 'data:image/jpeg;base64,bm9ybWFsaXplZA==' }],
    })
    expect(bitmap.close).toHaveBeenCalled()
  }, 30_000)

  it('refuses extra gallery images rather than silently publishing multiple photos', async () => {
    const archive = emptyArchive()
    archive.people.push({
      id: 'person-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      gallery: ['data:image/jpeg;base64,cGhvdG8='],
    })

    await expect(encryptArchive(archive, 'family secret'))
      .rejects.toThrow(/una sola fotografia per persona/)
  })
})
