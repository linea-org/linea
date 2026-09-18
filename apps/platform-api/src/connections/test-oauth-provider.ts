import { createHash, randomUUID } from 'node:crypto'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import {
  ConnectionProviderInvalidGrantError,
  type ConnectionOAuthProvider,
} from './connection-oauth-provider'

type TestOAuthProvider = {
  adapter: ConnectionOAuthProvider
  rejectNextRefresh(): void
  rejectNextRevocation(): void
  selectAccount(accountId: string, accountLabel: string): void
  wasAccountRevoked(accountId: string): boolean
  close(): Promise<void>
}

function requiredParameter(url: URL, name: string): string {
  const value = url.searchParams.get(name)
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

export async function startTestOAuthProvider(): Promise<TestOAuthProvider> {
  const authorizationChallenges = new Map<
    string,
    { challenge: string; accountId: string; accountLabel: string }
  >()
  const accessTokens = new Map<
    string,
    { accountId: string; accountLabel: string }
  >()
  const refreshTokens = new Map<
    string,
    { accountId: string; accountLabel: string }
  >()
  const revokedAccounts = new Set<string>()
  let rejectNextRefresh = false
  let rejectNextRevocation = false
  let selectedAccount = {
    accountId: 'account-one',
    accountLabel: 'Test Account',
  }
  const authorize = (url: URL, response: ServerResponse): void => {
    const redirectUri = requiredParameter(url, 'redirect_uri')
    const state = requiredParameter(url, 'state')
    const codeChallenge = requiredParameter(url, 'code_challenge')
    requiredParameter(url, 'scope')
    const code = randomUUID()
    authorizationChallenges.set(code, {
      challenge: codeChallenge,
      ...selectedAccount,
    })
    const callback = new URL(redirectUri)
    callback.searchParams.set('code', code)
    callback.searchParams.set('state', state)
    response.writeHead(302, { location: callback.toString() }).end()
  }
  const exchangeToken = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    const body = await readBody(request)
    const parameters = new URLSearchParams(body)
    if (parameters.get('grant_type') === 'refresh_token') {
      const refreshToken = parameters.get('refresh_token') ?? ''
      const account = refreshTokens.get(refreshToken)
      if (rejectNextRefresh || !account) {
        rejectNextRefresh = false
        response.writeHead(400).end(JSON.stringify({ error: 'invalid_grant' }))
        return
      }
      const accessToken = `test-access-${randomUUID()}`
      accessTokens.set(accessToken, account)
      response.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 3600,
        }),
      )
      return
    }
    const code = parameters.get('code') ?? ''
    const verifier = parameters.get('code_verifier') ?? ''
    const authorization = authorizationChallenges.get(code)
    const actualChallenge = createHash('sha256')
      .update(verifier)
      .digest('base64url')
    if (!authorization || authorization.challenge !== actualChallenge) {
      response.writeHead(400).end(JSON.stringify({ error: 'invalid_grant' }))
      return
    }
    authorizationChallenges.delete(code)
    const accessToken = `test-access-${randomUUID()}`
    const refreshToken = `test-refresh-${randomUUID()}`
    const account = {
      accountId: authorization.accountId,
      accountLabel: authorization.accountLabel,
    }
    accessTokens.set(accessToken, account)
    refreshTokens.set(refreshToken, account)
    response.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 3600,
      }),
    )
  }
  const account = (
    request: IncomingMessage,
    response: ServerResponse,
  ): void => {
    const token = request.headers.authorization?.replace(/^Bearer /, '')
    const selected = token ? accessTokens.get(token) : undefined
    if (!selected) {
      response.writeHead(401).end()
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        id: selected.accountId,
        label: selected.accountLabel,
      }),
    )
  }
  const revoke = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    if (rejectNextRevocation) {
      rejectNextRevocation = false
      response.writeHead(503).end()
      return
    }
    const body = await readBody(request)
    const parameters = new URLSearchParams(body)
    const token = parameters.get('token') ?? ''
    const selected = accessTokens.get(token)
    if (!selected || !accessTokens.delete(token)) {
      response.writeHead(400).end()
      return
    }
    revokedAccounts.add(selected.accountId)
    response.writeHead(204).end()
  }
  const handleRequest = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (request.method === 'GET' && url.pathname === '/authorize') {
        authorize(url, response)
        return
      }
      if (request.method === 'POST' && url.pathname === '/token') {
        await exchangeToken(request, response)
        return
      }
      if (request.method === 'GET' && url.pathname === '/account') {
        account(request, response)
        return
      }
      if (request.method === 'POST' && url.pathname === '/revoke') {
        await revoke(request, response)
        return
      }
      response.writeHead(404).end()
    } catch {
      response.writeHead(400).end()
    }
  }
  const server = createServer((request, response) => {
    void handleRequest(request, response)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Test OAuth provider did not bind a TCP port')
  }
  const baseUrl = `http://127.0.0.1:${address.port}`
  return {
    adapter: {
      provider: 'test',
      createAuthorizationUrl(input) {
        const url = new URL('/authorize', baseUrl)
        url.searchParams.set('response_type', 'code')
        url.searchParams.set('redirect_uri', input.redirectUri)
        url.searchParams.set('state', input.state)
        url.searchParams.set('code_challenge', input.codeChallenge)
        url.searchParams.set('code_challenge_method', 'S256')
        url.searchParams.set('scope', input.scopes.join(' '))
        return url.toString()
      },
      async exchangeAuthorizationCode(input) {
        const tokenResponse = await fetch(new URL('/token', baseUrl), {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: input.code,
            code_verifier: input.codeVerifier,
            redirect_uri: input.redirectUri,
          }),
        })
        if (!tokenResponse.ok) throw new Error('Provider token exchange failed')
        const token: unknown = await tokenResponse.json()
        if (!isTokenResponse(token)) throw new Error('Invalid token response')
        const accountResponse = await fetch(new URL('/account', baseUrl), {
          headers: { authorization: `Bearer ${token.access_token}` },
        })
        if (!accountResponse.ok)
          throw new Error('Provider account lookup failed')
        const account: unknown = await accountResponse.json()
        if (!isAccountResponse(account)) {
          throw new Error('Invalid provider account response')
        }
        return {
          accountId: account.id,
          accountLabel: account.label,
          accessToken: token.access_token,
          refreshToken: token.refresh_token,
          expiresAt: new Date(
            Date.now() + token.expires_in * 1000,
          ).toISOString(),
        }
      },
      async refreshCredential(credential) {
        if (!credential.refreshToken) {
          throw new Error('Provider refresh token is unavailable')
        }
        const tokenResponse = await fetch(new URL('/token', baseUrl), {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: credential.refreshToken,
          }),
        })
        if (!tokenResponse.ok) {
          throw new ConnectionProviderInvalidGrantError(
            'Provider refresh grant is invalid',
          )
        }
        const token: unknown = await tokenResponse.json()
        if (!isTokenResponse(token)) throw new Error('Invalid token response')
        return {
          ...credential,
          accessToken: token.access_token,
          refreshToken: token.refresh_token,
          expiresAt: new Date(
            Date.now() + token.expires_in * 1000,
          ).toISOString(),
        }
      },
      async revokeCredential(credential, signal) {
        const response = await fetch(new URL('/revoke', baseUrl), {
          method: 'POST',
          signal,
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: credential.accessToken }),
        })
        if (!response.ok) throw new Error('Provider revocation failed')
      },
    },
    rejectNextRefresh: () => {
      rejectNextRefresh = true
    },
    rejectNextRevocation: () => {
      rejectNextRevocation = true
    },
    selectAccount: (accountId, accountLabel) => {
      selectedAccount = { accountId, accountLabel }
    },
    wasAccountRevoked: (accountId) => revokedAccounts.has(accountId),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}

function readBody(
  request: import('node:http').IncomingMessage,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function isTokenResponse(value: unknown): value is {
  access_token: string
  refresh_token: string
  expires_in: number
} {
  if (!value || typeof value !== 'object') return false
  return (
    'access_token' in value &&
    typeof value.access_token === 'string' &&
    'refresh_token' in value &&
    typeof value.refresh_token === 'string' &&
    'expires_in' in value &&
    typeof value.expires_in === 'number'
  )
}

function isAccountResponse(
  value: unknown,
): value is { id: string; label: string } {
  if (!value || typeof value !== 'object') return false
  return (
    'id' in value &&
    typeof value.id === 'string' &&
    'label' in value &&
    typeof value.label === 'string'
  )
}
