import {
  createApplicationSchema,
  updateApplicationProfileSchema,
} from './application-input.dto'

function trust(protocol: 'http' | 'https') {
  return {
    allowedBrowserOrigins: [`${protocol}://app.example.com/`],
    allowedRedirectOrigins: [`${protocol}://app.example.com`, 'example-app://'],
    oidcIssuer: `${protocol}://identity.example.com`,
    oidcClientId: 'client-id',
    oidcAudience: 'linea',
    oidcJwksUrl: `${protocol}://identity.example.com/.well-known/jwks.json`,
    oidcSubjectClaim: 'sub',
  }
}

describe('application input', () => {
  it('accepts dev trust configuration and canonicalizes origins', () => {
    const parsed = createApplicationSchema.parse({
      environment: 'dev',
      displayName: 'Customer portal',
      trust: {
        ...trust('http'),
        allowedBrowserOrigins: [
          'http://app.example.com/',
          'http://app.example.com',
        ],
      },
    })
    expect(parsed.trust.allowedBrowserOrigins).toEqual([
      'http://app.example.com',
    ])
    expect(parsed.trust.allowedRedirectOrigins).toEqual([
      'http://app.example.com',
      'example-app://',
    ])
  })
  it('allows only dev or production and requires secure production trust', () => {
    expect(
      createApplicationSchema.safeParse({
        environment: 'draft',
        displayName: 'Builder',
        trust: trust('https'),
      }).success,
    ).toBe(false)
    expect(
      createApplicationSchema.safeParse({
        environment: 'production',
        displayName: 'Customer portal',
        trust: trust('http'),
      }).success,
    ).toBe(false)
    expect(
      createApplicationSchema.safeParse({
        environment: 'production',
        displayName: 'Customer portal',
        trust: trust('https'),
      }).success,
    ).toBe(true)
  })
  it('rejects origin paths and empty profile updates', () => {
    expect(
      createApplicationSchema.safeParse({
        environment: 'dev',
        displayName: 'Customer portal',
        trust: {
          ...trust('https'),
          allowedBrowserOrigins: ['https://app.example.com/path'],
        },
      }).success,
    ).toBe(false)
    expect(updateApplicationProfileSchema.safeParse({}).success).toBe(false)
    expect(
      updateApplicationProfileSchema.safeParse({ environment: 'dev' }).success,
    ).toBe(false)
  })
})
