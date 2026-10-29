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

import { TreePhoto } from './PhotoVariant'

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
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:tree-variant')
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
    expect(container.querySelector('image')?.getAttribute('href')).toBe('blob:tree-variant')
    expect(container.querySelector('.tree-photo-spinner')).not.toBeInTheDocument()

    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:tree-variant')
  })

  it('starts visible tree photos without waiting for IntersectionObserver', async () => {
    const observe = vi.fn()
    variantMocks.get.mockResolvedValue('data:image/jpeg;base64,dmFyaWFudA==')
    variantMocks.toBlob.mockReturnValue(new Blob(['variant'], { type: 'image/jpeg' }))
    vi.stubGlobal('IntersectionObserver', class {
      constructor() {}
      observe = observe
      disconnect() {}
      unobserve() {}
      takeRecords() { return [] }
      root = null
      rootMargin = '0px'
      thresholds = [0]
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:visible-tree-variant')
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return this.classList.contains('tree-stage')
        ? {
          left: 10, top: 20, right: 410, bottom: 420, width: 400, height: 400,
          x: 10, y: 20, toJSON: () => ({}),
        } as DOMRect
        : {
          left: 30, top: 40, right: 74, bottom: 84, width: 44, height: 44,
          x: 30, y: 40, toJSON: () => ({}),
        } as DOMRect
    })

    const { container } = render(<div className="tree-stage"><svg><TreePhoto
      personId="person-visible"
      source="moltisanti-image:v1:encrypted"
      passphrase="valid passphrase"
      onError={vi.fn()}
    /></svg></div>)

    await waitFor(() => expect(variantMocks.get).toHaveBeenCalledOnce())
    expect(observe).not.toHaveBeenCalled()
    await waitFor(() => expect(container.querySelector('image')?.getAttribute('href'))
      .toBe('blob:visible-tree-variant'))
  })

  it('uses the tree stage as the observer root for offscreen photos', async () => {
    let observerRoot: Element | Document | null | undefined
    vi.stubGlobal('IntersectionObserver', class {
      constructor(_callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        observerRoot = options?.root
      }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() { return [] }
      root = null
      rootMargin = '0px'
      thresholds = [0]
    })
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return this.classList.contains('tree-stage')
        ? {
          left: 10, top: 20, right: 410, bottom: 420, width: 400, height: 400,
          x: 10, y: 20, toJSON: () => ({}),
        } as DOMRect
        : {
          left: 500, top: 500, right: 544, bottom: 544, width: 44, height: 44,
          x: 500, y: 500, toJSON: () => ({}),
        } as DOMRect
    })

    const { container } = render(<div className="tree-stage"><svg><TreePhoto
      personId="person-offscreen"
      source="moltisanti-image:v1:encrypted"
      passphrase="valid passphrase"
      onError={vi.fn()}
    /></svg></div>)

    await waitFor(() => expect(observerRoot).toBe(container.querySelector('.tree-stage')))
    expect(variantMocks.get).not.toHaveBeenCalled()
  })

  it('can load the selected diagnostic tree photo without waiting for intersection', async () => {
    const observe = vi.fn()
    variantMocks.get.mockResolvedValue('data:image/jpeg;base64,dmFyaWFudA==')
    variantMocks.toBlob.mockReturnValue(new Blob(['variant'], { type: 'image/jpeg' }))
    vi.stubGlobal('IntersectionObserver', class {
      constructor() {}
      observe = observe
      disconnect() {}
      unobserve() {}
      takeRecords() { return [] }
      root = null
      rootMargin = '0px'
      thresholds = [0]
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:diagnostic-tree-variant')

    const { container } = render(<svg><TreePhoto
      personId="person-diagnostic"
      source="moltisanti-image:v1:encrypted"
      passphrase="valid passphrase"
      onError={vi.fn()}
      loadImmediately
    /></svg>)

    await waitFor(() => expect(variantMocks.get).toHaveBeenCalledOnce())
    expect(observe).not.toHaveBeenCalled()
    expect(container.querySelector('image')?.getAttribute('href'))
      .toBe('blob:diagnostic-tree-variant')
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
      .mockReturnValueOnce('blob:first-tree-variant')
      .mockReturnValueOnce('blob:reloaded-tree-variant')
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
      .toBe('blob:first-tree-variant'))

    await act(async () => {
      window.dispatchEvent(new Event('image-cache-cleared'))
    })
    variantMocks.intersect?.()
    await waitFor(() => expect(variantMocks.get).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(container.querySelector('image')?.getAttribute('href'))
      .toBe('blob:reloaded-tree-variant'))
  })
})
