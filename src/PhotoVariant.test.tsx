import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const variantMocks = vi.hoisted(() => ({
  get: vi.fn(),
  toBlob: vi.fn(),
  intersect: null as (() => void) | null,
}))

vi.mock('./imageVariants', () => ({
  getImageVariant: variantMocks.get,
  imageDataUrlToBlob: variantMocks.toBlob,
}))

import { ProfilePhoto, TreePhoto } from './PhotoVariant'

describe('visible tree photos', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    variantMocks.get.mockReset()
    variantMocks.toBlob.mockReset()
    variantMocks.intersect = null
  })

  it('requests image processing only after the tree image enters the viewport', async () => {
    let resolveVariant: ((value: string) => void) | undefined
    variantMocks.get.mockImplementation(() => new Promise((resolve: (value: string) => void) => {
      resolveVariant = resolve
    }))
    variantMocks.toBlob.mockReturnValue(new Blob(['variant'], { type: 'image/jpeg' }))
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) {
        variantMocks.intersect = () => callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        )
      }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() { return [] }
      root = null
      rootMargin = '0px'
      thresholds = [0]
    })
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const { container, unmount } = render(<svg><TreePhoto
      personId="person-1"
      source="moltisanti-image:v1:encrypted"
      passphrase="valid passphrase"
      onError={vi.fn()}
    /></svg>)

    expect(variantMocks.get).not.toHaveBeenCalled()
    variantMocks.intersect?.()
    await waitFor(() => expect(variantMocks.get).toHaveBeenCalledWith(
      'person-1', 'moltisanti-image:v1:encrypted', 128, 'valid passphrase', 1,
    ))
    const spinner = container.querySelector('.tree-photo-spinner')
    expect(spinner).toHaveAttribute('cx', '34')
    expect(spinner).toHaveAttribute('cy', '34')
    expect(spinner).toHaveAttribute('r', '7')
    expect(spinner).toHaveAttribute('stroke-dasharray', '30 14')

    await act(async () => resolveVariant?.('data:image/jpeg;base64,dmFyaWFudA=='))
    expect(container.querySelector('image')?.getAttribute('href')).toBe('data:image/jpeg;base64,dmFyaWFudA==')
    expect(container.querySelector('image')?.getAttributeNS(
      'http://www.w3.org/1999/xlink', 'href',
    )).toBe('data:image/jpeg;base64,dmFyaWFudA==')
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(container.querySelector('.tree-photo-spinner')).not.toBeInTheDocument()

    unmount()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  })

  it('reloads visible tree photos after the image cache is cleared', async () => {
    variantMocks.get.mockResolvedValue('data:image/jpeg;base64,dmFyaWFudA==')
    variantMocks.toBlob.mockReturnValue(new Blob(['variant'], { type: 'image/jpeg' }))
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) {
        variantMocks.intersect = () => callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        )
      }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() { return [] }
      root = null
      rootMargin = '0px'
      thresholds = [0]
    })
    vi.spyOn(URL, 'createObjectURL')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const { container } = render(<svg><TreePhoto
      personId="person-2"
      source="moltisanti-image:v1:encrypted"
      passphrase="valid passphrase"
      onError={vi.fn()}
    /></svg>)

    variantMocks.intersect?.()
    await waitFor(() => expect(variantMocks.get).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(container.querySelector('image')?.getAttribute('href'))
      .toBe('data:image/jpeg;base64,dmFyaWFudA=='))

    await act(async () => {
      window.dispatchEvent(new Event('image-cache-cleared'))
    })
    variantMocks.intersect?.()
    await waitFor(() => expect(variantMocks.get).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(container.querySelector('image')?.getAttribute('href'))
      .toBe('data:image/jpeg;base64,dmFyaWFudA=='))
  })

  it('loads a visible photo when the SVG intersection observer does not report it', async () => {
    variantMocks.get.mockResolvedValue('data:image/jpeg;base64,dmFyaWFudA==')
    variantMocks.toBlob.mockReturnValue(new Blob(['variant'], { type: 'image/jpeg' }))
    const observer = vi.fn()
    vi.stubGlobal('IntersectionObserver', class {
      constructor() {}
      observe = observer
      disconnect() {}
      unobserve() {}
      takeRecords() { return [] }
      root = null
      rootMargin = '0px'
      thresholds = [0]
    })
    vi.spyOn(URL, 'createObjectURL')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 20, y: 30, left: 20, top: 30, right: 64, bottom: 74, width: 44, height: 44,
      toJSON: () => ({}),
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 320, bottom: 500, width: 320, height: 500,
      toJSON: () => ({}),
    })

    const { container } = render(<div className="tree-stage"><svg><TreePhoto
      personId="person-3"
      source="moltisanti-image:v1:encrypted"
      passphrase="valid passphrase"
      onError={vi.fn()}
    /></svg></div>)
    const image = container.querySelector('image')!

    await waitFor(() => expect(variantMocks.get).toHaveBeenCalledWith(
      'person-3', 'moltisanti-image:v1:encrypted', 128, 'valid passphrase', 1,
    ))
    expect(observer).toHaveBeenCalledWith(image)
    expect(image.getAttribute('href')).toBe('data:image/jpeg;base64,dmFyaWFudA==')
  })

  it('keeps using a blob URL for the HTML profile image', async () => {
    variantMocks.get.mockResolvedValue('data:image/jpeg;base64,dmFyaWFudA==')
    variantMocks.toBlob.mockReturnValue(new Blob(['variant'], { type: 'image/jpeg' }))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:profile-variant')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const { container, unmount } = render(<ProfilePhoto
      personId="person-4"
      source="moltisanti-image:v1:encrypted"
      passphrase="valid passphrase"
      onError={vi.fn()}
    />)

    await waitFor(() => expect(container.querySelector('img')?.getAttribute('src'))
      .toBe('blob:profile-variant'))

    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:profile-variant')
  })
})
