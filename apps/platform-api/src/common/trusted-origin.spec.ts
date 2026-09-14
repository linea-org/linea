import { usesApplicationOriginPolicy } from './trusted-origin'

describe('usesApplicationOriginPolicy', () => {
  it.each([
    '/v1/user-sessions/authorization',
    '/v1/user-sessions/exchange',
    '/v1/user-sessions',
    '/v1/user-sessions/current',
    '/v1/user/conversations',
    '/v1/user/executions',
  ])('delegates %s to the Application allowlist', (path) => {
    expect(usesApplicationOriginPolicy(path)).toBe(true)
  })

  it('keeps other routes on the platform allowlist', () => {
    expect(usesApplicationOriginPolicy('/v1/applications')).toBe(false)
    expect(
      usesApplicationOriginPolicy('/v1/user-sessions/exchange/extra'),
    ).toBe(false)
  })
})
