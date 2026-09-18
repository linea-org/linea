import { LineaUserProtocolError } from "./errors.js"

function base64Url(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
  let encoded = ""
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0
    const second = bytes[index + 1] ?? 0
    const third = bytes[index + 2] ?? 0
    encoded += alphabet[first >> 2]
    encoded += alphabet[((first & 3) << 4) | (second >> 4)]
    if (index + 1 < bytes.length) {
      encoded += alphabet[((second & 15) << 2) | (third >> 6)]
    }
    if (index + 2 < bytes.length) encoded += alphabet[third & 63]
  }
  return encoded
}

function utf8(value: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(value)
  const bytes = new Uint8Array(new ArrayBuffer(encoded.byteLength))
  bytes.set(encoded)
  return bytes
}

export function randomId(crypto: Crypto): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)))
}

export async function createPkce(crypto: Crypto): Promise<{
  verifier: string
  challenge: string
}> {
  const verifier = randomId(crypto)
  const digest = await crypto.subtle.digest("SHA-256", utf8(verifier))
  return { verifier, challenge: base64Url(new Uint8Array(digest)) }
}

export async function createProofKey(crypto: Crypto): Promise<{
  privateKey: CryptoKey
  publicJwk: JsonWebKey
}> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"]
  )
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey)
  if (!publicJwk.x || !publicJwk.y) {
    throw new LineaUserProtocolError(
      "DPoP proof key",
      "Missing JWK coordinates"
    )
  }
  return { privateKey: keyPair.privateKey, publicJwk }
}

export async function createDpopProof(input: {
  crypto: Crypto
  privateKey: CryptoKey
  publicJwk: JsonWebKey
  method: string
  url: string
  nonce: string
  accessToken: string | undefined
  now: number
}): Promise<string> {
  const target = new URL(input.url)
  target.search = ""
  target.hash = ""
  const header = base64Url(
    utf8(
      JSON.stringify({
        typ: "dpop+jwt",
        alg: "ES256",
        jwk: {
          kty: "EC",
          crv: "P-256",
          x: input.publicJwk.x,
          y: input.publicJwk.y,
        },
      })
    )
  )
  const payload: Record<string, string | number> = {
    jti: randomId(input.crypto),
    htm: input.method.toUpperCase(),
    htu: target.toString(),
    iat: Math.floor(input.now / 1000),
    nonce: input.nonce,
  }
  if (input.accessToken) {
    const digest = await input.crypto.subtle.digest(
      "SHA-256",
      utf8(input.accessToken)
    )
    payload.ath = base64Url(new Uint8Array(digest))
  }
  const encodedPayload = base64Url(utf8(JSON.stringify(payload)))
  const signingInput = `${header}.${encodedPayload}`
  const signature = await input.crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    input.privateKey,
    utf8(signingInput)
  )
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`
}
