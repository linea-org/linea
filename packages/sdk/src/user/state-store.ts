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
  proofKeyId: string
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

export interface LineaUserStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

function databaseError(error: DOMException | null): Error {
  return error ?? new Error("IndexedDB operation failed")
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null
}

function isAuthorizationState(value: unknown): value is AuthorizationState {
  return (
    isObject(value) &&
    "state" in value &&
    typeof value.state === "string" &&
    "redirectUri" in value &&
    typeof value.redirectUri === "string" &&
    "codeVerifier" in value &&
    typeof value.codeVerifier === "string"
  )
}

function isStoredUserSession(value: unknown): value is StoredUserSession {
  return (
    isObject(value) &&
    "accessToken" in value &&
    typeof value.accessToken === "string" &&
    "dpopNonce" in value &&
    typeof value.dpopNonce === "string" &&
    "expiresAt" in value &&
    typeof value.expiresAt === "string" &&
    Number.isFinite(Date.parse(value.expiresAt)) &&
    "externalSubjectId" in value &&
    typeof value.externalSubjectId === "string" &&
    "proofKeyId" in value &&
    typeof value.proofKeyId === "string" &&
    "publicJwk" in value &&
    isObject(value.publicJwk) &&
    !("d" in value.publicJwk) &&
    "x" in value.publicJwk &&
    typeof value.publicJwk.x === "string" &&
    "y" in value.publicJwk &&
    typeof value.publicJwk.y === "string"
  )
}

function parseStoredUserState(value: unknown): StoredUserState | undefined {
  if (!isObject(value)) return undefined
  const authorization = "authorization" in value ? value.authorization : null
  const session = "session" in value ? value.session : null
  if (authorization !== null && !isAuthorizationState(authorization)) {
    return undefined
  }
  if (session !== null && !isStoredUserSession(session)) return undefined
  return {
    authorization: authorization ?? undefined,
    session: session ?? undefined,
  }
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
        const state = parseStoredUserState(result)
        if (state) resolve(state)
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

class PlatformUserStateStore implements UserStateStore {
  constructor(
    private readonly key: string,
    private readonly storage: LineaUserStorage
  ) {}

  async load(): Promise<StoredUserState> {
    const serialized = await this.storage.getItem(this.key)
    if (serialized === null) {
      return { authorization: undefined, session: undefined }
    }
    let value: unknown
    try {
      value = JSON.parse(serialized)
    } catch (error) {
      throw new Error("Stored Linea user state is invalid", { cause: error })
    }
    const state = parseStoredUserState(value)
    if (!state) throw new Error("Stored Linea user state is invalid")
    return state
  }

  async save(state: StoredUserState): Promise<void> {
    if (!state.authorization && !state.session) {
      await this.storage.removeItem(this.key)
      return
    }
    await this.storage.setItem(
      this.key,
      JSON.stringify({
        authorization: state.authorization ?? null,
        session: state.session ?? null,
      })
    )
  }
}

export function createUserStateStore(
  key: string,
  storage: LineaUserStorage | undefined
): UserStateStore {
  if (storage)
    return new PlatformUserStateStore(`linea-user-sdk:${key}`, storage)
  return typeof indexedDB === "undefined"
    ? new MemoryUserStateStore()
    : new IndexedDbUserStateStore(key)
}
