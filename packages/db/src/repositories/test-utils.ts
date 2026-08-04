import { randomUUID } from "node:crypto"
import { db } from "../clients/index.js"
import { organizations } from "../schema/index.js"
import { createWorkflow, createWorkflowVersion } from "./workflow.repository.js"
import type { Transaction } from "./types.js"

const rollbackSentinel = new Error("test transaction rollback")

/** Rolls back regardless of outcome, so tests hit real Postgres with no manual cleanup. */
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

/** Minimal org + workflow + version, for tests needing valid tenant/workflow FKs. */
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
