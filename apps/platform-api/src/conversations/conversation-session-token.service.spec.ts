import { CONVERSATION_IDLE_THRESHOLD_MS } from '@linea/runtime'
import { ConversationSessionTokenService } from './conversation-session-token.service'

describe('ConversationSessionTokenService', () => {
  const secret = 'a-test-secret-long-enough-to-sign-conversation-sessions'
  const claims = {
    workspaceId: 'd7719a44-7495-4f01-a584-549f412279dc',
    workflowId: 'e5783184-2297-4973-a354-8ea9e9d2169a',
    conversationId: '17515f5c-3374-4107-a78d-9595ba2a3e52',
    externalSubjectId: 'customer-42',
  }
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = secret
    jest.useFakeTimers().setSystemTime(new Date('2026-09-07T12:00:00.000Z'))
  })
  afterEach(() => {
    jest.useRealTimers()
  })
  it('mints a token bound to the exact conversation tuple and shared idle window', () => {
    const service = new ConversationSessionTokenService()
    const minted = service.mint(claims)
    expect(minted.expiresAt).toBe(Date.now() + CONVERSATION_IDLE_THRESHOLD_MS)
    expect(service.verify(minted.token)).toEqual({
      ...claims,
      expiresAt: minted.expiresAt,
    })
  })
  it('mints a fresh token on every call and rejects expired or modified tokens', () => {
    const service = new ConversationSessionTokenService()
    const first = service.mint(claims)
    const second = service.mint(claims)
    expect(second.token).not.toBe(first.token)
    expect(service.verify(`${second.token}modified`)).toBeUndefined()
    jest.advanceTimersByTime(CONVERSATION_IDLE_THRESHOLD_MS)
    expect(service.verify(second.token)).toBeUndefined()
  })
})
