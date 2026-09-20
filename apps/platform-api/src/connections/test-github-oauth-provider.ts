import { createHash, randomUUID } from 'node:crypto'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { createGithubOAuthProvider } from './github-oauth-provider'

type Account = { id: number; login: string }

type TestGithubProviderState = {
  codes: Map<string, { challenge: string; scopes: string[]; account: Account }>
  accessTokens: Map<string, Account>
  refreshTokens: Map<string, { account: Account; scopes: string[] }>
  revokedAccounts: Set<number>
  account: Account
  nextGrantedScopes: string[] | undefined
  rejectNextRefresh: boolean
  rejectNextRevocation: boolean
}

function respond(
  response: ServerResponse,
  status: number,
  value?: unknown,
): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(value === undefined ? undefined : JSON.stringify(value))
}

function handleAuthorization(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  state: TestGithubProviderState,
): boolean {
  if (request.method !== 'GET' || url.pathname !== '/login/oauth/authorize') {
    return false
  }
  if (required(url, 'client_id') !== 'github-client') {
    respond(response, 401, { error: 'bad_client' })
    return true
  }
  const redirectUri = required(url, 'redirect_uri')
  const code = randomUUID()
  const requestedScopes = required(url, 'scope')
    .split(' ')
    .filter((scope) => scope !== 'offline_access')
  state.codes.set(code, {
    challenge: required(url, 'code_challenge'),
    scopes: state.nextGrantedScopes ?? requestedScopes,
    account: state.account,
  })
  state.nextGrantedScopes = undefined
  const callback = new URL(redirectUri)
  callback.searchParams.set('code', code)
  callback.searchParams.set('state', required(url, 'state'))
  response.writeHead(302, { location: callback.toString() }).end()
  return true
}

function rotateRefreshToken(
  response: ServerResponse,
  parameters: URLSearchParams,
  state: TestGithubProviderState,
): void {
  const current = state.refreshTokens.get(parameters.get('refresh_token') ?? '')
  if (!current || state.rejectNextRefresh) {
    state.rejectNextRefresh = false
    respond(response, 400, { error: 'bad_refresh_secret' })
    return
  }
  const accessToken = `gho_${randomUUID()}`
  const refreshToken = `ghr_${randomUUID()}`
  state.accessTokens.set(accessToken, current.account)
  state.refreshTokens.set(refreshToken, current)
  respond(response, 200, {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: 3600,
    refresh_token_expires_in: 7200,
    scope: current.scopes.join(','),
    token_type: 'bearer',
  })
}

function exchangeAuthorizationCode(
  response: ServerResponse,
  parameters: URLSearchParams,
  state: TestGithubProviderState,
): void {
  const code = parameters.get('code') ?? ''
  const authorization = state.codes.get(code)
  const verifier = parameters.get('code_verifier') ?? ''
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  if (!authorization || authorization.challenge !== challenge) {
    respond(response, 400, { error: 'bad_code_secret' })
    return
  }
  state.codes.delete(code)
  const accessToken = `gho_${randomUUID()}`
  const refreshToken = `ghr_${randomUUID()}`
  state.accessTokens.set(accessToken, authorization.account)
  state.refreshTokens.set(refreshToken, {
    account: authorization.account,
    scopes: authorization.scopes,
  })
  respond(response, 200, {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: 3600,
    refresh_token_expires_in: 7200,
    scope: authorization.scopes.join(','),
    token_type: 'bearer',
  })
}

async function handleTokenExchange(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  state: TestGithubProviderState,
): Promise<boolean> {
  if (
    request.method !== 'POST' ||
    url.pathname !== '/login/oauth/access_token'
  ) {
    return false
  }
  const parameters = new URLSearchParams(await readBody(request))
  if (
    parameters.get('client_id') !== 'github-client' ||
    parameters.get('client_secret') !== 'github-client-secret'
  ) {
    respond(response, 401, { error: 'bad_client' })
    return true
  }
  if (parameters.get('grant_type') === 'refresh_token') {
    rotateRefreshToken(response, parameters, state)
    return true
  }
  exchangeAuthorizationCode(response, parameters, state)
  return true
}

function handleAccount(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  state: TestGithubProviderState,
): boolean {
  if (request.method !== 'GET' || url.pathname !== '/user') return false
  const token = request.headers.authorization?.replace(/^Bearer /, '')
  const tokenAccount = token ? state.accessTokens.get(token) : undefined
  if (!tokenAccount) {
    respond(response, 401, { message: 'bad_access_secret' })
    return true
  }
  respond(response, 200, {
    id: tokenAccount.id,
    login: tokenAccount.login,
    token_echo: token,
  })
  return true
}

async function handleRevocation(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  state: TestGithubProviderState,
): Promise<boolean> {
  if (
    request.method !== 'DELETE' ||
    url.pathname !== '/applications/github-client/token'
  ) {
    return false
  }
  const expectedAuthorization = `Basic ${Buffer.from(
    'github-client:github-client-secret',
  ).toString('base64')}`
  if (request.headers.authorization !== expectedAuthorization) {
    respond(response, 401, { message: 'bad_client_secret' })
    return true
  }
  if (state.rejectNextRevocation) {
    state.rejectNextRevocation = false
    respond(response, 503, { message: 'revocation_secret' })
    return true
  }
  const parsed: unknown = JSON.parse(await readBody(request))
  const token =
    parsed &&
    typeof parsed === 'object' &&
    'access_token' in parsed &&
    typeof parsed.access_token === 'string'
      ? parsed.access_token
      : ''
  const tokenAccount = state.accessTokens.get(token)
  if (!tokenAccount) {
    respond(response, 404, { message: 'missing' })
    return true
  }
  state.accessTokens.delete(token)
  state.revokedAccounts.add(tokenAccount.id)
  response.writeHead(204).end()
  return true
}

export async function startTestGithubOAuthProvider() {
  const state: TestGithubProviderState = {
    codes: new Map(),
    accessTokens: new Map(),
    refreshTokens: new Map(),
    revokedAccounts: new Set(),
    account: { id: 123456, login: 'octocat' },
    nextGrantedScopes: undefined,
    rejectNextRefresh: false,
    rejectNextRevocation: false,
  }
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (handleAuthorization(request, response, url, state)) return
      if (await handleTokenExchange(request, response, url, state)) return
      if (handleAccount(request, response, url, state)) return
      if (await handleRevocation(request, response, url, state)) return
      respond(response, 404, { message: 'missing' })
    })().catch(() => respond(response, 500, { message: 'provider_failed' }))
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No address')
  const baseUrl = `http://127.0.0.1:${address.port}`
  return {
    adapter: createGithubOAuthProvider({
      clientId: 'github-client',
      clientSecret: 'github-client-secret',
      oauthBaseUrl: baseUrl,
      apiBaseUrl: baseUrl,
    }),
    grantNextScopes(scopes: string[]) {
      state.nextGrantedScopes = scopes
    },
    rejectNextRefresh() {
      state.rejectNextRefresh = true
    },
    rejectNextRevocation() {
      state.rejectNextRevocation = true
    },
    selectAccount(id: number, login: string) {
      state.account = { id, login }
    },
    wasAccountRevoked(id: number) {
      return state.revokedAccounts.has(id)
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}

function required(url: URL, name: string): string {
  const value = url.searchParams.get(name)
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

async function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}
