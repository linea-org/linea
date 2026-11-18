import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { db, pool, repositories, schema } from '@linealabs/db'
import { hashWorkflowGraph, workflowGraphSchema } from '@linealabs/runtime'
import { inspectRun, listRecentRuns } from './assistant-run-inspector'

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

async function workflowFixture() {
  const [workspace] = await db
    .insert(schema.organizations)
    .values({ name: 'Runs', slug: randomUUID(), createdAt: new Date() })
    .returning()
  const application = await repositories.application.createApplication(db, {
    workspaceId: workspace.id,
    name: 'Runs',
    slug: 'runs',
  })
  const workflow = await repositories.workflow.createWorkflow(db, {
    workspaceId: workspace.id,
    applicationId: application.id,
    name: 'Flow',
    slug: randomUUID(),
  })
  return { workspaceId: workspace.id, workflowId: workflow.id }
}

async function runWithStep(
  f: { workspaceId: string; workflowId: string },
  externalSubjectId?: string,
) {
  const version = await repositories.workflow.ensureVersionForGraph(
    db,
    f.workflowId,
    { graph, contentHash: hashWorkflowGraph(graph) },
  )
  const result =
    await repositories.execution.triggerWorkflowExecutionForVersion(
      db,
      f.workspaceId,
      f.workflowId,
      version.id,
      { trigger: 'manual', externalSubjectId },
    )
  if (result.outcome !== 'created') throw new Error(result.outcome)
  await db.insert(schema.executionSteps).values({
    executionId: result.execution.id,
    workspaceId: f.workspaceId,
    traceId: 't',
    spanId: randomUUID(),
    name: 'start',
    nodeId: 'start',
    sequence: 1,
    startedAt: new Date(),
    status: 'succeeded',
    output: { secret: 'end-user text' },
  })
  return result.execution.id
}

describe('run inspector', () => {
  it("lists this workflow's runs, newest first", async () => {
    const f = await workflowFixture()
    expect((await listRecentRuns(f.workflowId)).content).toContain('no runs')
    const id = await runWithStep(f)
    const outcome = await listRecentRuns(f.workflowId)
    expect(outcome.content).toContain(`${id} queued, manual in dev`)
  })

  it("shows a run's steps with their output", async () => {
    const f = await workflowFixture()
    const id = await runWithStep(f)
    const outcome = await inspectRun(f.workspaceId, f.workflowId, id)
    expect(outcome.content).toContain('- start (succeeded) output:')
    expect(outcome.action).toEqual({ kind: 'inspect_runs', executionId: id })
  })

  it('never shows the model what an End-User sent or got back', async () => {
    const f = await workflowFixture()
    const id = await runWithStep(f, 'end-user-1')
    const outcome = await inspectRun(f.workspaceId, f.workflowId, id)
    expect(outcome.content).toContain('output hidden')
    expect(outcome.content).not.toContain('end-user text')
  })

  it('refuses a run of another workflow, another workspace or a bad id', async () => {
    const f = await workflowFixture()
    const other = await workflowFixture()
    const id = await runWithStep(other)
    for (const [workspaceId, workflowId, executionId] of [
      [f.workspaceId, f.workflowId, id],
      [f.workspaceId, other.workflowId, id],
      [f.workspaceId, f.workflowId, 'not-a-uuid'],
    ]) {
      const outcome = await inspectRun(workspaceId, workflowId, executionId)
      expect(outcome.action).toBeNull()
    }
  })
})
