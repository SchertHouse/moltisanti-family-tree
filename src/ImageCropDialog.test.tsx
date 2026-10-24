import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ImageCropDialog from './ImageCropDialog'
import { translate, type Language } from './i18n'

const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) =>
  translate('en' as Language, key, values)

describe('square image crop dialog', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('previews a local image and applies a square crop as a stripped JPEG', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local-photo')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
      unobserve() {}
    })
    const bitmap = { width: 400, height: 200, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    vi.spyOn(HTMLImageElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100,
      toJSON: () => ({}),
    })
    Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => 400 })
    Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', { configurable: true, get: () => 200 })
    const context = {
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    }
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => context,
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,cropped')
    const onComplete = vi.fn()
    const onCancel = vi.fn()

    render(<ImageCropDialog
      file={new File(['local image'], 'photo.png', { type: 'image/png' })}
      t={t}
      onCancel={onCancel}
      onComplete={onComplete}
    />)

    fireEvent.load(screen.getByRole('img', { name: 'Photo crop preview' }))
    expect(screen.getByRole('group', { name: 'Square crop selection' })).toBeInTheDocument()
    expect(screen.getByText('Final image: about 160 × 160 pixels')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Apply crop' }))

    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(File), { imageOrientation: 'from-image' })
    await waitFor(() => expect(context.drawImage).toHaveBeenCalledWith(bitmap, 120, 20, 160, 160, 0, 0, 160, 160))
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('data:image/jpeg;base64,cropped'))
    expect(bitmap.close).toHaveBeenCalled()
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.9)
    expect(onCancel).not.toHaveBeenCalled()
  })
})
