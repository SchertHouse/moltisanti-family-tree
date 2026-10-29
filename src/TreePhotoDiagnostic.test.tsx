import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import imageConfig from '../image-config.json'

const imageMocks = vi.hoisted(() => ({
  getImageVariant: vi.fn(),
  imageDataUrlToBlob: vi.fn(),
  decryptImageDataUrl: vi.fn(),
  isEncryptedImage: vi.fn(),
}))

vi.mock('./imageVariants', () => ({
  getImageVariant: imageMocks.getImageVariant,
  imageDataUrlToBlob: imageMocks.imageDataUrlToBlob,
}))
vi.mock('./crypto', () => ({
  decryptImageDataUrl: imageMocks.decryptImageDataUrl,
  isEncryptedImage: imageMocks.isEncryptedImage,
}))

import TreePhotoDiagnostic from './TreePhotoDiagnostic'

describe('temporary tree photo diagnostic', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    imageMocks.getImageVariant.mockReset()
    imageMocks.imageDataUrlToBlob.mockReset()
    imageMocks.decryptImageDataUrl.mockReset()
    imageMocks.isEncryptedImage.mockReset()
  })

  it('compares the original and the generated tree variant across supported renderers', async () => {
    imageMocks.getImageVariant.mockResolvedValue('data:image/jpeg;base64,dGVzdA==')
    imageMocks.imageDataUrlToBlob.mockReturnValue(new Blob(['test'], { type: 'image/jpeg' }))
    imageMocks.isEncryptedImage.mockReturnValue(true)
    imageMocks.decryptImageDataUrl.mockResolvedValue('data:image/jpeg;base64,b3JpZ2luYWw=')
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:shared-photo-test')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const { container, unmount } = render(<TreePhotoDiagnostic
      personId="person-1"
      source="moltisanti-image:v1:encrypted"
      passphrase="test passphrase"
      language="en"
    />)

    await waitFor(() => expect(imageMocks.getImageVariant).toHaveBeenCalledOnce())
    expect(imageMocks.decryptImageDataUrl).toHaveBeenCalledWith(
      'moltisanti-image:v1:encrypted', 'test passphrase',
    )
    expect(imageMocks.getImageVariant).toHaveBeenCalledWith(
      'person-1', 'moltisanti-image:v1:encrypted', imageConfig.variants.tree, 'test passphrase', 1,
    )
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2)

    await waitFor(() => expect([...container.querySelectorAll('img')].map((image) => image.getAttribute('src')))
      .toEqual([
        'blob:shared-photo-test',
        'blob:shared-photo-test',
        'data:image/jpeg;base64,dGVzdA==',
      ]))
    const svgImages = [...container.querySelectorAll('svg image')]
    expect(svgImages.map((image) => image.getAttribute('href'))).toEqual([
      'blob:shared-photo-test',
      'blob:shared-photo-test',
      'blob:shared-photo-test',
      'data:image/jpeg;base64,dGVzdA==',
      null,
    ])
    expect(svgImages[4]?.getAttributeNS('http://www.w3.org/1999/xlink', 'href'))
      .toBe('data:image/jpeg;base64,dGVzdA==')

    const htmlImages = [...container.querySelectorAll('img')]
    const clippedSvgImage = svgImages[2]
    if (htmlImages.length !== 3 || svgImages.length !== 5 || !clippedSvgImage) {
      throw new Error('All eight photo samples should render.')
    }
    await act(async () => {
      for (const image of [...htmlImages, ...svgImages]) fireEvent.load(image)
    })
    expect(container.querySelectorAll('small')).toHaveLength(8)
    expect([...container.querySelectorAll('small')].map((status) => status.textContent))
      .toEqual(Array(8).fill('Loaded'))

    await act(async () => fireEvent.error(clippedSvgImage))
    expect(container.querySelectorAll('small')[4]).toHaveTextContent('Failed to display')

    unmount()
    expect(revokeObjectURL).toHaveBeenCalledTimes(2)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:shared-photo-test')
  })

  it('keeps the original source comparison and reports the variant error', async () => {
    imageMocks.getImageVariant.mockRejectedValue(new Error('Canvas resize failed'))
    imageMocks.imageDataUrlToBlob.mockReturnValue(new Blob(['test'], { type: 'image/jpeg' }))
    imageMocks.isEncryptedImage.mockReturnValue(true)
    imageMocks.decryptImageDataUrl.mockResolvedValue('data:image/jpeg;base64,b3JpZ2luYWw=')
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:original-photo-test')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const { container, unmount } = render(<TreePhotoDiagnostic
      personId="person-2"
      source="moltisanti-image:v1:encrypted"
      passphrase="test passphrase"
      language="en"
    />)

    expect(await screen.findByText(/generating the tree-size variant failed: Canvas resize failed/))
      .toBeInTheDocument()
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:original-photo-test')
    expect(container.querySelector('svg image')?.getAttribute('href'))
      .toBe('blob:original-photo-test')
    expect([...container.querySelectorAll('small')].map((status) => status.textContent))
      .toEqual(['Loading…', 'Loading…', ...Array(6).fill('Failed to display')])

    unmount()
    expect(revokeObjectURL).toHaveBeenCalledOnce()
  })

  it('reports an original-image decryption failure instead of hiding it', async () => {
    imageMocks.isEncryptedImage.mockReturnValue(true)
    imageMocks.decryptImageDataUrl.mockRejectedValue(new Error('Image key is wrong'))

    const { container } = render(<TreePhotoDiagnostic
      personId="person-3"
      source="moltisanti-image:v1:encrypted"
      passphrase="test passphrase"
      language="en"
    />)

    expect(await screen.findByText(/Could not decrypt or load the original image: Image key is wrong/))
      .toBeInTheDocument()
    expect(imageMocks.getImageVariant).not.toHaveBeenCalled()
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })
})
