import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('family tree interface', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('fetches the published archive without reusing a stale cached copy', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await screen.findByRole('button', { name: 'Admin' })
    const [url, options] = fetchMock.mock.calls[0]!
    expect(url).toMatch(/family-archive\.enc\.json\?v=\d+$/)
    expect(options).toMatchObject({ cache: 'no-store' })
  })

  it('lets an admin create and inspect a person without persisting the archive', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Admin' }))
    fireEvent.change(screen.getByLabelText('Local Admin password'), { target: { value: 'moltisantitree' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add person' }))
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Ada' } })
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Lovelace' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    const personNode = await screen.findByRole('button', { name: 'Ada Lovelace' })
    fireEvent.click(personNode)
    expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument()
    expect(screen.getByText('1 people in your tree')).toBeInTheDocument()
    expect(screen.getByText('No family connections recorded yet.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add person' }))
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Bea' } })
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Lovelace' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    const nodeEditButton = screen.getAllByRole('button', { name: 'Edit person: Bea Lovelace' })
      .find((button) => button.classList.contains('node-edit-button'))
    if (!nodeEditButton) throw new Error('The person node edit button is not available.')
    fireEvent.click(nodeEditButton)
    expect(screen.getByRole('heading', { name: 'Edit person' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    fireEvent.click(screen.getByRole('button', { name: 'Ada Lovelace' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a connection' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(screen.getByRole('heading', { name: 'Children' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Bea Lovelace/ })
      .some((button) => button.classList.contains('relative-person'))).toBe(true)

    const childNode = screen.getByRole('button', { name: 'Bea Lovelace' })
    fireEvent.pointerDown(childNode, { pointerId: 1, button: 0, clientX: 20, clientY: 20 })
    fireEvent.pointerUp(childNode, { pointerId: 1, button: 0, clientX: 20, clientY: 20 })
    fireEvent.click(childNode)
    expect(screen.getByRole('heading', { name: 'Bea Lovelace' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Parents' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Ada Lovelace/ })
      .some((button) => button.classList.contains('relative-person'))).toBe(true)

    const canvas = screen.getByRole('group', { name: /Moltisanti Family Tree/ })
    const wheelEvent = new WheelEvent('wheel', { deltaY: 100, cancelable: true, bubbles: true })
    act(() => canvas.dispatchEvent(wheelEvent))
    expect(wheelEvent.defaultPrevented).toBe(true)
    expect(screen.getByText('90%')).toBeInTheDocument()
  }, 10_000)
})
