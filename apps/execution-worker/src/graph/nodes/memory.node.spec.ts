import "@linea/config/env"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linea/db"
import { MemoryNode } from "./memory.node"

afterAll(async () => {
  await pool.end()
})

async function setup() {
  const suffix = randomUUID()
  const [organization] = await db
    .insert(schema.organizations)
    .values({
      name: "Memory Node Test Org",
      slug: `memory-node-${suffix}`,
      createdAt: new Date(),
    })
    .returning()
  return { organization }
}

describe("MemoryNode", () => {
  it("writes then reads back the same value in the same scope", async () => {
    const { organization } = await setup()
    try {
      const node = new MemoryNode()
      const context = { workspaceId: organization.id, workflowId: "wf-1" }

      const writeOutput = await node.execute(
        { operation: "write", subjectPath: "userId", key: "favorite" },
        { userId: "u1", food: "pizza" },
        context
      )
      expect(writeOutput).toMatchObject({ key: "favorite" })

      const readOutput = await node.execute(
        { operation: "read", subjectPath: "userId", key: "favorite" },
        { userId: "u1" },
        context
      )
      expect(readOutput).toEqual({
        found: true,
        value: { userId: "u1", food: "pizza" },
      })
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("stores only the field at valuePath when configured, not the whole input", async () => {
    const { organization } = await setup()
    try {
      const node = new MemoryNode()
      const context = { workspaceId: organization.id, workflowId: "wf-1" }

      await node.execute(
        {
          operation: "write",
          subjectPath: "userId",
          key: "favorite",
          valuePath: "food",
        },
        { userId: "u1", food: "pizza" },
        context
      )

      const readOutput = await node.execute(
        { operation: "read", subjectPath: "userId", key: "favorite" },
        { userId: "u1" },
        context
      )
      expect(readOutput).toEqual({ found: true, value: "pizza" })
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("overwrites the same key on a second write", async () => {
    const { organization } = await setup()
    try {
      const node = new MemoryNode()
      const context = { workspaceId: organization.id, workflowId: "wf-1" }

      await node.execute(
        {
          operation: "write",
          subjectPath: "userId",
          key: "favorite",
          valuePath: "food",
        },
        { userId: "u1", food: "pizza" },
        context
      )
      await node.execute(
        {
          operation: "write",
          subjectPath: "userId",
          key: "favorite",
          valuePath: "food",
        },
        { userId: "u1", food: "sushi" },
        context
      )

      const readOutput = await node.execute(
        { operation: "read", subjectPath: "userId", key: "favorite" },
        { userId: "u1" },
        context
      )
      expect(readOutput).toEqual({ found: true, value: "sushi" })
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("reports not-found for a read on a key that was never written", async () => {
    const { organization } = await setup()
    try {
      const node = new MemoryNode()
      const context = { workspaceId: organization.id, workflowId: "wf-1" }

      const readOutput = await node.execute(
        { operation: "read", subjectPath: "userId", key: "nope" },
        { userId: "u1" },
        context
      )
      expect(readOutput).toEqual({ found: false, value: null })
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("write sets expiresAt from ttlSeconds, and a read after it passes reports not-found", async () => {
    const { organization } = await setup()
    try {
      const node = new MemoryNode()
      const context = { workspaceId: organization.id, workflowId: "wf-1" }

      const writeOutput = (await node.execute(
        {
          operation: "write",
          subjectPath: "userId",
          key: "session",
          valuePath: "token",
          ttlSeconds: 60,
        },
        { userId: "u1", token: "abc" },
        context
      )) as { expiresAt: string }
      expect(new Date(writeOutput.expiresAt).getTime()).toBeGreaterThan(
        Date.now()
      )

      // Force the row past expiry directly, rather than waiting 60s in a test.
      await repositories.memory.writeMemory(db, {
        workspaceId: organization.id,
        externalSubjectId: "u1",
        namespace: "wf-1",
        key: "session",
        value: "abc",
        expiresAt: new Date(Date.now() - 1000),
      })

      const readOutput = await node.execute(
        { operation: "read", subjectPath: "userId", key: "session" },
        { userId: "u1" },
        context
      )
      expect(readOutput).toEqual({ found: false, value: null })
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("rejects a non-positive ttlSeconds with a clear error", async () => {
    const { organization } = await setup()
    try {
      const node = new MemoryNode()

      await expect(
        node.execute(
          {
            operation: "write",
            subjectPath: "userId",
            key: "session",
            ttlSeconds: -1,
          },
          { userId: "u1" },
          { workspaceId: organization.id, workflowId: "wf-1" }
        )
      ).rejects.toThrow("must be a positive number")
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("isolates by namespace — defaults to context.workflowId when not configured", async () => {
    const { organization } = await setup()
    try {
      const node = new MemoryNode()

      await node.execute(
        {
          operation: "write",
          subjectPath: "userId",
          key: "favorite",
          valuePath: "food",
        },
        { userId: "u1", food: "pizza" },
        { workspaceId: organization.id, workflowId: "wf-1" }
      )

      const readInOtherWorkflow = await node.execute(
        { operation: "read", subjectPath: "userId", key: "favorite" },
        { userId: "u1" },
        { workspaceId: organization.id, workflowId: "wf-2" }
      )
      expect(readInOtherWorkflow).toEqual({ found: false, value: null })

      const readInSameWorkflow = await node.execute(
        { operation: "read", subjectPath: "userId", key: "favorite" },
        { userId: "u1" },
        { workspaceId: organization.id, workflowId: "wf-1" }
      )
      expect(readInSameWorkflow).toEqual({ found: true, value: "pizza" })
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("shares across workflows when the same explicit namespace is configured", async () => {
    const { organization } = await setup()
    try {
      const node = new MemoryNode()

      await node.execute(
        {
          operation: "write",
          subjectPath: "userId",
          key: "favorite",
          valuePath: "food",
          namespace: "shared",
        },
        { userId: "u1", food: "pizza" },
        { workspaceId: organization.id, workflowId: "wf-1" }
      )

      const readFromOtherWorkflow = await node.execute(
        {
          operation: "read",
          subjectPath: "userId",
          key: "favorite",
          namespace: "shared",
        },
        { userId: "u1" },
        { workspaceId: organization.id, workflowId: "wf-2" }
      )
      expect(readFromOtherWorkflow).toEqual({ found: true, value: "pizza" })
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("throws a clear error when neither namespace nor workflowId is available", async () => {
    const { organization } = await setup()
    try {
      const node = new MemoryNode()

      await expect(
        node.execute(
          { operation: "read", subjectPath: "userId", key: "favorite" },
          { userId: "u1" },
          { workspaceId: organization.id }
        )
      ).rejects.toThrow("no namespace and no workflowId")
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("throws a clear error when the subjectPath resolves to nothing", async () => {
    const { organization } = await setup()
    try {
      const node = new MemoryNode()

      await expect(
        node.execute(
          { operation: "read", subjectPath: "missing", key: "favorite" },
          { userId: "u1" },
          { workspaceId: organization.id, workflowId: "wf-1" }
        )
      ).rejects.toThrow('no value found at subjectPath "missing"')
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})
