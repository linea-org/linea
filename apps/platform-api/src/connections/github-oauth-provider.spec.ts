import { createHash } from 'node:crypto'
import { ConnectionProviderInvalidGrantError } from './connection-oauth-provider'
import { parseConnectionProviderCredential } from './connection-provider-credential'
import { githubAuthorizationScopes } from './github-oauth-provider'
import { startTestGithubOAuthProvider } from './test-github-oauth-provider'

describe('GitHub OAuth provider', () => {
  let provider: Awaited<ReturnType<typeof startTestGithubOAuthProvider>>
  beforeAll(async () => {
    provider = await startTestGithubOAuthProvider()
  })
  afterAll(async () => {
    await provider.close()
  })
  async function authorize(scopes = ['repo']) {
    const codeVerifier = 'v'.repeat(43)
    const authorizationUrl = await provider.adapter.createAuthorizationUrl({
      redirectUri:
        'https://linea.test/v1/user/connections/oauth/github/callback',
      state: 'single-use-state',
      codeChallenge: createHash('sha256')
        .update(codeVerifier)
        .digest('base64url'),
      scopes,
    })
    const url = new URL(authorizationUrl)
    expect(url.pathname).toBe('/login/oauth/authorize')
    expect(url.searchParams.get('scope')).toBe(
      [...scopes, 'offline_access'].join(' '),
    )
    const response = await fetch(url, { redirect: 'manual' })
    const location = response.headers.get('location')
    if (!location) throw new Error('Missing callback')
    const callback = new URL(location)
    return provider.adapter.exchangeAuthorizationCode({
      code: callback.searchParams.get('code') ?? '',
      redirectUri:
        'https://linea.test/v1/user/connections/oauth/github/callback',
      codeVerifier,
      scopes,
    })
  }
  it('resolves stable numeric account identity and granted scopes', async () => {
    const credential = await authorize()
    expect(credential).toEqual(
      expect.objectContaining({
        accountId: '123456',
        accountLabel: 'octocat',
        grantedScopes: ['repo'],
      }),
    )
    expect(credential.accessToken).toMatch(/^gho_/)
    expect(credential.refreshToken).toMatch(/^ghr_/)
    expect(credential.expiresAt).not.toBeNull()
  })
  it('uses Connection scopes for credentials written before grant metadata existed', () => {
    const credential = parseConnectionProviderCredential(
      JSON.stringify({
        accountId: '123456',
        accountLabel: 'octocat',
        accessToken: 'legacy-access-token',
        refreshToken: 'legacy-refresh-token',
        expiresAt: null,
      }),
      ['legacy-scope'],
    )
    expect(credential.grantedScopes).toEqual(['legacy-scope'])
  })
  it('derives only the scopes required by enabled GitHub action families', () => {
    expect(githubAuthorizationScopes(['repositories'])).toEqual(['read:user'])
    expect(
      githubAuthorizationScopes(['repositories', 'issues', 'pull_requests']),
    ).toEqual(['read:user', 'repo'])
    expect(() => githubAuthorizationScopes(['unknown'])).toThrow(
      'Unsupported GitHub action family',
    )
  })
  it('fails closed when GitHub grants fewer scopes than requested', async () => {
    provider.grantNextScopes([])
    await expect(authorize()).rejects.toBeInstanceOf(
      ConnectionProviderInvalidGrantError,
    )
  })
  it('rotates expiring credentials and preserves account identity', async () => {
    const credential = await authorize()
    const refreshed = await provider.adapter.refreshCredential(credential)
    expect(refreshed.accountId).toBe(credential.accountId)
    expect(refreshed.grantedScopes).toEqual(['repo'])
    expect(refreshed.accessToken).not.toBe(credential.accessToken)
    expect(refreshed.refreshToken).not.toBe(credential.refreshToken)
    provider.rejectNextRefresh()
    await expect(
      provider.adapter.refreshCredential(refreshed),
    ).rejects.toBeInstanceOf(ConnectionProviderInvalidGrantError)
  })
  it('revokes through GitHub without exposing provider failures', async () => {
    const credential = await authorize()
    provider.rejectNextRevocation()
    await expect(
      provider.adapter.revokeCredential(
        credential,
        new AbortController().signal,
      ),
    ).rejects.toThrow('GitHub credential revocation failed')
    expect(provider.wasAccountRevoked(123456)).toBe(false)
    await provider.adapter.revokeCredential(
      credential,
      new AbortController().signal,
    )
    expect(provider.wasAccountRevoked(123456)).toBe(true)
  })
})
