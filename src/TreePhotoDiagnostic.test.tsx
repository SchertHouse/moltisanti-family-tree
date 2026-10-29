import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import imageConfig from '../image-config.json'

const imageMocks = vi.hoisted(() => ({
  getImageVariant: vi.fn(),
  imageDataUrlToBlob: vi.fn(),
}))

vi.mock('./imageVariants', () => ({
  getImageVariant: imageMocks.getImageVariant,
  imageDataUrlToBlob: imageMocks.imageDataUrlToBlob,
}))

import TreePhotoDiagnostic from './TreePhotoDiagnostic'

describe('temporary tree photo diagnostic', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    imageMocks.getImageVariant.mockReset()
    imageMocks.imageDataUrlToBlob.mockReset()
  })

  it('uses one tree variant and one shared URL for all three renderers', async () => {
    imageMocks.getImageVariant.mockResolvedValue('data:image/jpeg;base64,dGVzdA==')
    imageMocks.imageDataUrlToBlob.mockReturnValue(new Blob(['test'], { type: 'image/jpeg' }))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:shared-photo-test')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const { container, unmount } = render(<TreePhotoDiagnostic
      personId="person-1"
      source="moltisanti-image:v1:encrypted"
      passphrase="test passphrase"
      language="en"
    />)

    await waitFor(() => expect(imageMocks.getImageVariant).toHaveBeenCalledOnce())
    expect(imageMocks.getImageVariant).toHaveBeenCalledWith(
      'person-1', 'moltisanti-image:v1:encrypted', imageConfig.variants.tree, 'test passphrase', 1,
    )
    expect(URL.createObjectURL).toHaveBeenCalledOnce()

    await waitFor(() => {
      expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:shared-photo-test')
      expect([...container.querySelectorAll('svg image')].map((image) => image.getAttribute('href')))
        .toEqual(['blob:shared-photo-test', 'blob:shared-photo-test'])
    })

    const htmlImage = container.querySelector('img')
    const svgImages = container.querySelectorAll('svg image')
    const [unclippedImage, clippedImage] = [...svgImages]
    if (!htmlImage || !unclippedImage || !clippedImage) throw new Error('All three photo samples should render.')
    await act(async () => {
      fireEvent.load(htmlImage)
      fireEvent.load(unclippedImage)
      fireEvent.load(clippedImage)
    })
    expect(container.querySelectorAll('small')).toHaveLength(3)
    expect([...container.querySelectorAll('small')].map((status) => status.textContent))
      .toEqual(['Loaded', 'Loaded', 'Loaded'])

    unmount()
    expect(revokeObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:shared-photo-test')
  })
})
