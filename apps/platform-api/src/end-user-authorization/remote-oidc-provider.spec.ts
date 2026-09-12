import { createHash } from 'node:crypto'
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
  type OidcApplicationConfiguration,
} from './oidc-provider'
import { RemoteOidcProvider } from './remote-oidc-provider'

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
  let configuration: OidcApplicationConfiguration
  let token = ''
  let keys: JWK[] = []

  beforeEach(async () => {
    server = createServer((request, response) => {
      response.setHeader('content-type', 'application/json')
      if (request.url?.includes('openid-configuration')) {
        response.end(
          JSON.stringify({
            issuer,
            authorization_endpoint: `${issuer}/authorize`,
            token_endpoint: `${issuer}/token`,
            jwks_uri: `${issuer}/jwks.json`,
            scopes_supported: ['openid'],
          }),
        )
        return
      }
      if (request.url === '/token') {
        response.end(JSON.stringify({ id_token: token }))
        return
      }
      if (request.url === '/jwks.json') {
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

  afterEach(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
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
