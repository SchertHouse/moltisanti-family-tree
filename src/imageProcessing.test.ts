import { afterEach, describe, expect, it, vi } from 'vitest'
import imageConfig from '../image-config.json'
import { normalizeLegacyImage } from './imageProcessing'

describe('legacy image normalization', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('center-crops to a square, applies EXIF orientation and caps the output', async () => {
    const bitmap = { width: 2400, height: 1600, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => context,
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,bm9ybWFsaXplZA==')

    const result = await normalizeLegacyImage('data:image/png;base64,cGhvdG8=')

    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), { imageOrientation: 'from-image' })
    expect(context.drawImage).toHaveBeenCalledWith(
      bitmap, 400, 0, 1600, 1600, 0, 0,
      imageConfig.normalized.maxWidth, imageConfig.normalized.maxHeight,
    )
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.9)
    expect(result).toBe('data:image/jpeg;base64,bm9ybWFsaXplZA==')
    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it('does not enlarge images smaller than the configured maximum', async () => {
    const bitmap = { width: 640, height: 300, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => context,
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,c21hbGw=')

    await normalizeLegacyImage('data:image/jpeg;base64,cGhvdG8=')

    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 170, 0, 300, 300, 0, 0, 300, 300)
  })
})
