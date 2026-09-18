import { LineaUserProtocolError } from "./errors.js"
import { randomId } from "./proof.js"

export type LineaUserProofKey = {
  id: string
  publicJwk: JsonWebKey
}

export interface LineaUserProofKeyStore {
  create(): Promise<LineaUserProofKey>
  sign(id: string, data: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer>
  remove(id: string): Promise<void>
}

function databaseError(error: DOMException | null): Error {
  return error ?? new Error("IndexedDB operation failed")
}

function requirePrivateKey(value: unknown): CryptoKey {
  if (
    typeof CryptoKey === "undefined" ||
    !(value instanceof CryptoKey) ||
    value.type !== "private" ||
    value.extractable ||
    value.algorithm.name !== "ECDSA" ||
    value.usages.length !== 1 ||
    value.usages[0] !== "sign"
  ) {
    throw new Error("Stored Linea proof key is invalid")
  }
  return value
}

async function createProofKey(
  crypto: Crypto
): Promise<{ privateKey: CryptoKey; publicJwk: JsonWebKey }> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"]
  )
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey)
  if (!publicJwk.x || !publicJwk.y || publicJwk.d) {
    throw new LineaUserProtocolError(
      "DPoP proof key",
      "Missing or unsafe JWK coordinates"
    )
  }
  return { privateKey: keyPair.privateKey, publicJwk }
}

abstract class WebCryptoProofKeyStore implements LineaUserProofKeyStore {
  constructor(protected readonly crypto: Crypto) {}

  async create(): Promise<LineaUserProofKey> {
    const id = randomId(this.crypto)
    const proofKey = await createProofKey(this.crypto)
    await this.save(id, proofKey.privateKey)
    return { id, publicJwk: proofKey.publicJwk }
  }

  async sign(id: string, data: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
    return this.crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      await this.load(id),
      data
    )
  }

  abstract remove(id: string): Promise<void>
  protected abstract load(id: string): Promise<CryptoKey>
  protected abstract save(id: string, key: CryptoKey): Promise<void>
}

class MemoryProofKeyStore extends WebCryptoProofKeyStore {
  private readonly keys = new Map<string, CryptoKey>()

  async remove(id: string): Promise<void> {
    this.keys.delete(id)
  }

  protected async load(id: string): Promise<CryptoKey> {
    return requirePrivateKey(this.keys.get(id))
  }

  protected async save(id: string, key: CryptoKey): Promise<void> {
    this.keys.set(id, key)
  }
}

class IndexedDbProofKeyStore extends WebCryptoProofKeyStore {
  constructor(
    crypto: Crypto,
    private readonly namespace: string
  ) {
    super(crypto)
  }

  async remove(id: string): Promise<void> {
    const database = await this.open()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("proof-keys", "readwrite")
      transaction.onerror = () => reject(databaseError(transaction.error))
      transaction.oncomplete = () => resolve()
      transaction.objectStore("proof-keys").delete(this.key(id))
    })
  }

  protected async load(id: string): Promise<CryptoKey> {
    const database = await this.open()
    return new Promise((resolve, reject) => {
      const request = database
        .transaction("proof-keys", "readonly")
        .objectStore("proof-keys")
        .get(this.key(id))
      request.onerror = () => reject(databaseError(request.error))
      request.onsuccess = () => {
        try {
          resolve(requirePrivateKey(request.result))
        } catch (error) {
          reject(
            error instanceof Error
              ? error
              : new Error("Stored Linea proof key is invalid", { cause: error })
          )
        }
      }
    })
  }

  protected async save(id: string, key: CryptoKey): Promise<void> {
    const database = await this.open()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("proof-keys", "readwrite")
      transaction.onerror = () => reject(databaseError(transaction.error))
      transaction.oncomplete = () => resolve()
      transaction.objectStore("proof-keys").put(key, this.key(id))
    })
  }

  private key(id: string): string {
    return `${this.namespace}|${id}`
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("linea-user-sdk", 2)
      request.onerror = () => reject(databaseError(request.error))
      request.onsuccess = () => resolve(request.result)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("state")) {
          request.result.createObjectStore("state")
        }
        if (!request.result.objectStoreNames.contains("proof-keys")) {
          request.result.createObjectStore("proof-keys")
        }
      }
    })
  }
}

export function createProofKeyStore(
  crypto: Crypto,
  namespace: string,
  platformStore: LineaUserProofKeyStore | undefined
): LineaUserProofKeyStore {
  if (platformStore) return platformStore
  return typeof indexedDB === "undefined"
    ? new MemoryProofKeyStore(crypto)
    : new IndexedDbProofKeyStore(crypto, namespace)
}
