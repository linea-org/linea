import { RealtimeTokenService } from './realtime-token.service'

describe('RealtimeTokenService', () => {
  it('mints a token that consumes back to the same payload', () => {
    const service = new RealtimeTokenService()
    const payload = {
      userId: 'user-1',
      name: 'Ada Lovelace',
      image: null,
      workspaceId: 'workspace-1',
      workflowId: 'workflow-1',
    }

    const { token } = service.mint(payload)
    expect(service.consume(token)).toEqual(payload)
  })

  it('stays valid across repeated consumes within the TTL, for reconnect attempts', () => {
    const service = new RealtimeTokenService()
    const { token } = service.mint({
      userId: 'user-1',
      name: 'Ada Lovelace',
      image: null,
      workspaceId: 'workspace-1',
      workflowId: 'workflow-1',
    })

    expect(service.consume(token)).toBeDefined()
    expect(service.consume(token)).toBeDefined()
  })

  it('returns undefined for an unknown token', () => {
    const service = new RealtimeTokenService()
    expect(service.consume('not-a-real-token')).toBeUndefined()
  })

  it('expires a token after its TTL', () => {
    jest.useFakeTimers()
    try {
      const service = new RealtimeTokenService()
      const { token } = service.mint({
        userId: 'user-1',
        name: 'Ada Lovelace',
        image: null,
        workspaceId: 'workspace-1',
        workflowId: 'workflow-1',
      })

      jest.advanceTimersByTime(61_000)
      expect(service.consume(token)).toBeUndefined()
    } finally {
      jest.useRealTimers()
    }
  })
})
