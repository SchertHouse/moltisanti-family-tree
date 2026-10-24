const DATABASE_NAME = 'moltisanti-key-vault'
const STORE_NAME = 'credentials'
const RECORD_ID = 'archive-passphrase'

interface RememberedKeyRecord {
  id: string
  key: CryptoKey
  iv: string
  ciphertext: string
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Memorizzazione protetta non disponibile in questo browser.'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Impossibile aprire la memorizzazione protetta.'))
    request.onblocked = () => reject(new Error('Aggiornamento della memorizzazione protetta bloccato.'))
  })
}

function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Operazione di memorizzazione non riuscita.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Operazione di memorizzazione annullata.'))
  })
}

async function getRecord(): Promise<RememberedKeyRecord | undefined> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const done = complete(transaction)
    const request = transaction.objectStore(STORE_NAME).get(RECORD_ID)
    const record = await new Promise<RememberedKeyRecord | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as RememberedKeyRecord | undefined)
      request.onerror = () => reject(request.error ?? new Error('Impossibile leggere la chiave memorizzata.'))
    })
    await done
    return record
  } finally {
    database.close()
  }
}

export async function saveRememberedPassphrase(passphrase: string): Promise<void> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(passphrase))
  const record: RememberedKeyRecord = {
    id: RECORD_ID,
    key,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  }
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const done = complete(transaction)
    transaction.objectStore(STORE_NAME).put(record)
    await done
  } finally {
    database.close()
  }
}

export async function getRememberedPassphrase(): Promise<string | null> {
  const record = await getRecord()
  if (!record) return null
  if (!record.key || record.key.type !== 'secret' || record.key.algorithm.name !== 'AES-GCM' || record.key.extractable ||
    typeof record.iv !== 'string' || typeof record.ciphertext !== 'string') {
    await clearRememberedPassphrase()
    throw new Error('La chiave memorizzata non è valida.')
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(record.iv) },
      record.key,
      fromBase64(record.ciphertext),
    )
    return new TextDecoder('utf-8', { fatal: true }).decode(plaintext)
  } catch {
    await clearRememberedPassphrase()
    throw new Error('Impossibile decifrare la chiave memorizzata.')
  }
}

export async function clearRememberedPassphrase(): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const done = complete(transaction)
    transaction.objectStore(STORE_NAME).delete(RECORD_ID)
    await done
  } finally {
    database.close()
  }
}
