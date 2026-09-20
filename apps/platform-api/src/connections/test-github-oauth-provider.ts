import { createHash, randomUUID } from 'node:crypto'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { createGithubOAuthProvider } from './github-oauth-provider'

type Account = { id: number; login: string }

export async function startTestGithubOAuthProvider() {
  const codes = new Map<
    string,
    { challenge: string; scopes: string[]; account: Account }
  >()
  const accessTokens = new Map<string, Account>()
  const refreshTokens = new Map<
    string,
    { account: Account; scopes: string[] }
  >()
  const revokedAccounts = new Set<number>()
  let account = { id: 123456, login: 'octocat' }
  let nextGrantedScopes: string[] | undefined
  let rejectNextRefresh = false
  let rejectNextRevocation = false
  const respond = (
    response: ServerResponse,
    status: number,
    value?: unknown,
  ) => {
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(value === undefined ? undefined : JSON.stringify(value))
  }
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (
        request.method === 'GET' &&
        url.pathname === '/login/oauth/authorize'
      ) {
        if (required(url, 'client_id') !== 'github-client') {
          respond(response, 401, { error: 'bad_client' })
          return
        }
        const redirectUri = required(url, 'redirect_uri')
        const code = randomUUID()
        const requestedScopes = required(url, 'scope')
          .split(' ')
          .filter((scope) => scope !== 'offline_access')
        codes.set(code, {
          challenge: required(url, 'code_challenge'),
          scopes: nextGrantedScopes ?? requestedScopes,
          account,
        })
        nextGrantedScopes = undefined
        const callback = new URL(redirectUri)
        callback.searchParams.set('code', code)
        callback.searchParams.set('state', required(url, 'state'))
        response.writeHead(302, { location: callback.toString() }).end()
        return
      }
      if (
        request.method === 'POST' &&
        url.pathname === '/login/oauth/access_token'
      ) {
        const parameters = new URLSearchParams(await readBody(request))
        if (
          parameters.get('client_id') !== 'github-client' ||
          parameters.get('client_secret') !== 'github-client-secret'
        ) {
          respond(response, 401, { error: 'bad_client' })
          return
        }
        if (parameters.get('grant_type') === 'refresh_token') {
          const current = refreshTokens.get(
            parameters.get('refresh_token') ?? '',
          )
          if (!current || rejectNextRefresh) {
            rejectNextRefresh = false
            respond(response, 400, { error: 'bad_refresh_secret' })
            return
          }
          const accessToken = `gho_${randomUUID()}`
          const refreshToken = `ghr_${randomUUID()}`
          accessTokens.set(accessToken, current.account)
          refreshTokens.set(refreshToken, current)
          respond(response, 200, {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: 3600,
            refresh_token_expires_in: 7200,
            scope: current.scopes.join(','),
            token_type: 'bearer',
          })
          return
        }
        const authorization = codes.get(parameters.get('code') ?? '')
        const verifier = parameters.get('code_verifier') ?? ''
        const challenge = createHash('sha256')
          .update(verifier)
          .digest('base64url')
        if (!authorization || authorization.challenge !== challenge) {
          respond(response, 400, { error: 'bad_code_secret' })
          return
        }
        codes.delete(parameters.get('code') ?? '')
        const accessToken = `gho_${randomUUID()}`
        const refreshToken = `ghr_${randomUUID()}`
        accessTokens.set(accessToken, authorization.account)
        refreshTokens.set(refreshToken, {
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
        return
      }
      if (request.method === 'GET' && url.pathname === '/user') {
        const token = request.headers.authorization?.replace(/^Bearer /, '')
        const tokenAccount = token ? accessTokens.get(token) : undefined
        if (!tokenAccount) {
          respond(response, 401, { message: 'bad_access_secret' })
          return
        }
        respond(response, 200, {
          id: tokenAccount.id,
          login: tokenAccount.login,
          token_echo: token,
        })
        return
      }
      if (
        request.method === 'DELETE' &&
        url.pathname === '/applications/github-client/token'
      ) {
        const expectedAuthorization = `Basic ${Buffer.from(
          'github-client:github-client-secret',
        ).toString('base64')}`
        if (request.headers.authorization !== expectedAuthorization) {
          respond(response, 401, { message: 'bad_client_secret' })
          return
        }
        if (rejectNextRevocation) {
          rejectNextRevocation = false
          respond(response, 503, { message: 'revocation_secret' })
          return
        }
        const parsed: unknown = JSON.parse(await readBody(request))
        const token =
          parsed &&
          typeof parsed === 'object' &&
          'access_token' in parsed &&
          typeof parsed.access_token === 'string'
            ? parsed.access_token
            : ''
        const tokenAccount = accessTokens.get(token)
        if (!tokenAccount) {
          respond(response, 404, { message: 'missing' })
          return
        }
        accessTokens.delete(token)
        revokedAccounts.add(tokenAccount.id)
        response.writeHead(204).end()
        return
      }
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
      nextGrantedScopes = scopes
    },
    rejectNextRefresh() {
      rejectNextRefresh = true
    },
    rejectNextRevocation() {
      rejectNextRevocation = true
    },
    selectAccount(id: number, login: string) {
      account = { id, login }
    },
    wasAccountRevoked(id: number) {
      return revokedAccounts.has(id)
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
