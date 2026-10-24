import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { clearRememberedPassphrase, getRememberedPassphrase, saveRememberedPassphrase } from './rememberedKey'

const databaseName = 'moltisanti-key-vault'

function readSavedRecord(): Promise<Record<string, unknown> | undefined> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('credentials', 'readonly')
      const get = transaction.objectStore('credentials').get('archive-passphrase')
      get.onsuccess = () => {
        resolve(get.result as Record<string, unknown> | undefined)
        database.close()
      }
      get.onerror = () => {
        reject(get.error)
        database.close()
      }
    }
  })
}

afterEach(async () => {
  await clearRememberedPassphrase()
})

describe('remembered passphrase storage', () => {
  it('encrypts the passphrase at rest and can restore it', async () => {
    const passphrase = 'test-only family passphrase'
    await saveRememberedPassphrase(passphrase)

    const record = await readSavedRecord()
    expect(record).toBeDefined()
    expect(record).not.toHaveProperty('passphrase')
    expect(JSON.stringify(record)).not.toContain(passphrase)
    expect((record?.key as CryptoKey).extractable).toBe(false)
    expect(await getRememberedPassphrase()).toBe(passphrase)
  })

  it('removes a remembered passphrase when requested', async () => {
    await saveRememberedPassphrase('temporary test key')
    await clearRememberedPassphrase()

    expect(await getRememberedPassphrase()).toBeNull()
  })
})
