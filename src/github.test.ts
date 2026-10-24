import { afterEach, describe, expect, it, vi } from 'vitest'
import { publishEncryptedArchive } from './github'

describe('GitHub encrypted archive publishing', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('updates the encrypted blob using the existing SHA and UTF-8 content', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: 'existing-sha' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await publishEncryptedArchive({
      owner: 'family', repo: 'tree', branch: 'main',
      path: 'public/family-archive.enc.json', token: 'temporary-token',
    }, '{"label":"famiglia"}')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [url, request] = fetchMock.mock.calls[1]!
    expect(url).toContain('/public/family-archive.enc.json')
    expect(request.headers.Authorization).toBe('Bearer temporary-token')
    expect(request.body).toContain('"sha":"existing-sha"')
    const body = JSON.parse(request.body)
    const decoded = Uint8Array.from(atob(body.content), (character) => character.charCodeAt(0))
    expect(new TextDecoder().decode(decoded)).toBe('{"label":"famiglia"}')
  })

  it('reports conflicts and validates credentials without making network requests', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(new Response('{}', { status: 409 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(publishEncryptedArchive({
      owner: 'family', repo: 'tree', branch: 'main', path: 'archive.json', token: 'token',
    }, '{}')).rejects.toThrow(/Conflitto/)

    fetchMock.mockClear()
    await expect(publishEncryptedArchive({
      owner: 'family', repo: 'tree', branch: 'main', path: 'archive.json', token: '',
    }, '{}')).rejects.toThrow(/token GitHub/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
