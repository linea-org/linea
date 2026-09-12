import { createHash } from 'node:crypto'
import {
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
  type KeyLike,
} from 'jose-v5'
import { DpopProofError, verifyDpopProof } from './dpop-proof'

const nonce = 'server-generated-dpop-nonce-value'
const accessToken = 'lnu_access-token-value'
const targetUrl = 'https://api.linea.dev/v1/user-sessions/current'

function hexHash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function accessTokenHash(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}

async function keyPair(): Promise<{
  privateKey: KeyLike
  publicJwk: JWK
  privateJwk: JWK
}> {
  const { privateKey, publicKey } = await generateKeyPair('ES256')
  return {
    privateKey,
    publicJwk: await exportJWK(publicKey),
    privateJwk: await exportJWK(privateKey),
  }
}

async function proof(input: {
  privateKey: KeyLike
  jwk: JWK
  method: string
  url: string
  nonce: string
  issuedAt: number
  jti: string
  accessToken: string | undefined
}): Promise<string> {
  const payload: Record<string, string | number> = {
    jti: input.jti,
    htm: input.method,
    htu: input.url,
    iat: input.issuedAt,
    nonce: input.nonce,
  }
  if (input.accessToken !== undefined) {
    payload.ath = accessTokenHash(input.accessToken)
  }
  return new SignJWT(payload)
    .setProtectedHeader({ typ: 'dpop+jwt', alg: 'ES256', jwk: input.jwk })
    .sign(input.privateKey)
}

describe('DPoP proof verification', () => {
  it('verifies a session-creation proof and returns its RFC 7638 thumbprint', async () => {
    const key = await keyPair()
    const now = new Date()
    const signed = await proof({
      privateKey: key.privateKey,
      jwk: key.publicJwk,
      method: 'POST',
      url: 'https://api.linea.dev/v1/user-sessions?ignored=true',
      nonce,
      issuedAt: Math.floor(now.getTime() / 1000),
      jti: 'unique-proof-id-0001',
      accessToken: undefined,
    })
    await expect(
      verifyDpopProof({
        proof: signed,
        method: 'POST',
        targetUrl: 'https://api.linea.dev/v1/user-sessions',
        nonceHash: hexHash(nonce),
        accessToken: undefined,
        expectedJkt: undefined,
        now,
      }),
    ).resolves.toEqual({
      jkt: await calculateJwkThumbprint(key.publicJwk, 'sha256'),
      jtiHash: accessTokenHash('unique-proof-id-0001'),
    })
  })

  it('verifies a protected-resource proof bound to its access token and key', async () => {
    const key = await keyPair()
    const now = new Date()
    const signed = await proof({
      privateKey: key.privateKey,
      jwk: key.publicJwk,
      method: 'DELETE',
      url: targetUrl,
      nonce,
      issuedAt: Math.floor(now.getTime() / 1000),
      jti: 'unique-proof-id-0002',
      accessToken,
    })
    await expect(
      verifyDpopProof({
        proof: signed,
        method: 'DELETE',
        targetUrl,
        nonceHash: hexHash(nonce),
        accessToken,
        expectedJkt: await calculateJwkThumbprint(key.publicJwk, 'sha256'),
        now,
      }),
    ).resolves.toMatchObject({
      jtiHash: accessTokenHash('unique-proof-id-0002'),
    })
  })

  it.each([
    ['method', { method: 'GET' }],
    ['target', { url: 'https://api.linea.dev/v1/other' }],
    ['nonce', { nonce: 'different-server-generated-nonce' }],
    ['token', { accessToken: 'lnu_copied-token' }],
    ['time', { issuedAt: 0 }],
  ])('rejects a proof with the wrong %s binding', async (_name, override) => {
    const key = await keyPair()
    const now = new Date()
    const signed = await proof({
      privateKey: key.privateKey,
      jwk: key.publicJwk,
      method: 'DELETE',
      url: targetUrl,
      nonce,
      issuedAt: Math.floor(now.getTime() / 1000),
      jti: 'unique-proof-id-0003',
      accessToken,
      ...override,
    })
    await expect(
      verifyDpopProof({
        proof: signed,
        method: 'DELETE',
        targetUrl,
        nonceHash: hexHash(nonce),
        accessToken,
        expectedJkt: await calculateJwkThumbprint(key.publicJwk, 'sha256'),
        now,
      }),
    ).rejects.toBeInstanceOf(DpopProofError)
  })

  it('rejects private key material in the proof header', async () => {
    const key = await keyPair()
    const now = new Date()
    const signed = await proof({
      privateKey: key.privateKey,
      jwk: key.privateJwk,
      method: 'POST',
      url: 'https://api.linea.dev/v1/user-sessions',
      nonce,
      issuedAt: Math.floor(now.getTime() / 1000),
      jti: 'unique-proof-id-0004',
      accessToken: undefined,
    })
    await expect(
      verifyDpopProof({
        proof: signed,
        method: 'POST',
        targetUrl: 'https://api.linea.dev/v1/user-sessions',
        nonceHash: hexHash(nonce),
        accessToken: undefined,
        expectedJkt: undefined,
        now,
      }),
    ).rejects.toBeInstanceOf(DpopProofError)
  })

  it('rejects a copied token presented with a different proof key', async () => {
    const boundKey = await keyPair()
    const attackerKey = await keyPair()
    const now = new Date()
    const signed = await proof({
      privateKey: attackerKey.privateKey,
      jwk: attackerKey.publicJwk,
      method: 'DELETE',
      url: targetUrl,
      nonce,
      issuedAt: Math.floor(now.getTime() / 1000),
      jti: 'unique-proof-id-0005',
      accessToken,
    })
    await expect(
      verifyDpopProof({
        proof: signed,
        method: 'DELETE',
        targetUrl,
        nonceHash: hexHash(nonce),
        accessToken,
        expectedJkt: await calculateJwkThumbprint(boundKey.publicJwk, 'sha256'),
        now,
      }),
    ).rejects.toBeInstanceOf(DpopProofError)
  })
})
