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
    vi.unstubAllGlobals()
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

    expect(container.querySelector('.tree-photo-diagnostic-actual-status'))
      .toHaveTextContent('Selected photo in actual tree: Waiting for visibility…')
    await waitFor(() => expect(imageMocks.getImageVariant).toHaveBeenCalledTimes(2))
    expect(imageMocks.decryptImageDataUrl).toHaveBeenCalledWith(
      'moltisanti-image:v1:encrypted', 'test passphrase',
    )
    expect(imageMocks.getImageVariant).toHaveBeenCalledWith(
      'person-1', 'moltisanti-image:v1:encrypted', imageConfig.variants.tree, 'test passphrase', 1,
    )
    expect(URL.createObjectURL).toHaveBeenCalledTimes(3)

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
      'blob:shared-photo-test',
      'data:image/jpeg;base64,dGVzdA==',
      null,
    ])
    expect(svgImages[5]?.getAttributeNS('http://www.w3.org/1999/xlink', 'href'))
      .toBe('data:image/jpeg;base64,dGVzdA==')

    const htmlImages = [...container.querySelectorAll('img')]
    const clippedSvgImage = svgImages[3]
    if (htmlImages.length !== 3 || svgImages.length !== 6 || !clippedSvgImage) {
      throw new Error('All nine photo samples should render.')
    }
    await act(async () => {
      for (const image of [...htmlImages, ...svgImages]) fireEvent.load(image)
    })
    expect(container.querySelectorAll('small')).toHaveLength(9)
    expect([...container.querySelectorAll('small')].map((status) => status.textContent))
      .toEqual(Array(9).fill('Loaded'))

    await act(async () => fireEvent.error(clippedSvgImage))
    expect(container.querySelectorAll('small')[5]).toHaveTextContent('Failed to display')

    unmount()
    expect(revokeObjectURL).toHaveBeenCalledTimes(3)
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
      .toEqual([
        'Loading…', 'Loading…', 'Loading…', ...Array(6).fill('Failed to display'),
      ])

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

  it('reports whether the exact lazy tree-photo component enters the viewport and loads', async () => {
    let observerCallback: IntersectionObserverCallback | null = null
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback
      }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() { return [] }
      root = null
      rootMargin = '0px'
      thresholds = [0]
    })
    imageMocks.getImageVariant.mockResolvedValue('data:image/jpeg;base64,dGVzdA==')
    imageMocks.imageDataUrlToBlob.mockReturnValue(new Blob(['test'], { type: 'image/jpeg' }))
    imageMocks.isEncryptedImage.mockReturnValue(false)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:tree-photo-lazy-test')

    const { container } = render(<TreePhotoDiagnostic
      personId="person-lazy"
      source="data:image/jpeg;base64,b3JpZ2luYWw="
      passphrase=""
      language="en"
    />)

    expect(screen.getAllByText('Waiting for visibility…')).toHaveLength(2)
    expect(imageMocks.getImageVariant).toHaveBeenCalledOnce()

    await act(async () => observerCallback?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ))
    await waitFor(() => expect(imageMocks.getImageVariant).toHaveBeenCalledTimes(2))

    const sample = screen.getByText('Tree photo (lazy)').parentElement
    const image = sample?.querySelector('svg image')
    if (!image) throw new Error('The lazy tree-photo image should render.')
    await act(async () => fireEvent.load(image))
    expect(sample?.querySelector('small')).toHaveTextContent('Loaded')
    expect(container.querySelectorAll('svg image')).toHaveLength(6)
  })

  it('shows the load state reported by the selected production tree node', () => {
    const { container } = render(<TreePhotoDiagnostic
      personId="person-tree"
      source="data:image/jpeg;base64,b3JpZ2luYWw="
      passphrase=""
      language="en"
      actualTreeStatus="loaded"
    />)

    expect(container.querySelector('.tree-photo-diagnostic-actual-status'))
      .toHaveTextContent('Selected photo in actual tree: Loaded')
  })
})
