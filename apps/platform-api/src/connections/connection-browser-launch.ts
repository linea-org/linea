import { createHash, randomBytes } from 'node:crypto'
import type { Request, Response } from 'express'

export function browserCookieName(state: string, secure: boolean): string {
  const id = createHash('sha256').update(state).digest('hex')
  return `${secure ? '__Host-' : ''}linea_oauth_${id}`
}

export function readBrowserProof(
  request: Request,
  state: string,
  secure: boolean,
): string | undefined {
  const name = browserCookieName(state, secure)
  return request.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}

export function sendBrowserLaunch(
  response: Response,
  input: {
    state: string
    returnUri: string
    authorizationId: string
    secure: boolean
  },
): void {
  const proof = randomBytes(32).toString('base64url')
  const browserChallenge = createHash('sha256').update(proof).digest('hex')
  const nonce = randomBytes(24).toString('base64')
  response.cookie(browserCookieName(input.state, input.secure), proof, {
    httpOnly: true,
    secure: input.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 300_000,
  })
  response.set({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'unsafe-none',
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
    'X-Frame-Options': 'DENY',
  })
  const message = JSON.stringify({
    kind: 'linea-connection-browser',
    authorizationId: input.authorizationId,
    state: input.state,
    browserChallenge,
  }).replaceAll('<', '\\u003c')
  const origin = JSON.stringify(new URL(input.returnUri).origin).replaceAll(
    '<',
    '\\u003c',
  )
  response
    .type('html')
    .send(
      `<!doctype html><title>Connect account</title><p>Continue in the Application that opened this window.</p><script nonce="${nonce}">if(window.opener)window.opener.postMessage(${message},${origin});</script>`,
    )
}
