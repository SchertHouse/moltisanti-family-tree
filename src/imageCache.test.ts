import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import imageConfig from '../image-config.json'
import { clearPersistentImageCache, getCachedCiphertext, putCachedCiphertext, selectLruEvictions } from './imageCache'

describe('persistent image cache availability', () => {
  beforeEach(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(imageConfig.cache.databaseName)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('Cache database is blocked'))
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('falls back cleanly when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    await expect(getCachedCiphertext('cache-key')).resolves.toBeNull()
    await expect(putCachedCiphertext('cache-key', 'ciphertext', 10)).resolves.toBe(false)
    await expect(putCachedCiphertext('cache-key', 'oversized', imageConfig.cache.maxBytes + 1)).resolves.toBe(false)
    await expect(clearPersistentImageCache()).resolves.toBe(false)
  })

  it('evicts the least-recently-used entry when limits are reached', () => {
    const entries = Array.from({ length: imageConfig.cache.maxEntries }, (_, index) => ({
      key: `image-${index}`,
      bytes: 100,
      lastUsed: index,
    }))
    expect(selectLruEvictions(entries, 'new-image', 100)).toEqual(['image-0'])
    expect(selectLruEvictions(entries.slice(0, 3), 'new-image', 100, 2)).toEqual(['image-0', 'image-1'])
  })

  it('persists ciphertext entries and updates their access time', async () => {
    const encrypted = 'moltisanti-image:v1:encryptedvalue'
    await expect(putCachedCiphertext('person:source:128', encrypted, encrypted.length)).resolves.toBe(true)
    await expect(getCachedCiphertext('person:source:128')).resolves.toBe(encrypted)
    await expect(putCachedCiphertext('plaintext', 'data:image/jpeg;base64,YWJj', 30)).resolves.toBe(false)
  })

  it('retries a quota failure after evicting least-recently-used entries', async () => {
    await putCachedCiphertext('old-entry', 'moltisanti-image:v1:oldciphertext', 30)
    const originalPut = IDBObjectStore.prototype.put
    let failFirstWrite = true
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['put']>
    ) {
      if (failFirstWrite) {
        failFirstWrite = false
        throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
      }
      return originalPut.apply(this, args)
    })

    await expect(putCachedCiphertext('new-entry', 'moltisanti-image:v1:newciphertext', 32)).resolves.toBe(true)
    await expect(getCachedCiphertext('old-entry')).resolves.toBeNull()
    await expect(getCachedCiphertext('new-entry')).resolves.toBe('moltisanti-image:v1:newciphertext')
  })
})
