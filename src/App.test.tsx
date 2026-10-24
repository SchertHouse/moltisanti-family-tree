import 'fake-indexeddb/auto'
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as cryptoModule from './crypto'
import * as githubModule from './github'
import type { FamilyArchive } from './model'
import { clearRememberedPassphrase, getRememberedPassphrase, saveRememberedPassphrase } from './rememberedKey'

describe('family tree interface', () => {
  afterEach(async () => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(document, 'fullscreenElement')
    Reflect.deleteProperty(document, 'exitFullscreen')
    Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen')
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

  it('fades a notification after ten seconds and then removes it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)
    await screen.findByRole('button', { name: 'Admin' })
    vi.useFakeTimers()

    fireEvent.click(screen.getByRole('button', { name: 'Admin' }))
    fireEvent.change(screen.getByLabelText('Local Admin password'), { target: { value: 'incorrect' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent('Incorrect password.')

    await act(async () => vi.advanceTimersByTimeAsync(9_999))
    expect(notice).not.toHaveClass('is-fading')
    await act(async () => vi.advanceTimersByTimeAsync(1))
    expect(notice).toHaveClass('is-fading')
    await act(async () => vi.advanceTimersByTimeAsync(500))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    vi.useRealTimers()
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

  it('lets an admin publish using a new key and then reuse that active key', async () => {
    const archive: FamilyArchive = {
      schemaVersion: 1,
      people: [{ id: 'publish-person', firstName: 'Ada', lastName: 'Lovelace' }],
      relationships: [],
    }
    const encrypted = {
      format: 'moltisanti-encrypted' as const,
      formatVersion: 1 as const,
      algorithm: 'AES-256-GCM' as const,
      kdf: 'PBKDF2-SHA-256' as const,
      iterations: 310_000,
      salt: 'salt',
      iv: 'iv',
      ciphertext: 'ciphertext',
    }
    vi.spyOn(cryptoModule, 'decryptArchive').mockResolvedValue(archive)
    vi.spyOn(cryptoModule, 'prepareArchivePhotos').mockResolvedValue(archive)
    const encryptSpy = vi.spyOn(cryptoModule, 'encryptPreparedArchive').mockResolvedValue(encrypted)
    const publishSpy = vi.spyOn(githubModule, 'publishEncryptedArchive').mockResolvedValue(undefined)
    await saveRememberedPassphrase('current family passphrase')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(encrypted))))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)

    await screen.findByRole('button', { name: 'Ada Lovelace' })
    fireEvent.click(screen.getByRole('button', { name: 'Admin' }))
    fireEvent.change(screen.getByLabelText('Local Admin password'), { target: { value: 'moltisantitree' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    fireEvent.click(screen.getByRole('button', { name: 'Publish to GitHub' }))
    const publishDialog = screen.getByRole('dialog', { name: 'Publish to GitHub' })
    fireEvent.click(screen.getByRole('button', { name: 'Set a new key' }))
    fireEvent.change(screen.getByLabelText('Encryption passphrase'), { target: { value: 'new secure family passphrase' } })
    fireEvent.change(screen.getByLabelText('Confirm passphrase'), { target: { value: 'new secure family passphrase' } })
    fireEvent.change(screen.getByLabelText('GitHub owner'), { target: { value: 'family' } })
    fireEvent.change(screen.getByLabelText('Fine-grained token (memory only)'), { target: { value: 'token' } })
    fireEvent.click(within(publishDialog).getByRole('button', { name: 'Publish to GitHub' }))

    await waitFor(() => expect(publishSpy).toHaveBeenCalledTimes(1))
    expect(encryptSpy).toHaveBeenLastCalledWith(archive, 'new secure family passphrase')
    expect(screen.getByRole('status')).toHaveTextContent('Share the new passphrase')

    fireEvent.click(screen.getByRole('button', { name: 'Publish to GitHub' }))
    const reuseDialog = screen.getByRole('dialog', { name: 'Publish to GitHub' })
    expect(within(reuseDialog).getByRole('button', { name: 'Reuse key' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(screen.getByLabelText('GitHub owner'), { target: { value: 'family' } })
    fireEvent.change(screen.getByLabelText('Fine-grained token (memory only)'), { target: { value: 'token' } })
    fireEvent.click(within(reuseDialog).getByRole('button', { name: 'Publish to GitHub' }))

    await waitFor(() => expect(publishSpy).toHaveBeenCalledTimes(2))
    expect(encryptSpy).toHaveBeenLastCalledWith(archive, 'new secure family passphrase')
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

  it('enters and exits full screen for the genealogy tree', async () => {
    const archive: FamilyArchive = {
      schemaVersion: 1,
      people: [{ id: 'fullscreen-person', firstName: 'Ada', lastName: 'Lovelace' }],
      relationships: [],
    }
    let fullscreenElement: Element | null = null
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    })
    const requestFullscreen = vi.fn(async () => {
      fullscreenElement = document.querySelector('.tree-area')
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    const exitFullscreen = vi.fn(async () => {
      fullscreenElement = null
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    })
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreen,
    })
    vi.spyOn(cryptoModule, 'decryptArchive').mockResolvedValue(archive)
    await saveRememberedPassphrase('fullscreen test key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')))
    render(<App />)

    await screen.findByRole('button', { name: 'Ada Lovelace' })
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }))
    expect(requestFullscreen).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('button', { name: 'Exit full screen' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Exit full screen' }))
    expect(exitFullscreen).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('button', { name: 'Full screen' })).toBeInTheDocument()
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
    const profileEditButton = screen.getAllByRole('button', { name: 'Edit person: Bea Lovelace' })
      .find((button) => button.classList.contains('profile-edit'))
    expect(profileEditButton?.parentElement).toHaveClass('profile-identity')
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
