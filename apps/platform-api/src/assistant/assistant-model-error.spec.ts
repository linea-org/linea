import {
  describeProviderFailure,
  providerStatus,
} from './assistant-model-error'

describe('provider failures', () => {
  it('reads the status the SDKs attach to their errors', () => {
    expect(providerStatus(Object.assign(new Error('x'), { status: 401 }))).toBe(
      401,
    )
    expect(providerStatus(new Error('plain'))).toBeNull()
    expect(providerStatus('nope')).toBeNull()
  })

  it.each([
    [401, 'rejected the API key'],
    [403, 'rejected the API key'],
    [404, 'does not offer this model'],
    [429, 'is limiting this key'],
    [503, 'having trouble'],
  ])('explains a %i', (status, fragment) => {
    expect(describeProviderFailure(status, 'OpenAI')).toContain(fragment)
    expect(describeProviderFailure(status, 'OpenAI')).toContain('OpenAI')
  })

  it('has no advice for other statuses', () => {
    expect(describeProviderFailure(400, 'OpenAI')).toBeNull()
  })
})
