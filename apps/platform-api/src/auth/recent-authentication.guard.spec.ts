import { RECENT_AUTHENTICATION_WINDOW_SECONDS } from '@linea/auth/session-policy'
import { hasRecentAuthentication } from './recent-authentication.guard'

describe('hasRecentAuthentication', () => {
  const now = new Date('2026-09-09T12:00:00.000Z')
  it('accepts a session inside the configured freshness window', () => {
    const createdAt = new Date(
      now.getTime() - RECENT_AUTHENTICATION_WINDOW_SECONDS * 1000 + 1,
    )
    expect(hasRecentAuthentication(createdAt, now)).toBe(true)
  })
  it('rejects a missing or stale interactive session', () => {
    const createdAt = new Date(
      now.getTime() - RECENT_AUTHENTICATION_WINDOW_SECONDS * 1000,
    )
    expect(hasRecentAuthentication(undefined, now)).toBe(false)
    expect(hasRecentAuthentication(createdAt, now)).toBe(false)
  })
})
