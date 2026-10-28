import imageConfig from '../image-config.json'
import { decryptImageDataUrl, encryptImageDataUrl, isEncryptedImage } from './crypto'
import { normalizedSquareSize } from './imageCrop'
import {
  clearPersistentImageCache, deleteCachedCiphertext, getCachedCiphertext, putCachedCiphertext,
} from './imageCache'

const memoryCache = new Map<string, { dataUrl: string; bytes: number; lastUsed: number }>()
const processingQueue: Array<{ priority: number; order: number; run: () => void }> = []
let activeJobs = 0
let queueOrder = 0

interface DecodedImage {
  width: number
  height: number
  source: CanvasImageSource
  close: () => void
}

function enqueue<T>(priority: number, work: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    processingQueue.push({
      priority,
      order: queueOrder++,
      run: () => {
        activeJobs += 1
        void work().then(resolve, reject).finally(() => {
          activeJobs -= 1
          startQueuedJobs()
        })
      },
    })
    processingQueue.sort((a, b) => a.priority - b.priority || a.order - b.order)
    startQueuedJobs()
  })
}

function startQueuedJobs(): void {
  while (activeJobs < imageConfig.processing.maxConcurrent && processingQueue.length > 0) {
    processingQueue.shift()!.run()
  }
}

async function cacheKey(personId: string, source: string, size: number): Promise<string> {
  const payload = `${personId}\u0000${source}\u0000${size}\u0000${imageConfig.normalized.format}\u0000${imageConfig.processing.algorithmVersion}`
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload)))
  const hex = [...hash].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `v${imageConfig.processing.algorithmVersion}:${personId}:${hex}:${size}:${imageConfig.normalized.format}`
}

function dataUrlBlob(dataUrl: string): Blob {
  const match = /^data:(image\/(?:jpeg|png|webp|gif|avif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!match) throw new Error('Il contenuto immagine non è valido.')
  const binary = atob(match[2]!)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new Blob([bytes], { type: match[1] })
}

async function loadBitmap(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
    return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() }
  }
  const url = URL.createObjectURL(blob)
  return new Promise<DecodedImage>((resolve, reject) => {
      const image = new Image()
      image.onload = () => {
        resolve({
          width: image.naturalWidth,
          height: image.naturalHeight,
          source: image,
          close: () => URL.revokeObjectURL(url),
        })
      }
      image.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Impossibile decodificare l’immagine.'))
      }
      image.src = url
  })
}

function remember(key: string, dataUrl: string): void {
  const bytes = dataUrlBlob(dataUrl).size
  memoryCache.set(key, { dataUrl, bytes, lastUsed: Date.now() })
  const entries = [...memoryCache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)
  while (entries.length > imageConfig.cache.maxEntries ||
    entries.reduce((total, [, entry]) => total + entry.bytes, 0) > imageConfig.cache.maxBytes) {
    const oldest = entries.shift()
    if (!oldest) break
    memoryCache.delete(oldest[0])
  }
}

export async function getImageVariant(
  personId: string,
  source: string,
  size: number,
  passphrase: string,
  priority = 1,
): Promise<string> {
  return enqueue(priority, async () => {
    if (isEncryptedImage(source) && !passphrase) {
      throw new Error('Aprire nuovamente l’archivio con la passphrase per visualizzare le fotografie.')
    }
    const canUseSourceAtRequestedSize =
      size >= imageConfig.normalized.maxWidth && size >= imageConfig.normalized.maxHeight
    let sourceData: string | undefined
    let bitmap: DecodedImage | undefined
    if (canUseSourceAtRequestedSize) {
      sourceData = isEncryptedImage(source)
        ? await decryptImageDataUrl(source, passphrase)
        : source
      bitmap = await loadBitmap(dataUrlBlob(sourceData))
      if (bitmap.width <= size && bitmap.height <= size) {
        bitmap.close()
        return sourceData
      }
    }

    const key = await cacheKey(personId, source, size)
    const cached = memoryCache.get(key)
    if (cached) {
      cached.lastUsed = Date.now()
      bitmap?.close()
      return cached.dataUrl
    }
    if (passphrase) {
      const encryptedCached = await getCachedCiphertext(key)
      if (encryptedCached) {
        try {
          const cachedData = await decryptImageDataUrl(encryptedCached, passphrase)
          remember(key, cachedData)
          bitmap?.close()
          return cachedData
        } catch {
          await deleteCachedCiphertext(key)
        }
      }
    }

    sourceData ??= isEncryptedImage(source)
      ? await decryptImageDataUrl(source, passphrase)
      : source
    bitmap ??= await loadBitmap(dataUrlBlob(sourceData))
    try {
      const cropSize = Math.min(bitmap.width, bitmap.height)
      const outputSize = normalizedSquareSize(cropSize, size, size)
      const canvas = document.createElement('canvas')
      canvas.width = outputSize
      canvas.height = outputSize
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Questo browser non può ridimensionare l’immagine.')
      context.drawImage(
        bitmap.source,
        (bitmap.width - cropSize) / 2,
        (bitmap.height - cropSize) / 2,
        cropSize,
        cropSize,
        0,
        0,
        outputSize,
        outputSize,
      )
      const variant = canvas.toDataURL(imageConfig.normalized.format, imageConfig.normalized.quality)
      remember(key, variant)
      if (passphrase) {
        const encrypted = await encryptImageDataUrl(variant, passphrase)
        const cachedPersistently = await putCachedCiphertext(key, encrypted, new TextEncoder().encode(encrypted).byteLength)
        if (!cachedPersistently) window.dispatchEvent(new CustomEvent('image-cache-fallback'))
      }
      return variant
    } finally {
      bitmap.close()
    }
  })
}

export function imageDataUrlToBlob(dataUrl: string): Blob {
  return dataUrlBlob(dataUrl)
}

export async function clearImageCache(): Promise<boolean> {
  memoryCache.clear()
  const persistentCleared = await clearPersistentImageCache()
  window.dispatchEvent(new CustomEvent('image-cache-cleared'))
  return persistentCleared
}
