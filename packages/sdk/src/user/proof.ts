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

export async function createDpopProof(input: {
  crypto: Crypto
  sign(data: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer>
  publicJwk: JsonWebKey
  method: string
  url: string
  nonce: string
  accessToken: string | undefined
  now: number
}): Promise<string> {
  if (!input.publicJwk.x || !input.publicJwk.y || input.publicJwk.d) {
    throw new LineaUserProtocolError(
      "DPoP proof key",
      "Missing or unsafe JWK coordinates"
    )
  }
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
  const signature = await input.sign(utf8(signingInput))
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`
}
import { LineaUserProtocolError } from "./errors.js"
