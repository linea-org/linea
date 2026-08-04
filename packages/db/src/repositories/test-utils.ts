import { randomUUID } from "node:crypto"
import { db } from "../clients/index.js"
import { organizations } from "../schema/index.js"
import { createWorkflow, createWorkflowVersion } from "./workflow.repository.js"
import type { Transaction } from "./types.js"

const rollbackSentinel = new Error("test transaction rollback")

// Runs `fn` inside a transaction that always rolls back, so repository
// tests hit a real Postgres without leaving data behind or needing
// per-test cleanup. Repository functions that open their own nested
// db.transaction() calls run as savepoints within it.
export async function withRollback(
  fn: (tx: Transaction) => Promise<void>
): Promise<void> {
  await db
    .transaction(async (tx) => {
      await fn(tx)
      throw rollbackSentinel
    })
    .catch((error: unknown) => {
      if (error !== rollbackSentinel) throw error
    })
}

// Minimal org + workflow + published-worthy version, for tests that need a
// valid tenant/workflow to satisfy the composite foreign keys.
export async function createTestFixtures(tx: Transaction) {
  const suffix = randomUUID()

  const [organization] = await tx
    .insert(organizations)
    .values({
      name: "Test Org",
      slug: `test-org-${suffix}`,
      createdAt: new Date(),
    })
    .returning()

  const workflow = await createWorkflow(tx, {
    workspaceId: organization.id,
    name: "Test Workflow",
    slug: `test-workflow-${suffix}`,
  })

  const version = await createWorkflowVersion(tx, {
    workflowId: workflow.id,
    graph: { nodes: [], edges: [] },
    contentHash: "test-hash",
  })

  return { organization, workflow, version }
}
