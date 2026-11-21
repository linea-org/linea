import { createHash } from "node:crypto"
import { betterAuth } from "better-auth"
import { memoryAdapter } from "better-auth/adapters/memory"
import { magicLink } from "better-auth/plugins"
import { expect, it } from "vitest"
import {
  bindMagicLinkToDevice,
  DEVICE_VERIFIER_HEADER,
  magicLinkDeviceBinding,
} from "./magic-link-device-binding.js"

const verifier = "a".repeat(64)
const challenge = createHash("sha256").update(verifier).digest("base64url")

function createAuth() {
  const values = new Map<string, string>()
  const store = {
    get: (key: string) => Promise.resolve(values.get(key) ?? null),
    set: (key: string, value: string) => {
      values.set(key, value)
      return Promise.resolve("OK")
    },
  }
  const sent: string[] = []
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "magic-link-device-binding-spec-secret",
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
    }),
    plugins: [
      magicLinkDeviceBinding(store),
      magicLink({
        sendMagicLink: async ({ token, metadata }) => {
          await bindMagicLinkToDevice(store, token, metadata)
          sent.push(token)
        },
      }),
    ],
  })
  return { auth, sent }
}

async function request(metadata?: Record<string, unknown>) {
  const { auth, sent } = createAuth()
  await auth.api.signInMagicLink({
    body: { email: "user@example.test", metadata },
    headers: new Headers(),
  })
  return { auth, token: sent[0] }
}

const verify = (
  auth: ReturnType<typeof createAuth>["auth"],
  token: string,
  deviceVerifier?: string
) =>
  auth.api.magicLinkVerify({
    query: { token },
    headers: new Headers(
      deviceVerifier ? { [DEVICE_VERIFIER_HEADER]: deviceVerifier } : {}
    ),
  })

it("signs in on the device that requested the link", async () => {
  const { auth, token } = await request({ deviceChallenge: challenge })
  await expect(verify(auth, token, verifier)).resolves.toBeDefined()
})

it("refuses a bound link from another device or from one with no verifier", async () => {
  const { auth, token } = await request({ deviceChallenge: challenge })
  await expect(verify(auth, token, "b".repeat(64))).rejects.toMatchObject({
    statusCode: 403,
  })
  await expect(verify(auth, token)).rejects.toMatchObject({ statusCode: 403 })
})

it("refuses an unbound link from the native app, which always sends its verifier", async () => {
  const { auth, token } = await request()
  await expect(verify(auth, token, verifier)).rejects.toMatchObject({
    statusCode: 403,
  })
})

it("still lets the web verify a link that was never bound", async () => {
  const { auth, token } = await request()
  await expect(verify(auth, token)).resolves.toBeDefined()
})

it("rejects a malformed challenge when the link is requested", async () => {
  const { auth } = createAuth()
  await expect(
    auth.api.signInMagicLink({
      body: { email: "user@example.test", metadata: { deviceChallenge: "x" } },
      headers: new Headers(),
    })
  ).rejects.toMatchObject({ statusCode: 400 })
})
