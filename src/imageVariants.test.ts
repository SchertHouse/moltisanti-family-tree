import { afterEach, describe, expect, it, vi } from 'vitest'
import imageConfig from '../image-config.json'
import { decryptImageDataUrl, encryptImageDataUrl } from './crypto'

const cacheMocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  remove: vi.fn(),
  clear: vi.fn(),
}))

vi.mock('./imageCache', () => ({
  getCachedCiphertext: cacheMocks.get,
  putCachedCiphertext: cacheMocks.put,
  deleteCachedCiphertext: cacheMocks.remove,
  clearPersistentImageCache: cacheMocks.clear,
}))

import { getImageVariant } from './imageVariants'

describe('on-demand image variants', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    cacheMocks.get.mockReset().mockResolvedValue(null)
    cacheMocks.put.mockReset().mockResolvedValue(true)
    cacheMocks.remove.mockReset()
  })

  it('generates a bounded variant once and encrypts the persistent cache value', async () => {
    const passphrase = 'image cache passphrase'
    const source = await encryptImageDataUrl('data:image/jpeg;base64,cGhvdG8=', passphrase)
    const output = 'data:image/jpeg;base64,dmFyaWFudA=='
    const size = imageConfig.variants.tree
    const sourceSize = size * 2
    const bitmap = { width: sourceSize, height: sourceSize, close: vi.fn() }
    const createBitmap = vi.fn().mockResolvedValue(bitmap)
    vi.stubGlobal('createImageBitmap', createBitmap)
    const context = { drawImage: vi.fn() }
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => context })
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(output)

    await expect(getImageVariant('person-1', source, size, passphrase)).resolves.toBe(output)
    await expect(getImageVariant('person-1', source, size, passphrase)).resolves.toBe(output)

    expect(createBitmap).toHaveBeenCalledTimes(1)
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, sourceSize, sourceSize, 0, 0, size, size)
    expect(bitmap.close).toHaveBeenCalledTimes(1)
    expect(cacheMocks.put).toHaveBeenCalledOnce()
    const cachedCiphertext = cacheMocks.put.mock.calls[0]![1] as string
    await expect(decryptImageDataUrl(cachedCiphertext, passphrase)).resolves.toBe(output)
  })

  it('reuses an encrypted persistent variant only with the valid key', async () => {
    const passphrase = 'image cache passphrase'
    const source = await encryptImageDataUrl('data:image/jpeg;base64,cGhvdG8=', passphrase)
    const cached = await encryptImageDataUrl('data:image/jpeg;base64,dmFyaWFudA==', passphrase)
    const size = imageConfig.variants.tree
    cacheMocks.get.mockResolvedValue(cached)
    const createBitmap = vi.fn()
    vi.stubGlobal('createImageBitmap', createBitmap)

    await expect(getImageVariant('person-2', source, size, passphrase))
      .resolves.toBe('data:image/jpeg;base64,dmFyaWFudA==')
    expect(createBitmap).not.toHaveBeenCalled()
  })

  it('uses the decrypted source directly when it fits the configured profile variant', async () => {
    const passphrase = 'image cache passphrase'
    const sourceDataUrl = 'data:image/jpeg;base64,cGhvdG8='
    const source = await encryptImageDataUrl(sourceDataUrl, passphrase)
    const size = imageConfig.variants.profile
    const bitmap = { width: size, height: size, close: vi.fn() }
    const createBitmap = vi.fn().mockResolvedValue(bitmap)
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    vi.stubGlobal('createImageBitmap', createBitmap)

    await expect(getImageVariant(
      'person-profile', source, size, passphrase,
    )).resolves.toBe(sourceDataUrl)

    expect(createBitmap).toHaveBeenCalledOnce()
    expect(bitmap.close).toHaveBeenCalledOnce()
    expect(cacheMocks.get).toHaveBeenCalledOnce()
    expect(cacheMocks.put).not.toHaveBeenCalled()
    expect(getContext).not.toHaveBeenCalled()
  })

  it('uses a new cache identity when the source image changes', async () => {
    const passphrase = 'image cache passphrase'
    const size = imageConfig.variants.tree
    const first = await encryptImageDataUrl('data:image/jpeg;base64,cGhvdG8=', passphrase)
    const replacement = await encryptImageDataUrl('data:image/jpeg;base64,bmV3cGhvdG8=', passphrase)
    const bitmap = { width: size * 2, height: size * 2, close: vi.fn() }
    const createBitmap = vi.fn().mockResolvedValue(bitmap)
    vi.stubGlobal('createImageBitmap', createBitmap)
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true, value: () => ({ drawImage: vi.fn() }),
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValueOnce('data:image/jpeg;base64,Zmlyc3Q=')
      .mockReturnValueOnce('data:image/jpeg;base64,c2Vjb25k')

    await getImageVariant('person-4', first, size, passphrase)
    await getImageVariant('person-4', replacement, size, passphrase)

    expect(createBitmap).toHaveBeenCalledTimes(2)
  })

  it('keeps legacy image proportions by cropping to a centered square', async () => {
    const size = imageConfig.variants.tree
    const bitmap = { width: size * 5, height: size * 3, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    const context = { drawImage: vi.fn() }
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true, value: () => context,
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,dmFyaWFudA==')

    await getImageVariant('person-7', 'data:image/jpeg;base64,cGhvdG8=', size, '')

    expect(context.drawImage).toHaveBeenCalledWith(
      bitmap, size, 0, size * 3, size * 3, 0, 0, size, size,
    )
  })

  it('falls back to an HTML image when createImageBitmap rejects on a browser', async () => {
    const size = imageConfig.variants.tree
    const bitmapError = new TypeError('Unsupported image options')
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(bitmapError))
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image-fallback')

    class ImageFallback {
      naturalWidth = size * 2
      naturalHeight = size * 2
      onload: (() => void) | null = null
      onerror: (() => void) | null = null

      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }
    vi.stubGlobal('Image', ImageFallback)

    const context = { drawImage: vi.fn() }
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true, value: () => context,
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,dmFyaWFudA==')

    await expect(getImageVariant(
      'person-image-fallback', 'data:image/jpeg;base64,cGhvdG8=', size, '',
    )).resolves.toBe('data:image/jpeg;base64,dmFyaWFudA==')

    expect(context.drawImage).toHaveBeenCalledWith(
      expect.any(ImageFallback), 0, 0, size * 2, size * 2, 0, 0, size, size,
    )
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:image-fallback')
  })

  it('reports both decoder failures when the HTML image fallback also fails', async () => {
    const size = imageConfig.variants.tree
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new TypeError('Unsupported image options')))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image-fallback-failure')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    class FailedImageFallback {
      naturalWidth = 0
      naturalHeight = 0
      onload: (() => void) | null = null
      onerror: (() => void) | null = null

      set src(_value: string) {
        queueMicrotask(() => this.onerror?.())
      }
    }
    vi.stubGlobal('Image', FailedImageFallback)

    await expect(getImageVariant(
      'person-image-fallback-failure', 'data:image/jpeg;base64,cGhvdG8=', size, '',
    )).rejects.toThrow('Decodifica bitmap: TypeError: Unsupported image options')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:image-fallback-failure')
  })

  it('does not reveal encrypted sources without a key and reports decryption failures', async () => {
    const passphrase = 'image cache passphrase'
    const size = imageConfig.variants.tree
    const source = await encryptImageDataUrl('data:image/jpeg;base64,cGhvdG8=', passphrase)
    cacheMocks.get.mockResolvedValue(await encryptImageDataUrl('data:image/jpeg;base64,dmFyaWFudA==', passphrase))
    await expect(getImageVariant('person-3', source, size, '')).rejects.toThrow(/passphrase/)
    await expect(getImageVariant('person-3', source, size, 'incorrect passphrase')).rejects.toThrow(/Chiave immagine/)
    expect(cacheMocks.remove).toHaveBeenCalled()
  })

  it('does not persist generated variants when the user has no encryption key', async () => {
    const size = imageConfig.variants.tree
    const bitmap = { width: size * 2, height: size * 2, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true, value: () => ({ drawImage: vi.fn() }),
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,dmFyaWFudA==')

    await getImageVariant('person-5', 'data:image/jpeg;base64,cGhvdG8=', size, '')

    expect(cacheMocks.put).not.toHaveBeenCalled()
  })

  it('announces when persistent storage falls back to the volatile cache', async () => {
    const passphrase = 'image cache passphrase'
    const size = imageConfig.variants.tree
    const source = await encryptImageDataUrl('data:image/jpeg;base64,cGhvdG8=', passphrase)
    const bitmap = { width: size * 2, height: size * 2, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true, value: () => ({ drawImage: vi.fn() }),
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,dmFyaWFudA==')
    const onFallback = vi.fn()
    window.addEventListener('image-cache-fallback', onFallback)
    cacheMocks.put.mockResolvedValue(false)

    await getImageVariant('person-6', source, size, passphrase)

    expect(onFallback).toHaveBeenCalledOnce()
    window.removeEventListener('image-cache-fallback', onFallback)
  })
})
