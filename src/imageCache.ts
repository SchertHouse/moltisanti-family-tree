import imageConfig from '../image-config.json'
import { isEncryptedImage } from './crypto'

interface CacheEntry {
  key: string
  encryptedValue: string
  bytes: number
  lastUsed: number
}

export function selectLruEvictions(
  entries: readonly Pick<CacheEntry, 'key' | 'bytes' | 'lastUsed'>[],
  incomingKey: string,
  incomingBytes: number,
  removeCount = 0,
): string[] {
  const existing = entries.find((entry) => entry.key === incomingKey)
  let count = entries.length - (existing ? 1 : 0)
  let bytes = entries.reduce((total, entry) => total + (entry.key === incomingKey ? 0 : entry.bytes), 0)
  const candidates = entries.filter((entry) => entry.key !== incomingKey).sort((a, b) => a.lastUsed - b.lastUsed)
  const removed: string[] = []
  while (candidates.length > 0 && (count >= imageConfig.cache.maxEntries ||
    bytes + incomingBytes > imageConfig.cache.maxBytes || removed.length < removeCount)) {
    const oldest = candidates.shift()!
    removed.push(oldest.key)
    count -= 1
    bytes -= oldest.bytes
  }
  return removed
}

function openCache(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB unavailable'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(imageConfig.cache.databaseName, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(imageConfig.cache.storeName)) {
        database.createObjectStore(imageConfig.cache.storeName, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Cannot open image cache'))
    request.onblocked = () => reject(new Error('Image cache upgrade is blocked'))
  })
}

function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Image cache transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Image cache transaction aborted'))
  })
}

export async function getCachedCiphertext(key: string): Promise<string | null> {
  let database: IDBDatabase | undefined
  try {
    database = await openCache()
    const transaction = database.transaction(imageConfig.cache.storeName, 'readwrite')
    const transactionDone = complete(transaction)
    const store = transaction.objectStore(imageConfig.cache.storeName)
    const entry = await new Promise<CacheEntry | undefined>((resolve, reject) => {
      const request = store.get(key)
      request.onsuccess = () => {
        const result = request.result as CacheEntry | undefined
        if (result) store.put({ ...result, lastUsed: Date.now() })
        resolve(result)
      }
      request.onerror = () => reject(request.error ?? new Error('Image cache read failed'))
    })
    await transactionDone
    return entry?.encryptedValue ?? null
  } catch {
    return null
  } finally {
    database?.close()
  }
}

async function writeEntry(entry: CacheEntry, removeCount = 0): Promise<void> {
  const database = await openCache()
  try {
    const transaction = database.transaction(imageConfig.cache.storeName, 'readwrite')
    const transactionDone = complete(transaction)
    const store = transaction.objectStore(imageConfig.cache.storeName)
    const request = store.getAll()
    request.onsuccess = () => {
      const entries = request.result as CacheEntry[]
      for (const key of selectLruEvictions(entries, entry.key, entry.bytes, removeCount)) store.delete(key)
      store.put(entry)
    }
    request.onerror = () => transaction.abort()
    await transactionDone
  } finally {
    database.close()
  }
}

export async function putCachedCiphertext(key: string, encryptedValue: string, bytes: number): Promise<boolean> {
  if (!isEncryptedImage(encryptedValue) || bytes > imageConfig.cache.maxBytes) return false
  const entry = { key, encryptedValue, bytes, lastUsed: Date.now() }
  try {
    await writeEntry(entry)
    return true
  } catch {
    try {
      await writeEntry(entry, Math.max(1, Math.ceil(imageConfig.cache.maxEntries / 4)))
      return true
    } catch {
      return false
    }
  }
}

export async function deleteCachedCiphertext(key: string): Promise<void> {
  let database: IDBDatabase | undefined
  try {
    database = await openCache()
    const transaction = database.transaction(imageConfig.cache.storeName, 'readwrite')
    const transactionDone = complete(transaction)
    transaction.objectStore(imageConfig.cache.storeName).delete(key)
    await transactionDone
  } catch {
    // Cache errors must not prevent loading the source image.
  } finally {
    database?.close()
  }
}

export async function clearPersistentImageCache(): Promise<boolean> {
  let database: IDBDatabase | undefined
  try {
    database = await openCache()
    const transaction = database.transaction(imageConfig.cache.storeName, 'readwrite')
    const transactionDone = complete(transaction)
    transaction.objectStore(imageConfig.cache.storeName).clear()
    await transactionDone
    return true
  } catch {
    return false
  } finally {
    database?.close()
  }
}
