import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { organizations } from "../schema/index.js"
import { readMemory, writeMemory } from "./memory.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"

describe("memory.repository", () => {
  it("round-trips a written value through a read in the same scope", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const scope = {
        workspaceId: organization.id,
        externalSubjectId: "user-1",
        namespace: "wf-1",
      }

      await writeMemory(tx, { ...scope, key: "favorite", value: "pizza" })

      const read = await readMemory(tx, { ...scope, key: "favorite" })
      expect(read?.value).toBe("pizza")
    })
  })

  it("overwrites the same key on a second write instead of creating a duplicate row", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const scope = {
        workspaceId: organization.id,
        externalSubjectId: "user-1",
        namespace: "wf-1",
      }

      await writeMemory(tx, { ...scope, key: "favorite", value: "pizza" })
      await writeMemory(tx, { ...scope, key: "favorite", value: "sushi" })

      const read = await readMemory(tx, { ...scope, key: "favorite" })
      expect(read?.value).toBe("sushi")
    })
  })

  it("supports arbitrary JSON values, not just strings", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const scope = {
        workspaceId: organization.id,
        externalSubjectId: "user-1",
        namespace: "wf-1",
      }

      await writeMemory(tx, {
        ...scope,
        key: "profile",
        value: { plan: "pro", seats: 5 },
      })

      const read = await readMemory(tx, { ...scope, key: "profile" })
      expect(read?.value).toEqual({ plan: "pro", seats: 5 })
    })
  })

  it("reports not-found for a value past its expiresAt", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const scope = {
        workspaceId: organization.id,
        externalSubjectId: "user-1",
        namespace: "wf-1",
      }

      await writeMemory(tx, {
        ...scope,
        key: "session",
        value: "abc",
        expiresAt: new Date(Date.now() - 60_000),
      })

      const read = await readMemory(tx, { ...scope, key: "session" })
      expect(read).toBeUndefined()
    })
  })

  it("still finds a value whose expiresAt is in the future", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const scope = {
        workspaceId: organization.id,
        externalSubjectId: "user-1",
        namespace: "wf-1",
      }

      await writeMemory(tx, {
        ...scope,
        key: "session",
        value: "abc",
        expiresAt: new Date(Date.now() + 60_000),
      })

      const read = await readMemory(tx, { ...scope, key: "session" })
      expect(read?.value).toBe("abc")
    })
  })

  it("isolates by namespace — the same key/subject in a different namespace doesn't cross-read", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const base = {
        workspaceId: organization.id,
        externalSubjectId: "user-1",
      }

      await writeMemory(tx, {
        ...base,
        namespace: "wf-1",
        key: "favorite",
        value: "pizza",
      })

      const read = await readMemory(tx, {
        ...base,
        namespace: "wf-2",
        key: "favorite",
      })
      expect(read).toBeUndefined()
    })
  })

  it("isolates by externalSubjectId — a different subject in the same namespace doesn't cross-read", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const base = { workspaceId: organization.id, namespace: "wf-1" }

      await writeMemory(tx, {
        ...base,
        externalSubjectId: "user-1",
        key: "favorite",
        value: "pizza",
      })

      const read = await readMemory(tx, {
        ...base,
        externalSubjectId: "user-2",
        key: "favorite",
      })
      expect(read).toBeUndefined()
    })
  })

  it("deletes a workspace's memory rows when the workspace itself is deleted, instead of leaving them orphaned", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const scope = {
        workspaceId: organization.id,
        externalSubjectId: "user-1",
        namespace: "wf-1",
      }
      await writeMemory(tx, { ...scope, key: "favorite", value: "pizza" })

      await tx
        .delete(organizations)
        .where(eq(organizations.id, organization.id))

      const read = await readMemory(tx, { ...scope, key: "favorite" })
      expect(read).toBeUndefined()
    })
  })
})
