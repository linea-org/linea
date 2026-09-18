import type { PublicErrorCode } from "@linea/protocol/errors"
import type { EventEnvelope, EventStreamQuery } from "@linea/protocol/events"
import {
  createEndUserConversationOperation,
  createEndUserMessageOperation,
  createEndUserSessionOperation,
  decideEndUserApprovalRequestOperation,
  exchangeEndUserAuthorizationOperation,
  getEndUserApprovalRequestOperation,
  getEndUserConversationOperation,
  getEndUserExecutionOperation,
  listEndUserApprovalRequestsOperation,
  listEndUserConversationsOperation,
  listEndUserMessagesOperation,
  revokeEndUserSessionOperation,
  startEndUserAuthorizationOperation,
  startEndUserExecutionOperation,
  streamEndUserEventsOperation,
} from "@linea/protocol/operations"
import type {
  ApprovalDecision,
  ApprovalRequest,
  ConversationProjection,
  CreateEndUserConversation,
  CreateMessage,
  DecideApprovalRequest,
  EndUserAuthorizationResponse,
  ListApprovalRequestsQuery,
  MessageProjection,
  PublicExecution,
  StartEndUserExecution,
} from "@linea/protocol/resources"
import type { PaginatedResponse, PaginationQuery } from "@linea/protocol/shared"
import { LineaExecutionHandle } from "./execution-handle.js"
import { readEventStream, waitForReconnect } from "./event-stream.js"
import {
  LineaUserApiError,
  LineaUserNetworkError,
  LineaUserProtocolError,
  LineaUserSessionError,
} from "./errors.js"
import {
  createDpopProof,
  createPkce,
  createProofKey,
  randomId,
} from "./proof.js"
import {
  createUserStateStore,
  type StoredUserSession,
  type StoredUserState,
  type UserStateStore,
} from "./state-store.js"
import {
  fetchResponse,
  isTerminalSessionCode,
  parseErrorResponse,
  parseJsonResponse,
} from "./transport.js"

const DEFAULT_BASE_URL = "http://localhost:3000"
const DEFAULT_RECONNECT_DELAY_MS = 1_000

type QueryValue = string | number | readonly string[] | undefined
type ResponseSchema<T> = { parse(value: unknown): T }
type SessionRequest = {
  method: string
  path: string
  query: Record<string, QueryValue> | undefined
  body: unknown
  lastEventId: string | undefined
  retryNetwork: boolean
  signal: AbortSignal | undefined
  idempotencyKey: string | undefined
}
type StreamConnection =
  | { outcome: "connected"; response: Response }
  | { outcome: "reconcile" }
  | { outcome: "retry" }

function shouldRetryNetwork(
  error: unknown,
  request: SessionRequest,
  alreadyRetried: boolean
): boolean {
  return (
    request.retryNetwork &&
    !alreadyRetried &&
    error instanceof LineaUserNetworkError
  )
}

export type LineaUserClientOptions = {
  applicationId: string
  baseUrl?: string
  fetch?: typeof fetch
  crypto?: Crypto
}

export type StartAuthorizationInput = { redirectUri: string }
export type CompleteAuthorizationInput = { code: string; state: string }
export type LineaUserSession = {
  applicationId: string
  externalSubjectId: string
  expiresAt: string
}
export type StreamEventsOptions = EventStreamQuery & {
  signal?: AbortSignal
  reconnectDelayMs?: number
}
export type UserEventUpdate =
  | { kind: "event"; event: EventEnvelope }
  | { kind: "reconciled"; approvalRequests: ApprovalRequest[] }

export class LineaUserClient {
  private readonly applicationId: string
  private readonly baseUrl: string
  private readonly fetchImplementation: typeof fetch
  private readonly cryptoImplementation: Crypto
  private readonly store: UserStateStore
  private statePromise: Promise<StoredUserState> | undefined

