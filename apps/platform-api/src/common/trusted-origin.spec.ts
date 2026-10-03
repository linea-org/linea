import { usesEnvironmentOriginPolicy } from './trusted-origin'

describe('usesEnvironmentOriginPolicy', () => {
  it.each([
    '/v1/user-sessions/authorization',
    '/v1/user-sessions/exchange',
    '/v1/user-sessions',
    '/v1/user-sessions/current',
    '/v1/user/conversations',
    '/v1/user/executions',
  ])('delegates %s to the Environment allowlist', (path) => {
    expect(usesEnvironmentOriginPolicy(path)).toBe(true)
  })
  it('keeps other routes on the platform allowlist', () => {
    expect(usesEnvironmentOriginPolicy('/v1/environments')).toBe(false)
    expect(
      usesEnvironmentOriginPolicy('/v1/user-sessions/exchange/extra'),
    ).toBe(false)
  })
})
