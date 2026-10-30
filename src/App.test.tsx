import 'fake-indexeddb/auto'
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { unzipSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as cryptoModule from './crypto'
import * as githubModule from './github'
import * as gedzipModule from './gedzip'
import * as imageVariantModule from './imageVariants'
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

  it('clears the selected person when tapping the empty tree background', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Admin' }))
    fireEvent.change(screen.getByLabelText('Local Admin password'), { target: { value: 'moltisantitree' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add person' }))
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Ada' } })
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Lovelace' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    const personNode = await screen.findByRole('button', { name: 'Ada Lovelace' })
    const canvas = document.querySelector('.tree-canvas')
    if (!canvas) throw new Error('The genealogy tree canvas is not available.')
    fireEvent.click(personNode)
    expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument()
    const viewTransform = canvas.querySelector('g')?.getAttribute('transform')

    fireEvent.click(canvas)

    expect(screen.queryByRole('heading', { name: 'Ada Lovelace' })).not.toBeInTheDocument()
    expect(canvas.querySelector('g')?.getAttribute('transform')).toBe(viewTransform)

    fireEvent.click(personNode)
    expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument()
    fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: 'touch', button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(canvas, { pointerId: 1, pointerType: 'touch', clientX: 40, clientY: 40 })
    fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'touch', clientX: 40, clientY: 40 })
    fireEvent.click(canvas)

    expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument()
  }, 15_000)

  it('traps keyboard focus in dialogs and restores focus to the opener', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)

    const adminButton = await screen.findByRole('button', { name: 'Admin' })
    adminButton.focus()
    fireEvent.pointerDown(adminButton, { pointerId: 1, pointerType: 'mouse', button: 0 })
    fireEvent.click(adminButton)

    const dialog = await screen.findByRole('dialog', { name: 'Admin' })
    expect(document.activeElement).toBe(screen.getByLabelText('Local Admin password'))

    const closeButton = within(dialog).getByRole('button', { name: 'Close' })
    closeButton.focus()
    fireEvent.keyDown(closeButton, { key: 'Tab', shiftKey: true })
    const confirmButton = within(dialog).getByRole('button', { name: 'Confirm' })
    expect(document.activeElement).toBe(confirmButton)

    fireEvent.keyDown(confirmButton, { key: 'Tab' })
    expect(document.activeElement).toBe(closeButton)

    fireEvent.keyDown(closeButton, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(adminButton)
  })

  it('moves keyboard focus to spatially adjacent nodes without a pointer focus ring', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Admin' }))
    fireEvent.change(screen.getByLabelText('Local Admin password'), { target: { value: 'moltisantitree' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    for (const firstName of ['Ada', 'Zoe']) {
      fireEvent.click(screen.getByRole('button', { name: 'Add person' }))
      fireEvent.change(screen.getByLabelText('First name'), { target: { value: firstName } })
      fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Family' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    }

    const ada = await screen.findByRole('button', { name: 'Ada Family' })
    const zoe = screen.getByRole('button', { name: 'Zoe Family' })
    const getNodeX = (node: HTMLElement) => {
      const transform = node.parentElement?.getAttribute('transform')
      const match = transform && /^translate\(([-\d.]+) /.exec(transform)
      if (!match) throw new Error('The person node position is unavailable.')
      return Number(match[1])
    }
    const left = getNodeX(ada) < getNodeX(zoe) ? ada : zoe
    const right = left === ada ? zoe : ada
    fireEvent.pointerDown(left, { pointerId: 1, pointerType: 'mouse', button: 0 })
    fireEvent.click(left)
    expect(left).not.toHaveClass('keyboard-focused')

    fireEvent.keyDown(left, { key: 'ArrowRight' })

    expect(right).toHaveAttribute('aria-pressed', 'true')
    expect(right).toHaveClass('keyboard-focused')
    expect(document.activeElement).toBe(right)
  })

  it('selects the kinship comparison person directly from the tree', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Admin' }))
    fireEvent.change(screen.getByLabelText('Local Admin password'), { target: { value: 'moltisantitree' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    for (const firstName of ['Ada', 'Zoe']) {
      fireEvent.click(screen.getByRole('button', { name: 'Add person' }))
      fireEvent.change(screen.getByLabelText('First name'), { target: { value: firstName } })
      fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Family' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    }

    fireEvent.click(await screen.findByRole('button', { name: 'Ada Family' }))
    expect(screen.getByRole('heading', { name: 'Ada Family' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Select a person from the tree' }))
    expect(screen.getByRole('status')).toHaveTextContent('Select a person in the tree to compare.')

    fireEvent.click(screen.getByRole('button', { name: 'Zoe Family' }))

    expect(screen.getByRole('combobox', { name: 'Compare with' })).toHaveValue('Zoe Family')
    expect(screen.getByRole('heading', { name: 'Ada Family' })).toBeInTheDocument()
    expect(screen.queryByText('Select a person in the tree to compare.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear comparison person' }))

    expect(screen.getByRole('combobox', { name: 'Compare with' })).toHaveValue('')
    expect(screen.queryByText('Recorded relationship path')).not.toBeInTheDocument()
  }, 15_000)

  it('fetches the published archive without reusing a stale cached copy', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await screen.findByRole('button', { name: 'Admin' })
    const [url, options] = fetchMock.mock.calls[0]!
    expect(url).toMatch(/family-archive\.enc\.json\?v=\d+$/)
    expect(options).toMatchObject({ cache: 'no-store' })
  })

  it('lets an admin confirm and download a GEDZIP 7.0 package', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Admin' }))
    fireEvent.change(screen.getByLabelText('Local Admin password'), { target: { value: 'moltisantitree' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    fireEvent.click(screen.getByRole('button', { name: 'Export GEDZIP 7.0' }))

    expect(confirmSpy).toHaveBeenCalledWith(
      'The GEDZIP package will contain unencrypted genealogy data, notes, sources, and all photos and galleries. It does not include contact details. The file is not encrypted; keep it secure. Continue?',
    )
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(
      'GEDZIP 7.0 package with photos exported in plaintext.',
    ))
    const blob = createObjectURL.mock.calls[0]![0]
    if (!(blob instanceof Blob)) throw new Error('The GEDCOM download is not a Blob.')
    expect(blob.type).toBe('application/zip')
    const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    expect(Object.keys(zip)).toEqual(['gedcom.ged'])
    expect(new TextDecoder().decode(zip['gedcom.ged'])).toContain('2 VERS 7.0')
  })

  it('shows the loading spinner only on the export button in use', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    let finishExport: ((zip: Uint8Array) => void) | undefined
    vi.spyOn(gedzipModule, 'createGedzip').mockImplementation(() => new Promise((resolve) => {
      finishExport = resolve
    }))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:gedzip-test')
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Admin' }))
    fireEvent.change(screen.getByLabelText('Local Admin password'), { target: { value: 'moltisantitree' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    const plainExport = screen.getByRole('button', { name: 'Export plaintext JSON' })
    const gedzipExport = screen.getByRole('button', { name: 'Export GEDZIP 7.0' })
    fireEvent.click(gedzipExport)
    await waitFor(() => expect(gedzipModule.createGedzip).toHaveBeenCalled())
    expect(gedzipExport.querySelector('.button-spinner')).toBeInTheDocument()
    expect(plainExport.querySelector('.button-spinner')).not.toBeInTheDocument()

    await act(async () => finishExport?.(new Uint8Array()))
  })

  it('saves and displays the optional genealogy fields on a person', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Admin' }))
    fireEvent.change(screen.getByLabelText('Local Admin password'), { target: { value: 'moltisantitree' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add person' }))
    expect(screen.getByLabelText('Death date (YYYY-MM-DD)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Death date (optional)')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Alex' } })
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Family' } })
    fireEvent.change(screen.getByLabelText('Alternate name'), { target: { value: 'Alexandra Alias' } })
    fireEvent.change(screen.getByLabelText('Sex at birth'), { target: { value: 'F' } })
    const birthDate = screen.getByLabelText('Birth date (YYYY-MM-DD)') as HTMLInputElement
    fireEvent.change(birthDate, { target: { value: '19901024' } })
    expect(birthDate.value).toBe('1990-10-24')
    fireEvent.change(screen.getByLabelText('Occupation'), { target: { value: 'Researcher' } })
    fireEvent.change(screen.getByLabelText('Residence'), { target: { value: 'Rome' } })
    fireEvent.change(screen.getByLabelText('Nationality'), { target: { value: 'Italian' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Alexandra Alias')).toBeInTheDocument()
    expect(screen.getByText('Female')).toBeInTheDocument()
    expect(screen.getByText('Researcher')).toBeInTheDocument()
    expect(screen.getByText('Rome')).toBeInTheDocument()
    expect(screen.getByText('Italian')).toBeInTheDocument()
  })

  it('shows the recorded kinship path to a person selected from the detail search', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Admin' }))
    fireEvent.change(screen.getByLabelText('Local Admin password'), { target: { value: 'moltisantitree' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    for (const firstName of ['Parent', 'Child']) {
      fireEvent.click(screen.getByRole('button', { name: 'Add person' }))
      fireEvent.change(screen.getByLabelText('First name'), { target: { value: firstName } })
      fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Family' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    }

    fireEvent.click(screen.getByRole('button', { name: 'Parent Family' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a connection' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Person' }), { target: { value: 'Child' } })
    fireEvent.click(screen.getByRole('option', { name: 'Child Family' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    const comparePicker = screen.getByRole('combobox', { name: 'Compare with' })
    fireEvent.change(comparePicker, { target: { value: 'Child' } })
    fireEvent.click(screen.getByRole('option', { name: 'Child Family' }))

    expect(screen.getByText('Recorded relationship path')).toBeInTheDocument()
    expect(screen.getByText(/Relationship type:/)).toBeInTheDocument()
    const kinshipResult = document.querySelector<HTMLElement>('.kinship-result')
    if (!kinshipResult) throw new Error('The kinship result is not available.')
    expect(within(kinshipResult).getByText('Parent', { exact: true })).toBeInTheDocument()
    expect(screen.getByText(/Degree of kinship:/)).toBeInTheDocument()
    expect(screen.getByText('Degree 1')).toBeInTheDocument()
    expect(screen.getByText('Child', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('Parent-child links: 1')).toBeInTheDocument()
  })

  it('shows affinity and omits consanguinity degree for a partner of a child', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Admin' }))
    fireEvent.change(screen.getByLabelText('Local Admin password'), { target: { value: 'moltisantitree' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    for (const firstName of ['Parent', 'Child', 'Spouse']) {
      fireEvent.click(screen.getByRole('button', { name: 'Add person' }))
      fireEvent.change(screen.getByLabelText('First name'), { target: { value: firstName } })
      fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Family' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    }

    fireEvent.click(screen.getByRole('button', { name: 'Parent Family' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a connection' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Person' }), { target: { value: 'Child' } })
    fireEvent.click(screen.getByRole('option', { name: 'Child Family' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    fireEvent.click(screen.getByRole('button', { name: 'Child Family' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a connection' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Relationship type' }), { target: { value: 'union' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Person' }), { target: { value: 'Spouse' } })
    fireEvent.click(screen.getByRole('option', { name: 'Spouse Family' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    fireEvent.click(screen.getByRole('button', { name: 'Parent Family' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Compare with' }), { target: { value: 'Spouse' } })
    fireEvent.click(screen.getByRole('option', { name: 'Spouse Family' }))

    const result = document.querySelector<HTMLElement>('.kinship-result')
    if (!result) throw new Error('The kinship result is not available.')
    expect(within(result).getByText(/By affinity through Current marriage: Parent-in-law/)).toBeInTheDocument()
    expect(within(result).queryByText(/Degree of kinship:/)).not.toBeInTheDocument()
    expect(within(result).getByText('Partner links: 1')).toBeInTheDocument()
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

  it('loads a photo in the initial tree viewport without selecting its node', async () => {
    vi.spyOn(imageVariantModule, 'getImageVariant')
      .mockResolvedValue('data:image/jpeg;base64,dmFyaWFudA==')
    vi.spyOn(imageVariantModule, 'imageDataUrlToBlob')
      .mockReturnValue(new Blob(['variant'], { type: 'image/jpeg' }))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:app-tree-photo')
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const size = this.classList.contains('tree-stage') || this.classList.contains('tree-canvas')
      return {
        left: 0, top: 0, right: size ? 400 : 0, bottom: size ? 300 : 0,
        width: size ? 400 : 0, height: size ? 300 : 0,
        x: 0, y: 0, toJSON: () => ({}),
      }
    })
    vi.stubGlobal('IntersectionObserver', class {
      constructor() {}
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() { return [] }
      root = null
      rootMargin = '0px'
      thresholds = [0]
    })

    const archive: FamilyArchive = {
      schemaVersion: 1,
      people: [{
        id: 'photo-person',
        firstName: 'Ada',
        lastName: 'Lovelace',
        photo: 'data:image/jpeg;base64,cGhvdG8=',
      }],
      relationships: [],
    }
    vi.spyOn(cryptoModule, 'decryptArchive').mockResolvedValue(archive)
    await saveRememberedPassphrase('viewer photo test key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ format: 'test-envelope' }))))

    render(<App />)

    const personNode = await screen.findByRole('button', { name: 'Ada Lovelace' })
    const treeImage = personNode.querySelector('image')
    if (!treeImage) throw new Error('The selected tree node should contain an SVG image.')
    await waitFor(() => expect(imageVariantModule.getImageVariant).toHaveBeenCalledOnce())
    await waitFor(() => expect(treeImage.getAttribute('href')).toBe('blob:app-tree-photo'))
    expect(screen.queryByRole('heading', { name: 'Ada Lovelace' })).not.toBeInTheDocument()
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

  it('lets an admin remove a relationship without deleting either person', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Admin' }))
    fireEvent.change(screen.getByLabelText('Local Admin password'), { target: { value: 'moltisantitree' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add person' }))
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Parent' } })
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Family' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add person' }))
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Child' } })
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Family' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    fireEvent.click(screen.getByRole('button', { name: 'Parent Family' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a connection' }))
    fireEvent.change(screen.getByLabelText('Relationship type'), { target: { value: 'parent-child' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Person' }), { target: { value: 'Child' } })
    fireEvent.click(screen.getByRole('option', { name: 'Child Family' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByRole('button', { name: 'Remove connection with Child Family' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove connection with Child Family' }))

    expect(window.confirm).toHaveBeenCalledWith('Remove this connection? The people will not be deleted.')
    expect(screen.queryByRole('button', { name: 'Remove connection with Child Family' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Parent Family' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Child Family' })).toBeInTheDocument()
  })

  it('lets an admin record and distinguish a concluded marriage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Admin' }))
    fireEvent.change(screen.getByLabelText('Local Admin password'), { target: { value: 'moltisantitree' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    for (const firstName of ['Ada', 'Bea']) {
      fireEvent.click(screen.getByRole('button', { name: 'Add person' }))
      fireEvent.change(screen.getByLabelText('First name'), { target: { value: firstName } })
      fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Family' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    }

    fireEvent.click(screen.getByRole('button', { name: 'Ada Family' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a connection' }))
    fireEvent.change(screen.getByLabelText('Relationship type'), { target: { value: 'union' } })
    fireEvent.change(screen.getByLabelText('Union type'), { target: { value: 'marriage' } })
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'ended' } })
    fireEvent.change(screen.getByLabelText('Reason it ended'), { target: { value: 'divorce' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Person' }), { target: { value: 'Bea' } })
    fireEvent.click(screen.getByRole('option', { name: 'Bea Family' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText('Ended marriage')).toBeInTheDocument()
    expect(document.querySelector('.partner-heart-broken')).toBeInTheDocument()
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
    const personPicker = screen.getByRole('combobox', { name: 'Person' })
    fireEvent.change(personPicker, { target: { value: 'Bea' } })
    fireEvent.keyDown(personPicker, { key: 'ArrowDown' })
    fireEvent.keyDown(personPicker, { key: 'Enter' })
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
