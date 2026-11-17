import { RECENT_AUTHENTICATION_WINDOW_SECONDS } from '@linealabs/auth/session-policy'
import { hasRecentAuthentication } from './recent-authentication.guard'

describe('hasRecentAuthentication', () => {
  const now = new Date('2026-09-09T12:00:00.000Z')
  const inside = new Date(
    now.getTime() - RECENT_AUTHENTICATION_WINDOW_SECONDS * 1000 + 1,
  )
  const outside = new Date(
    now.getTime() - RECENT_AUTHENTICATION_WINDOW_SECONDS * 1000,
  )
  it('accepts a session signed in inside the window', () => {
    expect(hasRecentAuthentication({ createdAt: inside }, now)).toBe(true)
  })
  it('accepts an old session with a recent authenticator code', () => {
    expect(
      hasRecentAuthentication({ createdAt: outside, stepUpAt: inside }, now),
    ).toBe(true)
  })
  it('rejects a missing or stale session', () => {
    expect(hasRecentAuthentication(undefined, now)).toBe(false)
    expect(hasRecentAuthentication({ createdAt: outside }, now)).toBe(false)
    expect(
      hasRecentAuthentication({ createdAt: outside, stepUpAt: outside }, now),
    ).toBe(false)
  })
})
