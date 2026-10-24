export interface GitHubTarget {
  owner: string
  repo: string
  branch: string
  path: string
  token: string
}

interface ContentsResponse {
  sha?: string
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

export async function publishEncryptedArchive(target: GitHubTarget, content: string): Promise<void> {
  const { owner, repo, branch, path, token } = target
  if (![owner, repo, branch, path, token].every(Boolean)) throw new Error('Completa proprietario, repository, branch, percorso e token GitHub.')
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const existing = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, { headers })
  let sha: string | undefined
  if (existing.ok) {
    const previous: ContentsResponse = await existing.json() as ContentsResponse
    sha = previous.sha
  } else if (existing.status !== 404) {
    throw new Error(existing.status === 401 || existing.status === 403
      ? 'GitHub non ha autorizzato il token o il permesso Contents.'
      : `Impossibile leggere il file su GitHub (HTTP ${existing.status}).`)
  }
  const response = await fetch(apiUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: 'Update encrypted family archive',
      content: encodeBase64(content),
      branch,
      ...(sha ? { sha } : {}),
    }),
  })
  if (!response.ok) {
    throw new Error(response.status === 409 || response.status === 422
      ? 'Conflitto GitHub: ricarica l’archivio e riprova.'
      : response.status === 401 || response.status === 403
        ? 'GitHub ha rifiutato la pubblicazione: verifica il token e i permessi.'
        : `Pubblicazione GitHub non riuscita (HTTP ${response.status}).`)
  }
}
