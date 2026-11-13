// Demo only: a shared access code stands in for your real sign-in. A real app authenticates each user and derives the End User subject from that identity.
import { createHash, randomUUID, timingSafeEqual } from "node:crypto"
import { HttpError } from "./http-error.ts"

export const minimumCodeLength = 16
export const sessionLifetimeMs = 60 * 60 * 1000
export const maxSessions = 50
export const failureWindowMs = 15 * 60 * 1000
export const maxFailuresPerClient = 5
export const maxFailuresOverall = 50

export type Session = { id: string; expiresAt: number; tasks: Set<string> }

export function createAccessGate(code: string, now: () => number) {
  if (code.length < minimumCodeLength)
    throw new Error(
      `DEMO_ACCESS_CODE must be at least ${minimumCodeLength} characters; see README.md`
    )
  const expected = createHash("sha256").update(code).digest()
  const sessions = new Map<string, Session>()
  let failures = new Map<string, number>()
  let failuresOverall = 0
  let windowEndsAt = now() + failureWindowMs
  function tooManyAttempts(): HttpError {
    const seconds = Math.ceil((windowEndsAt - now()) / 1000)
    return new HttpError(429, "Too many attempts; try again later", {
      "retry-after": String(seconds),
    })
  }
  function sweep() {
    const time = now()
    if (time >= windowEndsAt) {
      failures = new Map()
      failuresOverall = 0
      windowEndsAt = time + failureWindowMs
    }
    for (const [id, session] of sessions)
      if (session.expiresAt <= time) sessions.delete(id)
  }
  return {
    /** Counts failed codes per client and overall; once either limit is hit, even the right code is refused until the window ends. */
    signIn(candidate: unknown, client: string): Session {
      sweep()
      if (
        (failures.get(client) ?? 0) >= maxFailuresPerClient ||
        failuresOverall >= maxFailuresOverall
      )
        throw tooManyAttempts()
      const digest = createHash("sha256")
        .update(typeof candidate === "string" ? candidate : "")
        .digest()
      if (typeof candidate !== "string" || !timingSafeEqual(digest, expected)) {
        failures.set(client, (failures.get(client) ?? 0) + 1)
        failuresOverall += 1
        throw new HttpError(401, "Access code not recognised")
      }
      if (sessions.size >= maxSessions)
        throw new HttpError(429, "Sign-in is temporarily full; try again later")
      const session = {
        id: randomUUID(),
        expiresAt: now() + sessionLifetimeMs,
        tasks: new Set<string>(),
      }
      sessions.set(session.id, session)
      return session
    },
    session(id: string | undefined): Session {
      const session = id ? sessions.get(id) : undefined
      if (!session || session.expiresAt <= now()) {
        if (id) sessions.delete(id)
        throw new HttpError(401, "Sign in with the access code first")
      }
      return session
    },
    signOut(id: string | undefined) {
      if (id) sessions.delete(id)
    },
  }
}
