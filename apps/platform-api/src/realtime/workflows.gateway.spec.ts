import { type INestApplication, Logger, Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { IoAdapter } from '@nestjs/platform-socket.io'
import { repositories } from '@linea/db'
import { io, type Socket } from 'socket.io-client'
import {
  RealtimeTokenService,
  type RealtimeTokenPayload,
} from './realtime-token.service'
import { WorkflowsGateway } from './workflows.gateway'

jest.mock('@linea/db', () => ({
  db: {},
  repositories: {
    builderSocketAccess: { getBuilderSocketSessionExpiry: jest.fn() },
  },
}))

@Module({ providers: [RealtimeTokenService, WorkflowsGateway] })
class RealtimeTestModule {}

function event(client: Socket, name: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Missing ${name}`)), 2000)
    client.once(name, (payload: unknown) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}

const payload: RealtimeTokenPayload = {
  sessionId: 'session-1',
  userId: 'user-1',
  name: 'Ada Lovelace',
  image: null,
  workspaceId: 'workspace-1',
  workflowId: 'workflow-1',
}
const draft = {
  graph: { private: 'future draft' },
  updatedAt: new Date().toISOString(),
  savedBy: { userId: 'user-2', name: 'Grace' },
}

describe('workflow realtime authorization boundary', () => {
  let app: INestApplication
  let url: string
  const clients: Socket[] = []
  const lookup = jest.mocked(
    repositories.builderSocketAccess.getBuilderSocketSessionExpiry,
  )
  const sessions = new Map<string, { userId: string; expiresAt: Date }>()
  const members = new Set<string>()
  beforeEach(async () => {
    sessions.clear()
    members.clear()
    sessions.set(payload.sessionId, {
      userId: payload.userId,
      expiresAt: new Date(Date.now() + 60_000),
    })
    members.add(payload.userId)
    lookup.mockImplementation((_db, input) =>
      Promise.resolve(
        members.has(input.userId) &&
          sessions.get(input.sessionId)?.userId === input.userId
          ? sessions.get(input.sessionId)?.expiresAt
          : undefined,
      ),
    )
    app = await NestFactory.create(RealtimeTestModule, { logger: false })
    app.useWebSocketAdapter(new IoAdapter(app))
    await app.listen(0)
    url = await app.getUrl()
  })
  afterEach(async () => {
    for (const client of clients.splice(0)) client.disconnect()
    await app.close()
    jest.restoreAllMocks()
  })
  function socket(token: string) {
    const client = io(`${url}/v1/workflows`, {
      path: '/v1/socket.io',
      transports: ['websocket'],
      auth: { token },
      reconnection: false,
      autoConnect: false,
    })
    clients.push(client)
    return client
  }
  async function open(identity = payload) {
    const client = socket(app.get(RealtimeTokenService).mint(identity).token)
    const ready = event(client, 'presence')
    client.connect()
    await ready
    return client
  }
  it.each(['member removal', 'session revocation', 'session expiry'])(
    'blocks future drafts and presence after %s',
    async (revocation) => {
      const removed = await open()
      sessions.set('session-2', {
        userId: 'user-2',
        expiresAt: new Date(Date.now() + 60_000),
      })
      members.add('user-2')
      const joined = event(removed, 'presence')
      const observer = await open({
        ...payload,
        sessionId: 'session-2',
        userId: 'user-2',
        name: 'Grace',
      })
      await joined
      const drafts = jest.fn()
      const presence = jest.fn()
      removed.on('draft:updated', drafts)
      removed.on('presence', presence)
      if (revocation === 'member removal') members.delete(payload.userId)
      if (revocation === 'session revocation')
        sessions.delete(payload.sessionId)
      if (revocation === 'session expiry')
        sessions.set(payload.sessionId, {
          userId: payload.userId,
          expiresAt: new Date(0),
        })
      const disconnected = event(removed, 'disconnect')
      const updatedPresence = event(observer, 'presence')
      const delivered = event(observer, 'draft:updated')
      await app
        .get(WorkflowsGateway)
        .broadcastDraftUpdate(payload.workflowId, draft)
      await disconnected
      expect(await delivered).toEqual(draft)
      expect(await updatedPresence).toEqual([
        { userId: 'user-2', name: 'Grace', image: null },
      ])
      expect(drafts).not.toHaveBeenCalled()
      expect(presence).not.toHaveBeenCalled()
    },
  )
  it('drops an older broadcast overtaken while a viewer disconnects', async () => {
    const slowClient = await open()
    sessions.set('session-2', {
      userId: 'user-2',
      expiresAt: new Date(Date.now() + 60_000),
    })
    members.add('user-2')
    const observer = await open({
      ...payload,
      userId: 'user-2',
      sessionId: 'session-2',
    })
    let release: ((expiresAt: Date) => void) | undefined
    lookup.mockImplementation((_db, input) =>
      input.userId === payload.userId
        ? new Promise<Date>((resolve) => {
            release = resolve
          })
        : Promise.resolve(new Date(Date.now() + 60_000)),
    )
    const received = jest.fn()
    observer.on('draft:updated', received)
    const gateway = app.get(WorkflowsGateway)
    const older = gateway.broadcastDraftUpdate(payload.workflowId, draft)
    const left = event(observer, 'presence')
    slowClient.disconnect()
    await left
    const newer = { ...draft, graph: { revision: 'newer' } }
    const delivered = event(observer, 'draft:updated')
    await gateway.broadcastDraftUpdate(payload.workflowId, newer)
    expect(await delivered).toEqual(newer)
    if (!release) throw new Error('Authorization check did not start')
    release(new Date(Date.now() + 60_000))
    await older
    const barrier = { ...draft, graph: { revision: 'barrier' } }
    const flushed = event(observer, 'draft:updated')
    await gateway.broadcastDraftUpdate(payload.workflowId, barrier)
    expect(await flushed).toEqual(barrier)
    expect(received).toHaveBeenCalledTimes(2)
    expect(received).toHaveBeenNthCalledWith(1, newer)
    expect(received).toHaveBeenNthCalledWith(2, barrier)
  })
  it('revalidates presence delivery without a draft save', async () => {
    const removed = await open()
    const received = jest.fn()
    removed.on('presence', received)
    sessions.delete(payload.sessionId)
    sessions.set('session-2', {
      userId: 'user-2',
      expiresAt: new Date(Date.now() + 60_000),
    })
    members.add('user-2')
    const disconnected = event(removed, 'disconnect')
    const observer = socket(
      app.get(RealtimeTokenService).mint({
        ...payload,
        sessionId: 'session-2',
        userId: 'user-2',
        name: 'Grace',
      }).token,
    )
    const ready = event(observer, 'presence')
    observer.connect()
    await disconnected
    expect(await ready).toEqual([
      { userId: 'user-2', name: 'Grace', image: null },
    ])
    expect(received).not.toHaveBeenCalled()
  })
  it('keeps another valid session for the same member connected', async () => {
    const revoked = await open()
    sessions.set('other-session', {
      userId: payload.userId,
      expiresAt: new Date(Date.now() + 60_000),
    })
    const joined = event(revoked, 'presence')
    const valid = await open({ ...payload, sessionId: 'other-session' })
    await joined
    sessions.delete(payload.sessionId)
    const disconnected = event(revoked, 'disconnect')
    const delivered = event(valid, 'draft:updated')
    await app
      .get(WorkflowsGateway)
      .broadcastDraftUpdate(payload.workflowId, draft)
    await disconnected
    expect(await delivered).toEqual(draft)
    expect(valid.connected).toBe(true)
  })
  it.each([
    'removed member',
    'revoked session',
    'expired session',
    'different session user',
    'expired token',
  ])('rejects a stale handshake for %s', async (reason) => {
    const { token } = app.get(RealtimeTokenService).mint(payload)
    if (reason === 'removed member') members.clear()
    if (reason === 'revoked session') sessions.clear()
    if (reason === 'expired session')
      sessions.set(payload.sessionId, {
        userId: payload.userId,
        expiresAt: new Date(0),
      })
    if (reason === 'different session user')
      sessions.set(payload.sessionId, {
        userId: 'other',
        expiresAt: new Date(Date.now() + 60_000),
      })
    if (reason === 'expired token')
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000)
    const client = socket(token)
    const presence = jest.fn()
    client.on('presence', presence)
    const disconnected = event(client, 'disconnect')
    client.connect()
    await disconnected
    expect(presence).not.toHaveBeenCalled()
  })
  it('allows a valid client to reconnect with a freshly minted token and receive drafts', async () => {
    const client = await open()
    client.disconnect()
    client.auth = { token: app.get(RealtimeTokenService).mint(payload).token }
    const ready = event(client, 'presence')
    client.connect()
    await ready
    const delivered = event(client, 'draft:updated')
    await app
      .get(WorkflowsGateway)
      .broadcastDraftUpdate(payload.workflowId, draft)
    expect(await delivered).toEqual(draft)
    expect(lookup).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        sessionId: payload.sessionId,
        userId: payload.userId,
        workspaceId: payload.workspaceId,
      }),
    )
  })
  it('fails closed when authorization rejects', async () => {
    const client = await open()
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined)
    lookup.mockRejectedValue(new Error('database unavailable'))
    const disconnected = event(client, 'disconnect')
    const received = jest.fn()
    client.on('draft:updated', received)
    await app
      .get(WorkflowsGateway)
      .broadcastDraftUpdate(payload.workflowId, draft)
    await disconnected
    expect(received).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalled()
  })
  it('evicts idle revoked sockets on the periodic sweep', async () => {
    await app.close()
    const originalTimeout = global.setTimeout
    jest
      .spyOn(global, 'setTimeout')
      .mockImplementation((callback, ms, ...args) =>
        originalTimeout(callback, ms === 30_000 ? 20 : ms, ...args),
      )
    app = await NestFactory.create(RealtimeTestModule, { logger: false })
    app.useWebSocketAdapter(new IoAdapter(app))
    await app.listen(0)
    url = await app.getUrl()
    const client = await open()
    const disconnected = event(client, 'disconnect')
    members.clear()
    await disconnected
    expect(client.connected).toBe(false)
  })
  it('clears the sweep timer on shutdown', () => {
    jest.useFakeTimers()
    try {
      const gateway = new WorkflowsGateway(new RealtimeTokenService())
      gateway.onModuleInit()
      expect(jest.getTimerCount()).toBe(1)
      gateway.onModuleDestroy()
      expect(jest.getTimerCount()).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })
  it('bounds a stalled check and coalesces concurrent delivery checks', async () => {
    const client = await open()
    const received = jest.fn()
    client.on('draft:updated', received)
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    lookup.mockClear()
    lookup.mockImplementation(() => new Promise(() => undefined))
    const originalTimeout = global.setTimeout
    jest
      .spyOn(global, 'setTimeout')
      .mockImplementation((callback, ms, ...args) =>
        originalTimeout(callback, ms === 5_000 ? 20 : ms, ...args),
      )
    const disconnected = event(client, 'disconnect')
    const gateway = app.get(WorkflowsGateway)
    await Promise.all([
      gateway.broadcastDraftUpdate(payload.workflowId, draft),
      gateway.broadcastDraftUpdate(payload.workflowId, draft),
    ])
    await disconnected
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(received).not.toHaveBeenCalled()
  })
})
