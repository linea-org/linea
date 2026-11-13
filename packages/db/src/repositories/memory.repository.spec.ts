import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { externalSubjects, memories, organizations } from "../schema/index.js"
import {
  deleteMemoriesForSubject,
  listMemories,
  MAX_MEMORY_VALUE_BYTES,
  MemoryLimitError,
  readMemory,
  writeMemory,
} from "./memory.repository.js"
import {
  configureTestEnvironment,
  createTestFixtures,
  getTestApplicationId,
  getTestDevelopmentEnvironmentId,
  withRollback,
} from "./test-utils.js"

async function memoryFixtures(tx: Parameters<typeof createTestFixtures>[0]) {
  const fixtures = await createTestFixtures(tx)
  const environmentId = await getTestDevelopmentEnvironmentId(
    tx,
    fixtures.organization.id,
    fixtures.workflow.id
  )
  return { ...fixtures, environmentId }
}

describe("memory.repository", () => {
  it("round-trips a written value through a read in the same scope", async () => {
    await withRollback(async (tx) => {
      const { organization, environmentId } = await memoryFixtures(tx)
      const scope = {
        workspaceId: organization.id,
        environmentId,
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
      const { organization, environmentId } = await memoryFixtures(tx)
      const scope = {
        workspaceId: organization.id,
        environmentId,
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
      const { organization, environmentId } = await memoryFixtures(tx)
      const scope = {
        workspaceId: organization.id,
        environmentId,
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
      const { organization, environmentId } = await memoryFixtures(tx)
      const scope = {
        workspaceId: organization.id,
        environmentId,
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
      const { organization, environmentId } = await memoryFixtures(tx)
      const scope = {
        workspaceId: organization.id,
        environmentId,
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
      const { organization, environmentId } = await memoryFixtures(tx)
      const base = {
        workspaceId: organization.id,
        environmentId,
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
      const { organization, environmentId } = await memoryFixtures(tx)
      const base = {
        workspaceId: organization.id,
        environmentId,
        namespace: "wf-1",
      }

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
      const { organization, environmentId } = await memoryFixtures(tx)
      const scope = {
        workspaceId: organization.id,
        environmentId,
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

  describe("listMemories", () => {
    it("orders by most-recently-updated first", async () => {
      await withRollback(async (tx) => {
        const { organization, environmentId } = await memoryFixtures(tx)
        const scope = {
          workspaceId: organization.id,
          environmentId,
          externalSubjectId: "user-1",
          namespace: "wf-1",
        }

        await writeMemory(tx, { ...scope, key: "a", value: "1st" })
        await writeMemory(tx, { ...scope, key: "b", value: "2nd" })
        // Re-writing "a" bumps its updatedAt past "b"'s, so it should sort first now.
        await writeMemory(tx, { ...scope, key: "a", value: "1st-updated" })

        const rows = await listMemories(tx, { ...scope, limit: 10 })
        expect(rows.map((r) => r.key)).toEqual(["a", "b"])
      })
    })

    it("breaks an updatedAt tie deterministically by id, instead of an arbitrary/unstable order", async () => {
      await withRollback(async (tx) => {
        const { organization, environmentId } = await memoryFixtures(tx)
        const scope = {
          workspaceId: organization.id,
          environmentId,
          externalSubjectId: "user-1",
          namespace: "wf-1",
        }

        await writeMemory(tx, { ...scope, key: "a", value: "1" })
        await writeMemory(tx, { ...scope, key: "b", value: "2" })
        // Force a real tie — writeMemory's own timestamps are never guaranteed to collide.
        const tiedAt = new Date()
        await tx
          .update(memories)
          .set({ updatedAt: tiedAt })
          .where(eq(memories.namespace, "wf-1"))

        const first = await listMemories(tx, { ...scope, limit: 10 })
        const second = await listMemories(tx, { ...scope, limit: 10 })
        expect(first.map((r) => r.key)).toEqual(second.map((r) => r.key))
      })
    })

    it("respects the limit", async () => {
      await withRollback(async (tx) => {
        const { organization, environmentId } = await memoryFixtures(tx)
        const scope = {
          workspaceId: organization.id,
          environmentId,
          externalSubjectId: "user-1",
          namespace: "wf-1",
        }

        for (const key of ["a", "b", "c", "d"]) {
          await writeMemory(tx, { ...scope, key, value: key })
        }

        const rows = await listMemories(tx, { ...scope, limit: 2 })
        expect(rows).toHaveLength(2)
      })
    })

    it("excludes expired rows", async () => {
      await withRollback(async (tx) => {
        const { organization, environmentId } = await memoryFixtures(tx)
        const scope = {
          workspaceId: organization.id,
          environmentId,
          externalSubjectId: "user-1",
          namespace: "wf-1",
        }

        await writeMemory(tx, { ...scope, key: "active", value: "still here" })
        await writeMemory(tx, {
          ...scope,
          key: "expired",
          value: "gone",
          expiresAt: new Date(Date.now() - 60_000),
        })

        const rows = await listMemories(tx, { ...scope, limit: 10 })
        expect(rows.map((r) => r.key)).toEqual(["active"])
      })
    })

    it("isolates by scope — a different namespace or subject doesn't leak in", async () => {
      await withRollback(async (tx) => {
        const { organization, environmentId } = await memoryFixtures(tx)
        const scope = {
          workspaceId: organization.id,
          environmentId,
          externalSubjectId: "user-1",
          namespace: "wf-1",
        }

        await writeMemory(tx, { ...scope, key: "a", value: "1" })
        await writeMemory(tx, {
          ...scope,
          namespace: "wf-2",
          key: "b",
          value: "2",
        })
        await writeMemory(tx, {
          ...scope,
          externalSubjectId: "user-2",
          key: "c",
          value: "3",
        })

        const rows = await listMemories(tx, { ...scope, limit: 10 })
        expect(rows.map((r) => r.key)).toEqual(["a"])
      })
    })
  })

  it("isolates by Environment — a draft or dev write is not visible to another Environment", async () => {
    await withRollback(async (tx) => {
      const { organization, environmentId } = await memoryFixtures(tx)
      const production = await configureTestEnvironment(tx, {
        workspaceId: organization.id,
        applicationId: await getTestApplicationId(tx, organization.id),
        environment: "production",
        displayName: "Memory production",
      })
      const scope = {
        workspaceId: organization.id,
        externalSubjectId: "user-1",
        namespace: "wf-1",
      }
      await writeMemory(tx, {
        ...scope,
        environmentId,
        key: "favorite",
        value: "pizza",
      })
      const read = await readMemory(tx, {
        ...scope,
        environmentId: production.id,
        key: "favorite",
      })
      expect(read).toBeUndefined()
    })
  })

  it("never lets an operator-keyed subject string reach a verified End User's rows", async () => {
    await withRollback(async (tx) => {
      const { organization, environmentId } = await memoryFixtures(tx)
      const [subject] = await tx
        .insert(externalSubjects)
        .values({
          workspaceId: organization.id,
          issuer: "https://identity.example.com",
          issuerSubject: "end-user-1",
          status: "verified",
          verifiedAt: new Date(),
        })
        .returning()
      const scope = {
        workspaceId: organization.id,
        environmentId,
        namespace: "wf-1",
      }
      await writeMemory(tx, {
        ...scope,
        externalSubjectRecordId: subject.id,
        externalSubjectId: subject.id,
        key: "favorite",
        value: "pizza",
      })
      const forged = await readMemory(tx, {
        ...scope,
        externalSubjectId: subject.id,
        key: "favorite",
      })
      expect(forged).toBeUndefined()
      const own = await readMemory(tx, {
        ...scope,
        externalSubjectRecordId: subject.id,
        externalSubjectId: "ignored",
        key: "favorite",
      })
      expect(own?.value).toBe("pizza")
    })
  })

  it("deletes a subject's memory, including operator rows keyed by its issuer subject", async () => {
    await withRollback(async (tx) => {
      const { organization, environmentId } = await memoryFixtures(tx)
      const [subject] = await tx
        .insert(externalSubjects)
        .values({
          workspaceId: organization.id,
          issuer: "https://identity.example.com",
          issuerSubject: "end-user-2",
          status: "verified",
          verifiedAt: new Date(),
        })
        .returning()
      const scope = {
        workspaceId: organization.id,
        environmentId,
        namespace: "wf-1",
      }
      await writeMemory(tx, {
        ...scope,
        externalSubjectRecordId: subject.id,
        externalSubjectId: subject.id,
        key: "verified",
        value: "1",
      })
      await writeMemory(tx, {
        ...scope,
        externalSubjectId: "end-user-2",
        key: "operator",
        value: "2",
      })
      await writeMemory(tx, {
        ...scope,
        externalSubjectId: "someone-else",
        key: "kept",
        value: "3",
      })
      await deleteMemoriesForSubject(tx, {
        workspaceId: organization.id,
        externalSubjectRecordId: subject.id,
        issuerSubject: "end-user-2",
      })
      const rows = await tx
        .select({ key: memories.key })
        .from(memories)
        .where(eq(memories.workspaceId, organization.id))
      expect(rows.map((row) => row.key)).toEqual(["kept"])
    })
  })

  it("rejects a value over the size limit", async () => {
    await withRollback(async (tx) => {
      const { organization, environmentId } = await memoryFixtures(tx)
      await expect(
        writeMemory(tx, {
          workspaceId: organization.id,
          environmentId,
          externalSubjectId: "user-1",
          namespace: "wf-1",
          key: "large",
          value: "x".repeat(MAX_MEMORY_VALUE_BYTES),
        })
      ).rejects.toThrow(MemoryLimitError)
    })
  })
})
