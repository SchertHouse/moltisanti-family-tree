import { cleanup, render, waitFor } from '@testing-library/react'
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
    expect(container.querySelector('image')?.getAttribute('href')).toBe('blob:tree-variant')

    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:tree-variant')
  })
})
