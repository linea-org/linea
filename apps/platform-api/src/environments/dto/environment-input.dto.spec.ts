import {
  replaceEnvironmentTrustSchema,
  validateProductionEnvironmentTrust,
  updateEnvironmentProfileSchema,
  replaceConnectorAccessPolicySchema,
} from './environment-input.dto'

function trust(protocol: 'http' | 'https') {
  return {
    allowedBrowserOrigins: [
      protocol + '://app.example.com/',
      protocol + '://app.example.com',
    ],
    allowedRedirectOrigins: [protocol + '://app.example.com', 'example-app://'],
    oidcIssuer: protocol + '://identity.example.com',
    oidcClientId: 'client-id',
    oidcAudience: 'linea',
    oidcJwksUrl: protocol + '://identity.example.com/.well-known/jwks.json',
    oidcSubjectClaim: 'sub',
  }
}

describe('Environment configuration', () => {
  it('canonicalizes Development origins', () => {
    const parsed = replaceEnvironmentTrustSchema.parse(trust('http'))
    expect(parsed.allowedBrowserOrigins).toEqual(['http://app.example.com'])
    expect(parsed.allowedRedirectOrigins).toEqual([
      'http://app.example.com',
      'example-app://',
    ])
  })
  it('requires secure Production identity trust', () => {
    expect(() => validateProductionEnvironmentTrust(trust('http'))).toThrow()
    expect(validateProductionEnvironmentTrust(trust('https')).oidcIssuer).toBe(
      'https://identity.example.com',
    )
  })
  it('rejects paths, empty updates, and Environment identity changes', () => {
    expect(
      replaceEnvironmentTrustSchema.safeParse({
        ...trust('https'),
        allowedBrowserOrigins: ['https://app.example.com/path'],
      }).success,
    ).toBe(false)
    expect(updateEnvironmentProfileSchema.safeParse({}).success).toBe(false)
    expect(
      updateEnvironmentProfileSchema.safeParse({ environment: 'dev' }).success,
    ).toBe(false)
  })
  it('normalizes policy and rejects duplicate providers', () => {
    expect(
      replaceConnectorAccessPolicySchema.parse({
        providers: [
          {
            provider: 'test',
            actionFamilies: ['profile', 'profile'],
            maxScopes: ['write', 'read', 'read'],
          },
        ],
      }),
    ).toEqual({
      providers: [
        {
          provider: 'test',
          actionFamilies: ['profile'],
          maxScopes: ['read', 'write'],
        },
      ],
    })
    expect(
      replaceConnectorAccessPolicySchema.safeParse({
        providers: [
          { provider: 'test', actionFamilies: ['one'], maxScopes: ['read'] },
          { provider: 'test', actionFamilies: ['two'], maxScopes: ['write'] },
        ],
      }).success,
    ).toBe(false)
  })
})
