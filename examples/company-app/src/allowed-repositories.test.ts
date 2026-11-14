import assert from "node:assert/strict"
import { test } from "node:test"
import {
  allowedRepository,
  parseAllowedRepositories,
} from "./allowed-repositories.ts"
import { HttpError } from "./http-error.ts"

const allowed = parseAllowedRepositories(" acme/demo , Acme/Docs ")

function status(body: unknown): number | undefined {
  try {
    allowedRepository(allowed, body)
    return undefined
  } catch (error) {
    if (error instanceof HttpError) return error.status
    throw error
  }
}

test("accepts only listed repositories, ignoring case", () => {
  assert.equal(
    allowedRepository(allowed, { repository: "acme/demo" }),
    "acme/demo"
  )
  assert.equal(
    allowedRepository(allowed, { repository: "ACME/docs" }),
    "ACME/docs"
  )
  assert.equal(status({ repository: "acme/private-billing" }), 403)
})

test("rejects malformed and dot-segment repositories", () => {
  for (const repository of ["../x", "acme/..", "./demo", "acme", "a/b/c", 42])
    assert.equal(status({ repository }), 400)
})

test("refuses an empty or invalid allow-list at startup", () => {
  assert.throws(() => parseAllowedRepositories(" , "), /at least one/)
  assert.throws(() => parseAllowedRepositories("acme/.."), /invalid entry/)
})
