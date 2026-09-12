import { createHash, timingSafeEqual } from 'node:crypto'
import {
  calculateJwkThumbprint,
  decodeProtectedHeader,
  importJWK,
  jwtVerify,
} from 'jose-v5'
import { z } from 'zod'
import type { Request } from 'express'

const publicJwkSchema = z
  .object({
    kty: z.literal('EC'),
    crv: z.literal('P-256'),
    x: z
      .string()
      .length(43)
      .regex(/^[A-Za-z0-9_-]+$/),
    y: z
      .string()
      .length(43)
      .regex(/^[A-Za-z0-9_-]+$/),
  })
  .passthrough()
  .refine((jwk) => !('d' in jwk))

const protectedHeaderSchema = z.object({
  typ: z.literal('dpop+jwt'),
  alg: z.literal('ES256'),
  jwk: publicJwkSchema,
})

const proofPayloadSchema = z.object({
  jti: z.string().min(16).max(200),
  htm: z.string().min(1),
  htu: z.url(),
  iat: z.number().int(),
  nonce: z.string().min(32).max(256),
})

const PROOF_CLOCK_SKEW_SECONDS = 60

export class DpopProofError extends Error {}

export function readDpopProof(request: Request): string {
  const values = request.rawHeaders.filter(
    (value, index) => index % 2 === 0 && value.toLowerCase() === 'dpop',
  )
  const proof = request.headers.dpop
  if (
    values.length !== 1 ||
    typeof proof !== 'string' ||
    proof.length === 0 ||
    proof.length > 8192
  ) {
    throw new DpopProofError()
  }
  return proof
}

export function requestTarget(request: Request): string {
  return `${request.protocol}://${request.get('host')}${request.originalUrl}`
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}

function matchesHash(value: string, expectedHexHash: string): boolean {
  const actual = createHash('sha256').update(value).digest()
  const expected = Buffer.from(expectedHexHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function normalizedTarget(value: string): string {
  const url = new URL(value)
  url.search = ''
  url.hash = ''
  return url.toString()
}

export type VerifiedDpopProof = { jkt: string; jtiHash: string }

export async function verifyDpopProof(input: {
  proof: string
  method: string
  targetUrl: string
  nonceHash: string
  accessToken: string | undefined
  expectedJkt: string | undefined
  now: Date
}): Promise<VerifiedDpopProof> {
  try {
    const header = protectedHeaderSchema.parse(
      decodeProtectedHeader(input.proof),
    )
    const key = await importJWK(header.jwk, 'ES256')
    const { payload } = await jwtVerify(input.proof, key, {
      algorithms: ['ES256'],
      typ: 'dpop+jwt',
    })
    const claims = proofPayloadSchema.parse(payload)
    const now = Math.floor(input.now.getTime() / 1000)
    if (Math.abs(now - claims.iat) > PROOF_CLOCK_SKEW_SECONDS) {
      throw new Error('DPoP proof outside accepted time window')
    }
    if (claims.htm !== input.method.toUpperCase()) {
      throw new Error('DPoP method mismatch')
    }
    if (normalizedTarget(claims.htu) !== normalizedTarget(input.targetUrl)) {
      throw new Error('DPoP target mismatch')
    }
    if (!matchesHash(claims.nonce, input.nonceHash)) {
      throw new Error('DPoP nonce mismatch')
    }
    const jkt = await calculateJwkThumbprint(header.jwk, 'sha256')
    if (input.expectedJkt !== undefined && jkt !== input.expectedJkt) {
      throw new Error('DPoP key mismatch')
    }
    if (input.accessToken !== undefined) {
      if (payload.ath !== hash(input.accessToken)) {
        throw new Error('DPoP access token mismatch')
      }
    } else if (payload.ath !== undefined) {
      throw new Error('Unexpected DPoP access token binding')
    }
    return { jkt, jtiHash: hash(claims.jti) }
  } catch {
    throw new DpopProofError()
  }
}
