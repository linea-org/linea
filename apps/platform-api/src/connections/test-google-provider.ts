import { createHash, randomUUID } from 'node:crypto'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import {
  GoogleOAuthProvider,
  type GoogleOAuthProviderConfig,
} from './google-oauth-provider'

type Account = { id: string; email: string }
type Grant = { account: Account; challenge: string; scopes: string[] }
type Token = { account: Account; scopes: string[] }

function parameter(url: URL, name: string): string {
  const value = url.searchParams.get(name)
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function body(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

export async function startTestGoogleProvider() {
  const grants = new Map<string, Grant>()
  const accessTokens = new Map<string, Token>()
  const refreshTokens = new Map<string, Token>()
  let account = { id: 'google-account-one', email: 'one@example.com' }
  let deniedScope: string | undefined
  let failRevocation = false
  let lastRequestedScopes: string[] = []
  let refreshCount = 0
  const authorize = (url: URL, response: ServerResponse): void => {
    const redirectUri = parameter(url, 'redirect_uri')
    const state = parameter(url, 'state')
    const code = randomUUID()
    lastRequestedScopes = parameter(url, 'scope').split(' ')
    grants.set(code, {
      account,
      challenge: parameter(url, 'code_challenge'),
      scopes: lastRequestedScopes,
    })
    const callback = new URL(redirectUri)
    callback.searchParams.set('code', code)
    callback.searchParams.set('state', state)
    response.writeHead(302, { location: callback.toString() }).end()
  }
  const token = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    const input = new URLSearchParams(await body(request))
    if (input.get('grant_type') === 'refresh_token') {
      const current = refreshTokens.get(input.get('refresh_token') ?? '')
      if (!current) {
        response.writeHead(400).end(JSON.stringify({ error: 'invalid_grant' }))
        return
      }
      refreshCount += 1
      const accessToken = `google-access-${randomUUID()}`
      const refreshToken = `google-refresh-${randomUUID()}`
      accessTokens.set(accessToken, current)
      refreshTokens.set(refreshToken, current)
      response.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 3600,
          scope: current.scopes.join(' '),
        }),
      )
      return
    }
    const grant = grants.get(input.get('code') ?? '')
    const challenge = createHash('sha256')
      .update(input.get('code_verifier') ?? '')
      .digest('base64url')
    if (!grant || challenge !== grant.challenge) {
      response.writeHead(400).end(JSON.stringify({ error: 'invalid_grant' }))
      return
    }
    const scopes = grant.scopes.filter((scope) => scope !== deniedScope)
    deniedScope = undefined
    const accessToken = `google-access-${randomUUID()}`
    const refreshToken = `google-refresh-${randomUUID()}`
    const stored = { account: grant.account, scopes }
    accessTokens.set(accessToken, stored)
    refreshTokens.set(refreshToken, stored)
    response.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 3600,
        scope: scopes.join(' '),
      }),
    )
  }
  const userInfo = (
    request: IncomingMessage,
    response: ServerResponse,
  ): void => {
    const token = request.headers.authorization?.replace(/^Bearer /, '')
    const current = token ? accessTokens.get(token) : undefined
    if (!current) {
      response.writeHead(401).end()
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        sub: current.account.id,
        email: current.account.email,
        email_verified: true,
      }),
    )
  }
  const revoke = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    const input = new URLSearchParams(await body(request))
    if (failRevocation) {
      failRevocation = false
      response.writeHead(503).end()
      return
    }
    const removed = refreshTokens.delete(input.get('token') ?? '')
    response.writeHead(removed ? 204 : 400).end()
  }
  const server = createServer((request, response) => {
    const run = async (): Promise<void> => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (request.method === 'GET' && url.pathname === '/authorize') {
        authorize(url, response)
        return
      }
      if (request.method === 'POST' && url.pathname === '/token') {
        await token(request, response)
        return
      }
      if (request.method === 'GET' && url.pathname === '/userinfo') {
        userInfo(request, response)
        return
      }
      if (request.method === 'POST' && url.pathname === '/revoke') {
        await revoke(request, response)
        return
      }
      response.writeHead(404).end()
    }
    void run().catch(() => response.writeHead(400).end())
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Test Google provider did not bind a TCP port')
  }
  const baseUrl = `http://127.0.0.1:${address.port}`
  const config: GoogleOAuthProviderConfig = {
    clientId: 'linea-test-client',
    clientSecret: 'linea-test-secret',
    authorizationUrl: `${baseUrl}/authorize`,
    tokenUrl: `${baseUrl}/token`,
    userInfoUrl: `${baseUrl}/userinfo`,
    revocationUrl: `${baseUrl}/revoke`,
  }
  return {
    adapter: new GoogleOAuthProvider(config),
    selectAccount(id: string, email: string) {
      account = { id, email }
    },
    denyScopeOnce(scope: string) {
      deniedScope = scope
    },
    failNextRevocation() {
      failRevocation = true
    },
    requestedScopes: () => lastRequestedScopes,
    refreshCount: () => refreshCount,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}
