import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { db, pool, repositories, schema } from '@linealabs/db'
import { hashWorkflowGraph, workflowGraphSchema } from '@linealabs/runtime'

afterAll(async () => {
  await pool.end()
})

const graph = workflowGraphSchema.parse({
  version: 1,
  trigger: { type: 'manual' },
  entryNodeId: 'start',
  nodes: [{ id: 'start', type: 'start', config: { triggerType: 'manual' } }],
  edges: [],
})

async function queuedRun(environment: 'draft' | 'dev') {
  const [workspace] = await db
    .insert(schema.organizations)
    .values({ name: 'Cancel', slug: randomUUID(), createdAt: new Date() })
    .returning()
  const application = await repositories.application.createApplication(db, {
    workspaceId: workspace.id,
    name: 'Cancel',
    slug: 'cancel',
  })
  const workflow = await repositories.workflow.findOrCreateScratchWorkflow(
    db,
    workspace.id,
    application.id,
  )
  const version = await repositories.workflow.ensureVersionForGraph(
    db,
    workflow.id,
    { graph, contentHash: hashWorkflowGraph(graph) },
  )
  const result =
    await repositories.execution.triggerWorkflowExecutionForVersion(
      db,
      workspace.id,
      workflow.id,
      version.id,
      { trigger: 'manual', environment },
    )
  if (result.outcome !== 'created') throw new Error(result.outcome)
  return { workspaceId: workspace.id, executionId: result.execution.id }
}

describe('cancelDraftExecution', () => {
  it('stops an unfinished draft run so the worker never claims it', async () => {
    const run = await queuedRun('draft')
    const cancelled = await repositories.execution.cancelDraftExecution(
      db,
      run.workspaceId,
      run.executionId,
    )
    expect(cancelled?.status).toBe('cancelled')
    expect(cancelled?.completedAt).toBeInstanceOf(Date)
  })

  it('leaves runs that are not drafts, or in another workspace, alone', async () => {
    const live = await queuedRun('dev')
    const draft = await queuedRun('draft')
    for (const [workspaceId, executionId] of [
      [live.workspaceId, live.executionId],
      [live.workspaceId, draft.executionId],
    ]) {
      await expect(
        repositories.execution.cancelDraftExecution(
          db,
          workspaceId,
          executionId,
        ),
      ).resolves.toBeUndefined()
    }
  })
})
