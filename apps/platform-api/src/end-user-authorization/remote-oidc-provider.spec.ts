import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import type { LookupAddress } from 'node:dns'
import { gzipSync } from 'node:zlib'
import { createServer, type Server } from 'node:http'
import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
  type KeyLike,
} from 'jose-v5'
import {
  OidcIdentityVerificationError,
  OidcProviderUnavailableError,
  type OidcEnvironmentConfiguration,
} from './oidc-provider'
import { RemoteOidcProvider } from './remote-oidc-provider'

jest.mock('node:dns/promises', () => {
  const actual =
    jest.requireActual<typeof import('node:dns/promises')>('node:dns/promises')
  return { ...actual, lookup: jest.fn(actual.lookup) }
})

const lookupAll: (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<LookupAddress[]> = lookup
const dns = jest.mocked(lookupAll)

const nonce = 'authorization-nonce'
const nonceHash = createHash('sha256').update(nonce).digest('hex')

type SigningKey = { privateKey: KeyLike; publicJwk: JWK; kid: string }

async function signingKey(kid: string): Promise<SigningKey> {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  return { privateKey, publicJwk: await exportJWK(publicKey), kid }
}

async function identityToken(
  key: SigningKey,
  claims: {
    issuer: string
    audience: string | string[]
    nonce: string
    expirationTime?: number | string
  },
): Promise<string> {
  return new SignJWT({
    nonce: claims.nonce,
    customer_id: 'customer-123',
    azp: 'customer-portal',
  })
    .setProtectedHeader({ alg: 'RS256', kid: key.kid })
    .setIssuer(claims.issuer)
    .setAudience(claims.audience)
    .setIssuedAt()
    .setExpirationTime(claims.expirationTime ?? '5m')
    .sign(key.privateKey)
}

describe('RemoteOidcProvider', () => {
  let server: Server
  let issuer: string
  let configuration: OidcEnvironmentConfiguration
  let token = ''
  let keys: JWK[] = []
  let failPath = ''
  let failure: 'redirect' | 'large' | 'slow' = 'redirect'
  let redirectTarget = 'http://169.254.169.254/'
  let tokenEndpoint: string | undefined
  const hits: string[] = []
  beforeEach(async () => {
    dns.mockImplementation(
      jest.requireActual<typeof import('node:dns/promises')>(
        'node:dns/promises',
      ).lookup,
    )
    jest.replaceProperty(process.env, 'NODE_ENV', 'development')
    failPath = ''
    tokenEndpoint = undefined
    hits.length = 0
    server = createServer((request, response) => {
      hits.push(request.url ?? '')
      response.setHeader('content-type', 'application/json')
      if (request.url === failPath) {
        if (failure === 'redirect') {
          response.writeHead(307, { location: redirectTarget })
          response.end()
        } else if (failure === 'large') {
          response.setHeader('content-encoding', 'gzip')
          response.end(gzipSync('x'.repeat(300 * 1024)))
        } else {
          response.write(' ')
          const timer = setInterval(() => response.write(' '), 50)
          response.on('close', () => clearInterval(timer))
        }
        return
      }
      if (request.url?.includes('openid-configuration')) {
        response.end(
          JSON.stringify({
            issuer,
            authorization_endpoint: `${issuer}/authorize`,
            token_endpoint: tokenEndpoint ?? `${issuer}/token`,
            jwks_uri: configuration.jwksUrl,
            scopes_supported: ['openid'],
          }),
        )
        return
      }
      if (request.url === '/token') {
        response.end(JSON.stringify({ id_token: token }))
        return
      }
      if (request.url?.startsWith('/jwks.json')) {
        response.end(JSON.stringify({ keys }))
        return
      }
      response.statusCode = 404
      response.end()
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('OIDC test server unavailable')
    issuer = `http://127.0.0.1:${address.port}`
    configuration = {
      environment: 'dev',
      issuer,
      clientId: 'customer-portal',
      audience: 'linea',
      jwksUrl: `${issuer}/jwks.json`,
      subjectClaim: 'customer_id',
    }
    token = ''
    keys = []
  })
  afterEach(() => jest.restoreAllMocks())
  afterEach(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  )
  const authorizationInput = {
    redirectUri: 'https://app.example.com/callback',
    codeChallenge: 'challenge',
    state: 'state',
    nonce,
  }
  const exchangeInput = {
    redirectUri: 'https://app.example.com/callback',
    code: 'authorization-code',
    codeVerifier: 'verifier',
    nonceHash,
  }
  it.each(['test', 'production'])(
    'rejects local dev providers when server NODE_ENV is %s',
    async (mode) => {
      jest.replaceProperty(process.env, 'NODE_ENV', mode)
      await expect(
        new RemoteOidcProvider().createAuthorizationUrl(
          configuration,
          authorizationInput,
        ),
      ).rejects.toBeInstanceOf(OidcProviderUnavailableError)
      expect(hits).toEqual([])
    },
  )
  it('never allows loopback in a production Environment even on a development server', async () => {
    await expect(
      new RemoteOidcProvider().createAuthorizationUrl(
        { ...configuration, environment: 'production' },
        authorizationInput,
      ),
    ).rejects.toBeInstanceOf(OidcProviderUnavailableError)
    expect(hits).toEqual([])
  })
  it.each([
    'dev',
    'production',
  ] satisfies OidcEnvironmentConfiguration['environment'][])(
    'blocks HTTPS loopback for %s on a production server',
    async (environment) => {
      jest.replaceProperty(process.env, 'NODE_ENV', 'production')
      await expect(
        new RemoteOidcProvider().createAuthorizationUrl(
          {
            ...configuration,
            environment,
            issuer: issuer.replace('http:', 'https:'),
            jwksUrl: configuration.jwksUrl.replace('http:', 'https:'),
          },
          authorizationInput,
        ),
      ).rejects.toBeInstanceOf(OidcProviderUnavailableError)
      expect(hits).toEqual([])
    },
  )
  it.each(['/token', '/jwks.json', '/.well-known/openid-configuration'])(
    'rejects redirects, oversized decoded responses and stalled bodies at %s',
    async (path) => {
      const key = await signingKey('limits')
      token = await identityToken(key, {
        issuer,
        audience: ['customer-portal', 'linea'],
        nonce,
      })
      failPath = path
      for (const kind of [
        'redirect',
        'large',
        'slow',
      ] satisfies (typeof failure)[]) {
        failure = kind
        hits.length = 0
        const operation = new RemoteOidcProvider().exchangeAuthorizationCode(
          configuration,
          exchangeInput,
        )
        await expect(operation).rejects.toBeInstanceOf(
          OidcProviderUnavailableError,
        )
        expect(hits.filter((hit) => hit === path)).toHaveLength(1)
      }
    },
    25_000,
  )
  it.each([
    'https://public.example/steal',
    'http://127.0.0.1/steal',
    'http://169.254.169.254/',
  ])('does not forward token credentials to redirect %s', async (target) => {
    failPath = '/token'
    failure = 'redirect'
    redirectTarget = target
    await expect(
      new RemoteOidcProvider().exchangeAuthorizationCode(
        configuration,
        exchangeInput,
      ),
    ).rejects.toBeInstanceOf(OidcProviderUnavailableError)
    expect(hits).toEqual(['/.well-known/openid-configuration', '/token'])
  })
  it.each(['10.0.0.1', '169.254.169.254', '::1', 'fc00::1', 'mixed'])(
    'blocks persisted private or mixed DNS targets (%s) in every network flow',
    async (address) => {
      const key = await signingKey('dns')
      for (const path of ['discovery', 'token', 'jwks']) {
        const host = 'https://identity.example.test'
        const config = {
          ...configuration,
          issuer: path === 'discovery' ? host : issuer,
          jwksUrl:
            path === 'jwks' ? `${host}/jwks.json` : `${issuer}/jwks.json`,
        }
        hits.length = 0
        tokenEndpoint = path === 'token' ? `${host}/token` : undefined
        token = await identityToken(key, {
          issuer: config.issuer,
          audience: ['customer-portal', 'linea'],
          nonce,
        })
        const lookup = dns.mockImplementation((hostname) =>
          Promise.resolve(
            hostname === 'identity.example.test'
              ? address === 'mixed'
                ? [
                    { address: '93.184.216.34', family: 4 },
                    { address: '10.0.0.1', family: 4 },
                  ]
                : [{ address, family: address.includes(':') ? 6 : 4 }]
              : [{ address: '127.0.0.1', family: 4 }],
          ),
        )
        if (path === 'jwks') configuration.jwksUrl = config.jwksUrl
        await expect(
          new RemoteOidcProvider().exchangeAuthorizationCode(
            config,
            exchangeInput,
          ),
        ).rejects.toBeInstanceOf(OidcProviderUnavailableError)
        expect(lookup).toHaveBeenCalledWith('identity.example.test', {
          all: true,
          verbatim: true,
        })
        expect(hits).toHaveLength(
          path === 'discovery' ? 0 : path === 'token' ? 1 : 2,
        )
        lookup.mockReset()
        configuration.jwksUrl = `${issuer}/jwks.json`
      }
    },
  )
  it('builds a client-direct Authorization Code with S256 PKCE request', async () => {
    const url = new URL(
      await new RemoteOidcProvider().createAuthorizationUrl(configuration, {
        redirectUri: 'https://app.example.com/callback',
        codeChallenge: 'challenge',
        state: 'state',
        nonce,
      }),
    )
    expect(url.origin + url.pathname).toBe(`${issuer}/authorize`)
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: 'code',
      client_id: configuration.clientId,
      redirect_uri: 'https://app.example.com/callback',
      state: 'state',
      nonce,
      code_challenge: 'challenge',
      code_challenge_method: 'S256',
    })
  })
  it('rejects cleartext non-loopback providers in development', async () => {
    await expect(
      new RemoteOidcProvider().createAuthorizationUrl(
        {
          ...configuration,
          issuer: 'http://identity.example.test',
          jwksUrl: 'http://identity.example.test/jwks.json',
        },
        {
          redirectUri: 'https://app.example.com/callback',
          codeChallenge: 'challenge',
          state: 'state',
          nonce,
        },
      ),
    ).rejects.toBeInstanceOf(OidcProviderUnavailableError)
  })
  it('validates claims and refreshes configured JWKS after rotation', async () => {
    const firstKey = await signingKey('first')
    const secondKey = await signingKey('second')
    keys = [{ ...firstKey.publicJwk, kid: firstKey.kid, use: 'sig' }]
    token = await identityToken(firstKey, {
      issuer,
      audience: [configuration.clientId, configuration.audience],
      nonce,
    })
    const provider = new RemoteOidcProvider()
    const input = {
      redirectUri: 'https://app.example.com/callback',
      code: 'authorization-code',
      codeVerifier: 'verifier',
      nonceHash,
    }
    await expect(
      provider.exchangeAuthorizationCode(configuration, input),
    ).resolves.toEqual({ issuerSubject: 'customer-123' })
    keys = [{ ...secondKey.publicJwk, kid: secondKey.kid, use: 'sig' }]
    token = await identityToken(secondKey, {
      issuer,
      audience: [configuration.clientId, configuration.audience],
      nonce,
    })
    await expect(
      provider.exchangeAuthorizationCode(configuration, input),
    ).resolves.toEqual({ issuerSubject: 'customer-123' })
  })
  it('reuses fresh JWKS, shares concurrent refresh, and expires discovery and keys after five minutes', async () => {
    const key = await signingKey('cache')
    keys = [{ ...key.publicJwk, kid: key.kid }]
    token = await identityToken(key, {
      issuer,
      audience: ['customer-portal', 'linea'],
      nonce,
    })
    const provider = new RemoteOidcProvider()
    await provider.createAuthorizationUrl(configuration, authorizationInput)
    await Promise.all(
      Array.from({ length: 3 }, () =>
        provider.exchangeAuthorizationCode(configuration, exchangeInput),
      ),
    )
    expect(hits.filter((path) => path === '/jwks.json')).toHaveLength(1)
    await provider.exchangeAuthorizationCode(configuration, exchangeInput)
    expect(hits.filter((path) => path === '/jwks.json')).toHaveLength(1)
    const now = Date.now()
    jest.spyOn(Date, 'now').mockReturnValue(now + 300_001)
    await provider.exchangeAuthorizationCode(configuration, exchangeInput)
    expect(hits.filter((path) => path === '/jwks.json')).toHaveLength(2)
    expect(
      hits.filter((path) => path.includes('openid-configuration')),
    ).toHaveLength(2)
  })
  it('evicts discovery and JWKS entries beyond the tenant cache bound', async () => {
    const baseIssuer = issuer
    const key = await signingKey('eviction')
    keys = [{ ...key.publicJwk, kid: key.kid }]
    const provider = new RemoteOidcProvider()
    for (let index = 0; index <= 100; index += 1) {
      issuer = `${baseIssuer}/tenant-${index}`
      configuration = {
        ...configuration,
        issuer,
        jwksUrl: `${baseIssuer}/jwks.json?tenant=${index}`,
      }
      tokenEndpoint = `${baseIssuer}/token`
      token = await identityToken(key, {
        issuer,
        audience: ['customer-portal', 'linea'],
        nonce,
      })
      await provider.exchangeAuthorizationCode(configuration, exchangeInput)
    }
    issuer = `${baseIssuer}/tenant-0`
    configuration = {
      ...configuration,
      issuer,
      jwksUrl: `${baseIssuer}/jwks.json?tenant=0`,
    }
    token = await identityToken(key, {
      issuer,
      audience: ['customer-portal', 'linea'],
      nonce,
    })
    await provider.exchangeAuthorizationCode(configuration, exchangeInput)
    expect(hits.filter((path) => path === '/jwks.json?tenant=0')).toHaveLength(
      2,
    )
    expect(
      hits.filter(
        (path) => path === '/tenant-0/.well-known/openid-configuration',
      ),
    ).toHaveLength(2)
  })
  it.each([
    [
      'issuer',
      {
        issuer: 'http://attacker.example.test',
        audience: ['customer-portal', 'linea'],
        nonce,
      },
    ],
    [
      'audience',
      { issuer: '', audience: ['customer-portal', 'other-api'], nonce },
    ],
    [
      'nonce',
      {
        issuer: '',
        audience: ['customer-portal', 'linea'],
        nonce: 'other-nonce',
      },
    ],
    [
      'expiry',
      {
        issuer: '',
        audience: ['customer-portal', 'linea'],
        nonce,
        expirationTime: 0,
      },
    ],
  ])('rejects a wrong %s binding', async (_name, claims) => {
    const key = await signingKey('claim-test')
    keys = [{ ...key.publicJwk, kid: key.kid, use: 'sig' }]
    token = await identityToken(key, {
      ...claims,
      issuer: claims.issuer || issuer,
    })
    await expect(
      new RemoteOidcProvider().exchangeAuthorizationCode(configuration, {
        redirectUri: 'https://app.example.com/callback',
        code: 'authorization-code',
        codeVerifier: 'verifier',
        nonceHash,
      }),
    ).rejects.toBeInstanceOf(OidcIdentityVerificationError)
  })
})