  constructor(options: LineaUserClientOptions) {
    this.applicationId = options.applicationId
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "")
    this.fetchImplementation = options.fetch ?? globalThis.fetch
    this.cryptoImplementation = options.crypto ?? globalThis.crypto
    if (!this.fetchImplementation) {
      throw new Error("LineaUserClient requires Fetch API support")
    }
    if (!this.cryptoImplementation?.subtle) {
      throw new Error("LineaUserClient requires Web Crypto API support")
    }
    this.store = createUserStateStore(`${this.baseUrl}|${this.applicationId}`)
  }

  async startAuthorization(
    input: StartAuthorizationInput
  ): Promise<EndUserAuthorizationResponse> {
    const pkce = await createPkce(this.cryptoImplementation)
    const body = startEndUserAuthorizationOperation.request.body.parse({
      applicationId: this.applicationId,
      redirectUri: input.redirectUri,
      codeChallenge: pkce.challenge,
    })
    const response = await this.requestWithoutSession(
      startEndUserAuthorizationOperation.method,
      startEndUserAuthorizationOperation.path,
      body,
      startEndUserAuthorizationOperation.response.body
    )
    const state = new URL(response.authorizationUrl).searchParams.get("state")
    if (!state) {
      throw new LineaUserProtocolError(
        startEndUserAuthorizationOperation.path,
        "Authorization URL has no state"
      )
    }
    const stored = await this.state()
    await this.save({
      ...stored,
      authorization: {
        state,
        redirectUri: input.redirectUri,
        codeVerifier: pkce.verifier,
      },
    })
    return response
  }

  async completeAuthorization(
    input: CompleteAuthorizationInput
  ): Promise<LineaUserSession> {
    const stored = await this.state()
    const authorization = stored.authorization
    if (authorization?.state !== input.state) {
      throw new LineaUserProtocolError(
        exchangeEndUserAuthorizationOperation.path,
        "OIDC callback state does not match the pending authorization"
      )
    }
    const exchangeBody =
      exchangeEndUserAuthorizationOperation.request.body.parse({
        applicationId: this.applicationId,
        redirectUri: authorization.redirectUri,
        code: input.code,
        state: input.state,
        codeVerifier: authorization.codeVerifier,
      })
    const exchange = await this.requestWithoutSession(
      exchangeEndUserAuthorizationOperation.method,
      exchangeEndUserAuthorizationOperation.path,
      exchangeBody,
      exchangeEndUserAuthorizationOperation.response.body
    )
    const proofKey = await createProofKey(this.cryptoImplementation)
    const sessionUrl = this.url(createEndUserSessionOperation.path)
    const proof = await createDpopProof({
      crypto: this.cryptoImplementation,
      privateKey: proofKey.privateKey,
      publicJwk: proofKey.publicJwk,
      method: createEndUserSessionOperation.method,
      url: sessionUrl,
      nonce: exchange.dpopNonce,
      accessToken: undefined,
      now: Date.now(),
    })
    const response = await fetchResponse(this.fetchImplementation, sessionUrl, {
      method: createEndUserSessionOperation.method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        DPoP: proof,
      },
      body: JSON.stringify(
        createEndUserSessionOperation.request.body.parse({
          exchangeToken: exchange.exchangeToken,
        })
      ),
    })
    const credential = await parseJsonResponse(
      response,
      createEndUserSessionOperation.path,
      createEndUserSessionOperation.response.body
    )
    const session: StoredUserSession = {
      accessToken: credential.accessToken,
      dpopNonce: response.headers.get("dpop-nonce") ?? credential.dpopNonce,
      expiresAt: credential.expiresAt,
      externalSubjectId: exchange.externalSubjectId,
      privateKey: proofKey.privateKey,
      publicJwk: proofKey.publicJwk,
    }
    await this.save({ authorization: undefined, session })
    return this.publicSession(session)
  }

  async session(): Promise<LineaUserSession | undefined> {
    const state = await this.state()
    const session = state.session
    if (!session) return undefined
    if (Date.parse(session.expiresAt) <= Date.now()) {
      await this.save({ ...state, session: undefined })
      return undefined
    }
    return this.publicSession(session)
  }

  async revoke(): Promise<void> {
    try {
      const response = await this.requestWithSession({
        method: revokeEndUserSessionOperation.method,
        path: revokeEndUserSessionOperation.path,
        query: undefined,
        body: undefined,
        lastEventId: undefined,
        retryNetwork: false,
        signal: undefined,
        idempotencyKey: undefined,
      })
      if (!response.ok) throw await parseErrorResponse(response, response.url)
    } finally {
      await this.save({ authorization: undefined, session: undefined })
    }
  }

  async createConversation(
    input: CreateEndUserConversation
  ): Promise<ConversationProjection> {
    const body = createEndUserConversationOperation.request.body.parse(input)
    return this.authorizedJson(
      createEndUserConversationOperation.method,
      createEndUserConversationOperation.path,
      body,
      createEndUserConversationOperation.response.body,
      undefined,
      randomId(this.cryptoImplementation)
    )
  }

  listConversations(
    query: Partial<PaginationQuery> = {}
  ): Promise<PaginatedResponse<ConversationProjection>> {
    const parsed = listEndUserConversationsOperation.request.query.parse(query)
    return this.authorizedJson(
      listEndUserConversationsOperation.method,
      listEndUserConversationsOperation.path,
      undefined,
      listEndUserConversationsOperation.response.body,
      parsed
    )
  }

  getConversation(conversationId: string): Promise<ConversationProjection> {
    const path = this.path(
      getEndUserConversationOperation.path,
      "conversationId",
      conversationId
    )
    return this.authorizedJson(
      getEndUserConversationOperation.method,
      path,
      undefined,
      getEndUserConversationOperation.response.body
    )
  }

  sendMessage(
    conversationId: string,
    input: CreateMessage
  ): Promise<MessageProjection> {
    const path = this.path(
      createEndUserMessageOperation.path,
      "conversationId",
      conversationId
    )
    const body = createEndUserMessageOperation.request.body.parse(input)
    return this.authorizedJson(
      createEndUserMessageOperation.method,
      path,
      body,
      createEndUserMessageOperation.response.body,
      undefined,
      randomId(this.cryptoImplementation)
    )
  }

  listMessages(
    conversationId: string,
    query: Partial<PaginationQuery> = {}
  ): Promise<PaginatedResponse<MessageProjection>> {
    const path = this.path(
      listEndUserMessagesOperation.path,
      "conversationId",
      conversationId
    )
    const parsed = listEndUserMessagesOperation.request.query.parse(query)
    return this.authorizedJson(
      listEndUserMessagesOperation.method,
      path,
      undefined,
      listEndUserMessagesOperation.response.body,
      parsed
    )
  }

  async startExecution(
    input: StartEndUserExecution
  ): Promise<LineaExecutionHandle> {
    const body = startEndUserExecutionOperation.request.body.parse(input)
    const execution = await this.authorizedJson(
      startEndUserExecutionOperation.method,
      startEndUserExecutionOperation.path,
      body,
      startEndUserExecutionOperation.response.body,
      undefined,
      randomId(this.cryptoImplementation)
    )
    return this.executionHandle(execution)
  }

  async getExecution(executionId: string): Promise<LineaExecutionHandle> {
    return this.executionHandle(await this.readExecution(executionId))
  }

  listApprovalRequests(
    query: Partial<ListApprovalRequestsQuery> = {}
  ): Promise<PaginatedResponse<ApprovalRequest>> {
    const parsed =
      listEndUserApprovalRequestsOperation.request.query.parse(query)
    return this.authorizedJson(
      listEndUserApprovalRequestsOperation.method,
      listEndUserApprovalRequestsOperation.path,
      undefined,
      listEndUserApprovalRequestsOperation.response.body,
      parsed
    )
  }

  getApprovalRequest(approvalRequestId: string): Promise<ApprovalRequest> {
    const path = this.path(
      getEndUserApprovalRequestOperation.path,
      "approvalRequestId",
      approvalRequestId
    )
    return this.authorizedJson(
      getEndUserApprovalRequestOperation.method,
      path,
      undefined,
      getEndUserApprovalRequestOperation.response.body
    )
  }

  decide(
    approvalRequestId: string,
    input: DecideApprovalRequest
  ): Promise<ApprovalDecision> {
    const path = this.path(
      decideEndUserApprovalRequestOperation.path,
      "approvalRequestId",
      approvalRequestId
    )
    const body = decideEndUserApprovalRequestOperation.request.body.parse(input)
    return this.authorizedJson(
      decideEndUserApprovalRequestOperation.method,
      path,
      body,
      decideEndUserApprovalRequestOperation.response.body,
      undefined,
      randomId(this.cryptoImplementation)
    )
  }

  async *streamEvents(
    options: StreamEventsOptions = {}
  ): AsyncGenerator<UserEventUpdate> {
    const query = streamEndUserEventsOperation.request.query.parse({
      conversationId: options.conversationId,
      eventType: options.eventType,
    })
    let cursor: string | undefined
    while (!options.signal?.aborted) {
      const connection = await this.openEventConnection(query, cursor, options)
      if (connection.outcome === "reconcile") {
        yield {
          kind: "reconciled",
          approvalRequests: await this.listAllApprovalRequests(),
        }
        cursor = undefined
        continue
      }
      if (connection.outcome === "retry") {
        await waitForReconnect(
          options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS,
          options.signal
        )
        continue
      }
      for await (const event of this.readEventConnection(connection.response)) {
        cursor = event.id
        yield { kind: "event", event }
      }
      await waitForReconnect(
        options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS,
        options.signal
      )
    }
  }

  private async openEventConnection(
    query: Record<string, QueryValue>,
    cursor: string | undefined,
    options: StreamEventsOptions
  ): Promise<StreamConnection> {
    try {
      const response = await this.requestWithSession({
        method: streamEndUserEventsOperation.method,
        path: streamEndUserEventsOperation.path,
        query,
        body: undefined,
        lastEventId: cursor,
        retryNetwork: false,
        signal: options.signal,
        idempotencyKey: undefined,
      })
      return { outcome: "connected", response }
    } catch (error) {
      if (options.signal?.aborted) return { outcome: "retry" }
      if (
        error instanceof LineaUserApiError &&
        error.code === "event_cursor_expired"
      ) {
        return { outcome: "reconcile" }
      }
      if (error instanceof LineaUserNetworkError) return { outcome: "retry" }
      throw error
    }
  }

  private async *readEventConnection(
    response: Response
  ): AsyncGenerator<EventEnvelope> {
    try {
      yield* readEventStream(response, streamEndUserEventsOperation.path)
    } catch (error) {
      if (!(error instanceof LineaUserNetworkError)) throw error
    }
  }

  private async requestWithoutSession<T>(
    method: string,
    path: string,
    body: unknown,
    schema: ResponseSchema<T>
  ): Promise<T> {
    const url = this.url(path)
    const response = await fetchResponse(this.fetchImplementation, url, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
    return parseJsonResponse(response, path, schema)
  }

  private async authorizedJson<T>(
    method: string,
    path: string,
    body: unknown,
    schema: ResponseSchema<T>,
    query?: Record<string, QueryValue>,
    idempotencyKey?: string
  ): Promise<T> {
    const response = await this.requestWithSession({
      method,
      path,
      query,
      body,
      lastEventId: undefined,
      retryNetwork: idempotencyKey !== undefined,
      signal: undefined,
      idempotencyKey,
    })
    return parseJsonResponse(response, path, schema)
  }

  private async requestWithSession(request: SessionRequest): Promise<Response> {
    let nonceRetried = false
    let networkRetried = false
    while (true) {
      const session = await this.requireSession()
      let response: Response
      try {
        response = await this.sendSessionRequest(request, session)
      } catch (error) {
        if (!shouldRetryNetwork(error, request, networkRetried)) throw error
        networkRetried = true
        continue
      }
      const challengedNonce = response.headers.get("dpop-nonce")
      const shouldRetryNonce =
        challengedNonce !== null &&
        challengedNonce !== session.dpopNonce &&
        response.status === 401 &&
        !nonceRetried
      if (challengedNonce && challengedNonce !== session.dpopNonce) {
        await this.updateNonce(challengedNonce)
      }
      if (shouldRetryNonce) {
        nonceRetried = true
        continue
      }
      if (!response.ok) {
        const error = await parseErrorResponse(response, request.path)
        await this.clearTerminalSession(error.code)
        throw error
      }
      return response
    }
  }

  private async sendSessionRequest(
    request: SessionRequest,
    session: StoredUserSession
  ): Promise<Response> {
    const url = this.url(request.path, request.query)
    const proof = await createDpopProof({
      crypto: this.cryptoImplementation,
      privateKey: session.privateKey,
      publicJwk: session.publicJwk,
      method: request.method,
      url,
      nonce: session.dpopNonce,
      accessToken: session.accessToken,
      now: Date.now(),
    })
    const headers: Record<string, string> = {
      Accept:
        request.path === streamEndUserEventsOperation.path
          ? "text/event-stream"
          : "application/json",
      Authorization: `DPoP ${session.accessToken}`,
      DPoP: proof,
    }
    if (request.body !== undefined) headers["Content-Type"] = "application/json"
    if (request.idempotencyKey) {
      headers["Idempotency-Key"] = request.idempotencyKey
    }
    if (request.lastEventId) headers["Last-Event-ID"] = request.lastEventId
    return fetchResponse(this.fetchImplementation, url, {
      method: request.method,
      headers,
      body:
        request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: request.signal,
    })
  }

  private async readExecution(executionId: string): Promise<PublicExecution> {
    const path = this.path(
      getEndUserExecutionOperation.path,
      "executionId",
      executionId
    )
    return this.authorizedJson(
      getEndUserExecutionOperation.method,
      path,
      undefined,
      getEndUserExecutionOperation.response.body
    )
  }

  private executionHandle(execution: PublicExecution): LineaExecutionHandle {
    return new LineaExecutionHandle(execution, (executionId) =>
      this.readExecution(executionId)
    )
  }

  private async listAllApprovalRequests(): Promise<ApprovalRequest[]> {
    const approvalRequests: ApprovalRequest[] = []
    let cursor: string | undefined
    do {
      const page = await this.listApprovalRequests({ cursor, limit: 100 })
      approvalRequests.push(...page.data)
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    return approvalRequests
  }

  private async requireSession(): Promise<StoredUserSession> {
    const state = await this.state()
    if (!state.session) throw new LineaUserSessionError("session_unavailable")
    if (Date.parse(state.session.expiresAt) <= Date.now()) {
      await this.save({ ...state, session: undefined })
      throw new LineaUserSessionError("session_expired")
    }
    return state.session
  }

  private async clearTerminalSession(code: PublicErrorCode): Promise<void> {
    if (!isTerminalSessionCode(code)) return
    const state = await this.state()
    await this.save({ ...state, session: undefined })
  }

  private async updateNonce(dpopNonce: string): Promise<void> {
    const state = await this.state()
    if (!state.session) return
    await this.save({
      ...state,
      session: { ...state.session, dpopNonce },
    })
  }

  private publicSession(session: StoredUserSession): LineaUserSession {
    return {
      applicationId: this.applicationId,
      externalSubjectId: session.externalSubjectId,
      expiresAt: session.expiresAt,
    }
  }

  private state(): Promise<StoredUserState> {
    this.statePromise ??= this.store.load()
    return this.statePromise
  }

  private async save(state: StoredUserState): Promise<void> {
    await this.store.save(state)
    this.statePromise = Promise.resolve(state)
  }

  private path(template: string, name: string, value: string): string {
    return template.replace(`{${name}}`, encodeURIComponent(value))
  }

  private url(path: string, query?: Record<string, QueryValue>): string {
    const url = new URL(path, `${this.baseUrl}/`)
    for (const [name, value] of Object.entries(query ?? {})) {
      if (value === undefined) continue
      if (typeof value === "object") {
        for (const item of value) url.searchParams.append(name, item)
      } else {
        url.searchParams.set(name, String(value))
      }
    }
    return url.toString()
  }
}
