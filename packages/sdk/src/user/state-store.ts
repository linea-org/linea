type AuthorizationState = {
  state: string
  redirectUri: string
  codeVerifier: string
}

export type StoredUserSession = {
  accessToken: string
  dpopNonce: string
  expiresAt: string
  externalSubjectId: string
  privateKey: CryptoKey
  publicJwk: JsonWebKey
}

export type StoredUserState = {
  authorization: AuthorizationState | undefined
  session: StoredUserSession | undefined
}

export interface UserStateStore {
  load(): Promise<StoredUserState>
  save(state: StoredUserState): Promise<void>
}

function databaseError(error: DOMException | null): Error {
  return error ?? new Error("IndexedDB operation failed")
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null
}

function isStoredUserState(value: unknown): value is StoredUserState {
  if (
    !isObject(value) ||
    !("authorization" in value) ||
    !("session" in value)
  ) {
    return false
  }
  const authorization = value.authorization
  const session = value.session
  const validAuthorization =
    authorization === undefined ||
    (isObject(authorization) &&
      "state" in authorization &&
      typeof authorization.state === "string" &&
      "redirectUri" in authorization &&
      typeof authorization.redirectUri === "string" &&
      "codeVerifier" in authorization &&
      typeof authorization.codeVerifier === "string")
  const validSession =
    session === undefined ||
    (isObject(session) &&
      "accessToken" in session &&
      typeof session.accessToken === "string" &&
      "dpopNonce" in session &&
      typeof session.dpopNonce === "string" &&
      "expiresAt" in session &&
      typeof session.expiresAt === "string" &&
      Number.isFinite(Date.parse(session.expiresAt)) &&
      "externalSubjectId" in session &&
      typeof session.externalSubjectId === "string" &&
      "privateKey" in session &&
      typeof CryptoKey !== "undefined" &&
      session.privateKey instanceof CryptoKey &&
      session.privateKey.type === "private" &&
      !session.privateKey.extractable &&
      session.privateKey.algorithm.name === "ECDSA" &&
      session.privateKey.usages.length === 1 &&
      session.privateKey.usages[0] === "sign" &&
      "publicJwk" in session &&
      isObject(session.publicJwk) &&
      !("d" in session.publicJwk) &&
      "x" in session.publicJwk &&
      typeof session.publicJwk.x === "string" &&
      "y" in session.publicJwk &&
      typeof session.publicJwk.y === "string")
  return validAuthorization && validSession
}

class MemoryUserStateStore implements UserStateStore {
  private state: StoredUserState = {
    authorization: undefined,
    session: undefined,
  }

  async load(): Promise<StoredUserState> {
    return this.state
  }

  async save(state: StoredUserState): Promise<void> {
    this.state = state
  }
}

class IndexedDbUserStateStore implements UserStateStore {
  constructor(private readonly key: string) {}

  async load(): Promise<StoredUserState> {
    const database = await this.open()
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("state", "readonly")
      const request = transaction.objectStore("state").get(this.key)
      request.onerror = () => reject(databaseError(request.error))
      request.onsuccess = () => {
        const result: unknown = request.result
        if (result === undefined) {
          resolve({ authorization: undefined, session: undefined })
          return
        }
        if (isStoredUserState(result)) resolve(result)
        else reject(new Error("Stored Linea user state is invalid"))
      }
    })
  }

  async save(state: StoredUserState): Promise<void> {
    const database = await this.open()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("state", "readwrite")
      transaction.onerror = () => reject(databaseError(transaction.error))
      transaction.oncomplete = () => resolve()
      transaction.objectStore("state").put(state, this.key)
    })
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("linea-user-sdk", 1)
      request.onerror = () => reject(databaseError(request.error))
      request.onsuccess = () => resolve(request.result)
      request.onupgradeneeded = () => request.result.createObjectStore("state")
    })
  }
}

export function createUserStateStore(key: string): UserStateStore {
  return typeof indexedDB === "undefined"
    ? new MemoryUserStateStore()
    : new IndexedDbUserStateStore(key)
}
