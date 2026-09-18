import { createHash, randomUUID } from 'node:crypto'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from 'jose-v5'

type AuthorizationCode = {
  challenge: string
  clientId: string
  nonce: string
  redirectUri: string
  subject: string
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function challenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(value))
}

export async function startTestIdentityProvider() {
  const { privateKey, publicKey } = await generateKeyPair('ES256')
  const publicJwk = await exportJWK(publicKey)
  publicJwk.kid = 'launch-key'
  const codes = new Map<string, AuthorizationCode>()
  let issuer = ''
  let nextSubject = 'launch-subject'
  const handleRequest = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    const url = new URL(request.url ?? '/', issuer)
    if (
      request.method === 'GET' &&
      url.pathname === '/.well-known/openid-configuration'
    ) {
      json(response, 200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
      })
      return
    }
    if (request.method === 'GET' && url.pathname === '/jwks') {
      json(response, 200, { keys: [publicJwk] })
      return
    }
    if (request.method === 'GET' && url.pathname === '/authorize') {
      const code = randomUUID()
      const redirectUri = url.searchParams.get('redirect_uri')
      const clientId = url.searchParams.get('client_id')
      const nonce = url.searchParams.get('nonce')
      const codeChallenge = url.searchParams.get('code_challenge')
      const state = url.searchParams.get('state')
      if (!redirectUri || !clientId || !nonce || !codeChallenge || !state) {
        json(response, 400, { error: 'invalid_request' })
        return
      }
      codes.set(code, {
        challenge: codeChallenge,
        clientId,
        nonce,
        redirectUri,
        subject: nextSubject,
      })
      const redirect = new URL(redirectUri)
      redirect.searchParams.set('code', code)
      redirect.searchParams.set('state', state)
      response.writeHead(302, { location: redirect.toString() })
      response.end()
      return
    }
    if (request.method === 'POST' && url.pathname === '/token') {
      const form = new URLSearchParams(await readBody(request))
      const code = form.get('code')
      const verifier = form.get('code_verifier')
      const authorization = code ? codes.get(code) : undefined
      if (
        !code ||
        !verifier ||
        !authorization ||
        challenge(verifier) !== authorization.challenge ||
        form.get('client_id') !== authorization.clientId ||
        form.get('redirect_uri') !== authorization.redirectUri
      ) {
        json(response, 400, { error: 'invalid_grant' })
        return
      }
      codes.delete(code)
      json(response, 200, {
        id_token: await identityToken(privateKey, issuer, authorization),
      })
      return
    }
    json(response, 404, { error: 'not_found' })
  }
  const server = createServer((request, response) => {
    void handleRequest(request, response).catch((error: unknown) =>
      response.destroy(
        error instanceof Error ? error : new Error(String(error)),
      ),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Test identity provider did not bind a TCP port')
  issuer = `http://127.0.0.1:${address.port}`
  return {
    issuer,
    jwksUrl: `${issuer}/jwks`,
    setSubject(subject: string): void {
      nextSubject = subject
    },
    close(): Promise<void> {
      return new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    },
  }
}

async function identityToken(
  privateKey: KeyLike,
  issuer: string,
  authorization: AuthorizationCode,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ nonce: authorization.nonce })
    .setProtectedHeader({ alg: 'ES256', kid: 'launch-key' })
    .setIssuer(issuer)
    .setSubject(authorization.subject)
    .setAudience(authorization.clientId)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey)
}
