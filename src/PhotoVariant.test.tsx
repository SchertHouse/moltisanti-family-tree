import { act, cleanup, render, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const variantMocks = vi.hoisted(() => ({
  get: vi.fn(),
  toBlob: vi.fn(),
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
  })

  it('requests image processing only after the viewport calculation marks the photo visible', async () => {
    let resolveVariant: ((value: string) => void) | undefined
    variantMocks.get.mockImplementation(() => new Promise((resolve: (value: string) => void) => {
      resolveVariant = resolve
    }))
    variantMocks.toBlob.mockReturnValue(new Blob(['variant'], { type: 'image/jpeg' }))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:tree-variant')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const { container, rerender, unmount } = render(<svg><TreePhoto
      personId="person-1"
      source="moltisanti-image:v1:encrypted"
      passphrase="valid passphrase"
      onError={vi.fn()}
    /></svg>)

    expect(variantMocks.get).not.toHaveBeenCalled()
    rerender(<svg><TreePhoto
      personId="person-1"
      source="moltisanti-image:v1:encrypted"
      passphrase="valid passphrase"
      onError={vi.fn()}
      loadWhenVisible
    /></svg>)
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

  it('starts a visible tree photo from the viewport calculation', async () => {
    variantMocks.get.mockResolvedValue('data:image/jpeg;base64,dmFyaWFudA==')
    variantMocks.toBlob.mockReturnValue(new Blob(['variant'], { type: 'image/jpeg' }))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:visible-tree-variant')

    const { container } = render(<div className="tree-stage"><svg><TreePhoto
      personId="person-visible"
      source="moltisanti-image:v1:encrypted"
      passphrase="valid passphrase"
      onError={vi.fn()}
      loadWhenVisible
    /></svg></div>)

    await waitFor(() => expect(variantMocks.get).toHaveBeenCalledOnce())
    await waitFor(() => expect(container.querySelector('image')?.getAttribute('href'))
      .toBe('blob:visible-tree-variant'))
  })

  it('loads tree and profile photos when StrictMode replays their effects', async () => {
    variantMocks.get.mockResolvedValue('data:image/jpeg;base64,dmFyaWFudA==')
    variantMocks.toBlob.mockReturnValue(new Blob(['variant'], { type: 'image/jpeg' }))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:strict-mode-variant')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const { container } = render(<StrictMode>
      <div className="tree-stage">
        <svg><TreePhoto personId="person-strict" source="photo" passphrase="" onError={vi.fn()}
          loadWhenVisible /></svg>
        <ProfilePhoto personId="person-strict" source="photo" passphrase="" onError={vi.fn()} />
      </div>
    </StrictMode>)

    await waitFor(() => {
      expect(container.querySelector('image')?.getAttribute('href')).toBe('blob:strict-mode-variant')
      expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:strict-mode-variant')
    })
    expect(container.querySelector('.tree-photo-spinner')).not.toBeInTheDocument()
    expect(container.querySelector('.profile-photo-spinner')).not.toBeInTheDocument()
  })

  it('loads an offscreen photo when pan or zoom brings it into the viewport', async () => {
    variantMocks.get.mockResolvedValue('data:image/jpeg;base64,dmFyaWFudA==')
    variantMocks.toBlob.mockReturnValue(new Blob(['variant'], { type: 'image/jpeg' }))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:panned-tree-variant')

    const { container, rerender } = render(<div className="tree-stage"><svg><TreePhoto
      personId="person-panned"
      source="moltisanti-image:v1:encrypted"
      passphrase="valid passphrase"
      onError={vi.fn()}
    /></svg></div>)

    expect(variantMocks.get).not.toHaveBeenCalled()
    rerender(<div className="tree-stage"><svg><TreePhoto
      personId="person-panned"
      source="moltisanti-image:v1:encrypted"
      passphrase="valid passphrase"
      onError={vi.fn()}
      loadWhenVisible
    /></svg></div>)

    await waitFor(() => expect(variantMocks.get).toHaveBeenCalledOnce())
    await waitFor(() => expect(container.querySelector('image')?.getAttribute('href'))
      .toBe('blob:panned-tree-variant'))
  })

  it('starts a photo that the viewport calculation marks visible', async () => {
    variantMocks.get.mockResolvedValue('data:image/jpeg;base64,dmFyaWFudA==')
    variantMocks.toBlob.mockReturnValue(new Blob(['variant'], { type: 'image/jpeg' }))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:viewport-tree-variant')

    const { container } = render(<svg><TreePhoto
      personId="person-in-viewport"
      source="moltisanti-image:v1:encrypted"
      passphrase="valid passphrase"
      onError={vi.fn()}
      loadWhenVisible
    /></svg>)
    await waitFor(() => expect(variantMocks.get).toHaveBeenCalledOnce())
    await waitFor(() => expect(variantMocks.get).toHaveBeenCalledOnce())
    await waitFor(() => expect(container.querySelector('image')?.getAttribute('href'))
      .toBe('blob:viewport-tree-variant'))
  })

  it('reloads visible tree photos after the image cache is cleared', async () => {
    variantMocks.get.mockResolvedValue('data:image/jpeg;base64,dmFyaWFudA==')
    variantMocks.toBlob.mockReturnValue(new Blob(['variant'], { type: 'image/jpeg' }))
    vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:first-tree-variant')
      .mockReturnValueOnce('blob:reloaded-tree-variant')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const { container } = render(<svg><TreePhoto
      personId="person-2"
      source="moltisanti-image:v1:encrypted"
      passphrase="valid passphrase"
      onError={vi.fn()}
      loadWhenVisible
    /></svg>)

    await waitFor(() => expect(variantMocks.get).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(container.querySelector('image')?.getAttribute('href'))
      .toBe('blob:first-tree-variant'))

    await act(async () => {
      window.dispatchEvent(new Event('image-cache-cleared'))
    })
    await waitFor(() => expect(variantMocks.get).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(container.querySelector('image')?.getAttribute('href'))
      .toBe('blob:reloaded-tree-variant'))
  })
})
