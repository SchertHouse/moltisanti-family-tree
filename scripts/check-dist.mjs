import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { URL } from 'node:url'

const root = new URL('../dist/', import.meta.url)
const credentials = /github_pat_[A-Za-z0-9_]{30,}|gh[pousr]_[A-Za-z0-9_]{30,}|BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY/
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.svg'])

async function inspect(directory) {
  for (const name of await readdir(directory)) {
    const path = join(directory, name)
    const entry = await stat(path)
    if (entry.isDirectory()) {
      await inspect(path)
      continue
    }
    if (imageExtensions.has(extname(name).toLowerCase())) {
      throw new Error(`Unexpected plaintext image in production assets: ${name}`)
    }
    const content = await readFile(path)
    if (credentials.test(content.toString('utf8'))) {
      throw new Error(`Potential credential found in production assets: ${name}`)
    }
    if (name === 'family-archive.enc.json') {
      const envelope = JSON.parse(content.toString('utf8'))
      if (
        envelope.format !== 'moltisanti-encrypted' ||
        envelope.formatVersion !== 1 ||
        envelope.algorithm !== 'AES-256-GCM' ||
        typeof envelope.ciphertext !== 'string' ||
        !envelope.salt ||
        !envelope.iv
      ) throw new Error('Published archive is not a supported encrypted envelope.')
    }
  }
}

await inspect(root.pathname)
