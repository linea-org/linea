import { usesApplicationOriginPolicy } from './trusted-origin'

describe('usesApplicationOriginPolicy', () => {
  it.each(['/v1/user-sessions/authorization', '/v1/user-sessions/exchange'])(
    'delegates %s to the Application allowlist',
    (path) => {
      expect(usesApplicationOriginPolicy(path)).toBe(true)
    },
  )

  it('keeps other routes on the platform allowlist', () => {
    expect(usesApplicationOriginPolicy('/v1/applications')).toBe(false)
    expect(
      usesApplicationOriginPolicy('/v1/user-sessions/exchange/extra'),
    ).toBe(false)
  })
})
