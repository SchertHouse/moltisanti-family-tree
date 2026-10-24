import 'fake-indexeddb/auto'
import { act, cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as cryptoModule from './crypto'
import type { FamilyArchive } from './model'
import { clearRememberedPassphrase, getRememberedPassphrase, saveRememberedPassphrase } from './rememberedKey'

describe('family tree interface', () => {
  afterEach(async () => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    await clearRememberedPassphrase()
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

  it('opens the published archive automatically with a remembered passphrase', async () => {
    const key = 'remembered family key'
    const archive: FamilyArchive = {
      schemaVersion: 1,
      people: [{ id: 'remembered-person', firstName: 'Ada', lastName: 'Lovelace' }],
      relationships: [],
    }
    vi.spyOn(cryptoModule, 'decryptArchive').mockResolvedValue(archive)
    await saveRememberedPassphrase(key)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ format: 'test-envelope' }))))

    render(<App />)

    expect(await screen.findByRole('button', { name: 'Ada Lovelace' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Open encrypted archive' })).not.toBeInTheDocument()
  })

  it('falls back to the passphrase prompt when the remembered key cannot open the archive', async () => {
    vi.spyOn(cryptoModule, 'decryptArchive').mockRejectedValue(new Error('Invalid key'))
    await saveRememberedPassphrase('stale remembered key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ format: 'test-envelope' }))))

    render(<App />)

    expect(await screen.findByRole('dialog', { name: 'Open encrypted archive' })).toBeInTheDocument()
    expect(await getRememberedPassphrase()).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('The saved key could not open the archive')
  })

  it('remembers a passphrase only when the user opts in during opening', async () => {
    const archive: FamilyArchive = {
      schemaVersion: 1,
      people: [{ id: 'opt-in-person', firstName: 'Cora', lastName: 'Lovelace' }],
      relationships: [],
    }
    vi.spyOn(cryptoModule, 'decryptArchive').mockResolvedValue(archive)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ format: 'test-envelope' }))))

    render(<App />)

    fireEvent.change(await screen.findByLabelText('Encryption passphrase'), { target: { value: 'entered by user' } })
    fireEvent.click(screen.getByRole('switch', { name: 'Remember on this device (encrypted key)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByRole('button', { name: 'Cora Lovelace' })).toBeInTheDocument()
    expect(await getRememberedPassphrase()).toBe('entered by user')
  })

  it('accepts Italian DD-MM-YYYY dates and displays them in the same format', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)

    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'it' } })
    fireEvent.click(screen.getByRole('button', { name: 'Admin' }))
    fireEvent.change(screen.getByLabelText('Password Admin locale'), { target: { value: 'moltisantitree' } })
    fireEvent.click(screen.getByRole('button', { name: 'Conferma' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi persona' }))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ada' } })
    fireEvent.change(screen.getByLabelText('Cognome'), { target: { value: 'Lovelace' } })
    fireEvent.change(screen.getByLabelText('Data di nascita (DD-MM-YYYY)'), { target: { value: '29-02-2000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi' }))

    expect(await screen.findByText('29-02-2000')).toBeInTheDocument()
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
    const familyLine = document.querySelector('.family-line')
    expect(familyLine).toBeInTheDocument()
    expect(familyLine?.getAttribute('d')).toContain('L')
    expect(familyLine?.getAttribute('d')).not.toContain('C')

    const childNode = screen.getByRole('button', { name: 'Bea Lovelace' })
    fireEvent.pointerDown(childNode, { pointerId: 1, button: 0, clientX: 20, clientY: 20 })
    fireEvent.pointerUp(childNode, { pointerId: 1, button: 0, clientX: 20, clientY: 20 })
    fireEvent.click(childNode)
    expect(screen.getByRole('heading', { name: 'Bea Lovelace' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Parents' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Ada Lovelace/ })
      .some((button) => button.classList.contains('relative-person'))).toBe(true)

    const canvas = screen.getByRole('group', { name: /Moltisanti Family Tree/ })
    const treeNode = canvas.querySelector('.person-node')
    if (!treeNode) throw new Error('The family tree node is not available.')
    const dispatchTouch = (target: Element, type: string, pointerId: number, clientX: number, clientY: number) => {
      const event = createEvent(type, target, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        pointerId: { value: pointerId },
        pointerType: { value: 'touch' },
        button: { value: 0 },
        clientX: { value: clientX },
        clientY: { value: clientY },
      })
      fireEvent(target, event)
    }
    dispatchTouch(treeNode, 'pointerdown', 1, 100, 100)
    dispatchTouch(treeNode, 'pointerdown', 2, 120, 100)
    dispatchTouch(canvas, 'pointermove', 2, 140, 100)
    expect(screen.getByText('200%')).toBeInTheDocument()
    dispatchTouch(canvas, 'pointerup', 1, 100, 100)
    dispatchTouch(canvas, 'pointerup', 2, 140, 100)

    const wheelEvent = new WheelEvent('wheel', { deltaY: 100, cancelable: true, bubbles: true })
    act(() => canvas.dispatchEvent(wheelEvent))
    expect(wheelEvent.defaultPrevented).toBe(true)
    expect(screen.getByText('180%')).toBeInTheDocument()
  }, 10_000)
})
