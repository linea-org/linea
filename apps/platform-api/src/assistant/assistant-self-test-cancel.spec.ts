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

  it('keeps the cost and tokens of steps that finished before the cancel', async () => {
    const run = await queuedRun('draft')
    await pool.query(
      `UPDATE executions SET status = 'running', leased_by = 'worker-1',
        lease_expires_at = now() + interval '1 minute' WHERE id = $1`,
      [run.executionId],
    )
    const step = (nodeId: string) => ({
      leasedBy: 'worker-1',
      step: {
        executionId: run.executionId,
        workspaceId: run.workspaceId,
        traceId: run.executionId,
        spanId: randomUUID(),
        name: 'ai',
        nodeId,
        status: 'succeeded' as const,
        startedAt: new Date(),
        endedAt: new Date(),
        sequence: 0,
        idempotencyKey: `${run.executionId}:${nodeId}`,
        costMicros: 1500n,
        tokensInput: 40,
        tokensOutput: 12,
        attributes: { costUnpriced: false },
      },
      checkpoint: { sequence: 0, completedStepIds: [nodeId], context: {} },
    })
    await repositories.checkpoint.writeStepAndCheckpoint(db, step('answer'))

    const cancelled = await repositories.execution.cancelDraftExecution(
      db,
      run.workspaceId,
      run.executionId,
    )

    expect(cancelled).toMatchObject({
      status: 'cancelled',
      costMicros: 1500n,
      costUnpriced: false,
      tokensInput: 40,
      tokensOutput: 12,
    })
    // The worker can't add a step after the cancel, so the saved totals stay complete.
    await expect(
      repositories.checkpoint.writeStepAndCheckpoint(db, step('later')),
    ).resolves.toBeUndefined()
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
