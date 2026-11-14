import assert from "node:assert/strict"
import { test } from "node:test"
import {
  createAccessGate,
  failureWindowMs,
  maxFailuresOverall,
  maxFailuresPerClient,
  maxSessions,
  sessionLifetimeMs,
} from "./access-gate.ts"
import { HttpError } from "./http-error.ts"

const code = "correct-horse-battery-staple"

function clock() {
  let time = 1_000_000
  return { now: () => time, advance: (ms: number) => (time += ms) }
}

function rejectsWith(status: number, action: () => unknown) {
  assert.throws(
    action,
    (error: unknown) => error instanceof HttpError && error.status === status
  )
}

test("refuses a short access code at startup", () => {
  assert.throws(() => createAccessGate("short", Date.now), /at least 16/)
})

test("locks a client out after repeated wrong codes, even for the right code", () => {
  const time = clock()
  const gate = createAccessGate(code, time.now)
  for (let attempt = 0; attempt < maxFailuresPerClient; attempt++)
    rejectsWith(401, () => gate.signIn("wrong-guess", "203.0.113.1"))
  rejectsWith(429, () => gate.signIn(code, "203.0.113.1"))
  assert.ok(gate.signIn(code, "203.0.113.2"))
  time.advance(failureWindowMs)
  assert.ok(gate.signIn(code, "203.0.113.1"))
})

test("stops all sign-ins once wrong codes from many clients reach the overall limit", () => {
  const gate = createAccessGate(code, clock().now)
  for (let attempt = 0; attempt < maxFailuresOverall; attempt++)
    rejectsWith(401, () => gate.signIn(undefined, `198.51.100.${attempt}`))
  rejectsWith(429, () => gate.signIn(code, "203.0.113.9"))
})

test("expires sessions and frees their slots", () => {
  const time = clock()
  const gate = createAccessGate(code, time.now)
  const sessions = Array.from({ length: maxSessions }, () =>
    gate.signIn(code, "203.0.113.1")
  )
  rejectsWith(429, () => gate.signIn(code, "203.0.113.1"))
  assert.equal(gate.session(sessions[0]?.id), sessions[0])
  time.advance(sessionLifetimeMs)
  rejectsWith(401, () => gate.session(sessions[0]?.id))
  assert.ok(gate.signIn(code, "203.0.113.1"))
})

test("signing out ends the session", () => {
  const gate = createAccessGate(code, clock().now)
  const session = gate.signIn(code, "203.0.113.1")
  gate.signOut(session.id)
  rejectsWith(401, () => gate.session(session.id))
})
