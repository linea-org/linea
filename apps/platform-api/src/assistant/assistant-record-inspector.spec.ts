import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { db, pool, repositories, schema } from '@linealabs/db'
import { hashWorkflowGraph, workflowGraphSchema } from '@linealabs/runtime'
import {
  inspectApplication,
  inspectWorkflow,
} from './assistant-record-inspector'

afterAll(async () => {
  await pool.end()
})

const graph = workflowGraphSchema.parse({
  version: 1,
  trigger: { type: 'manual' },
  entryNodeId: 'start',
  nodes: [
    { id: 'start', type: 'start', config: { triggerType: 'manual' } },
    {
      id: 'call-api',
      type: 'http',
      config: {
        url: 'https://example.com',
        headers: { Authorization: 'Bearer sk-secret-token' },
      },
    },
  ],
  edges: [{ from: 'start', to: 'call-api' }],
})

async function fixture(name: string) {
  const [workspace] = await db
    .insert(schema.organizations)
    .values({ name, slug: randomUUID(), createdAt: new Date() })
    .returning()
  const application = await repositories.application.createApplication(db, {
    workspaceId: workspace.id,
    name: `${name} app`,
    slug: 'app',
  })
  const workflow = await repositories.workflow.createWorkflow(db, {
    workspaceId: workspace.id,
    applicationId: application.id,
    name: `${name} flow`,
    slug: randomUUID(),
    description: 'd'.repeat(500),
  })
  await repositories.workflow.saveWorkflowDraft(
    db,
    workspace.id,
    workflow.id,
    graph,
  )
  return { workspaceId: workspace.id, application, workflow }
}

describe('record inspector', () => {
  it('outlines a Workflow of the workspace without any node config', async () => {
    const f = await fixture('Mine')
    const { content } = await inspectWorkflow(f.workspaceId, f.workflow.id)
    expect(content).toContain('Workflow "Mine flow"')
    expect(content).toContain('draft only')
    expect(content).toContain('- start (start)')
    expect(content).toContain('- call-api (http)')
    expect(content).toContain('- start -> call-api')
    expect(content).not.toContain('sk-secret-token')
    expect(content).not.toContain('example.com')
    expect(content).not.toContain('d'.repeat(301))
  })

  it('reports the published version number', async () => {
    const f = await fixture('Mine')
    const version = await repositories.workflow.ensureVersionForGraph(
      db,
      f.workflow.id,
      { graph, contentHash: hashWorkflowGraph(graph) },
    )
    await repositories.workflow.publishWorkflowVersion(
      db,
      f.workflow.id,
      version.id,
    )
    const { content } = await inspectWorkflow(f.workspaceId, f.workflow.id)
    expect(content).toContain(`published, version ${version.version}`)
  })

  it('lists an Application with its Workflows and no archived ones', async () => {
    const f = await fixture('Mine')
    const archived = await repositories.workflow.createWorkflow(db, {
      workspaceId: f.workspaceId,
      applicationId: f.application.id,
      name: 'Old flow',
      slug: randomUUID(),
    })
    await repositories.workflow.updateWorkflow(db, f.workspaceId, archived.id, {
      archivedAt: new Date(),
    })
    const { content } = await inspectApplication(
      f.workspaceId,
      f.application.id,
    )
    expect(content).toContain('Application "Mine app"')
    expect(content).toContain(`- ${f.workflow.id} "Mine flow" (draft only)`)
    expect(content).not.toContain('Old flow')
    expect(content).toContain('Agents:\n- none')
  })

  it('refuses a record of another workspace, an unknown id and a short id alike', async () => {
    const mine = await fixture('Mine')
    const theirs = await fixture('Theirs')
    const missing = [
      await inspectWorkflow(mine.workspaceId, theirs.workflow.id),
      await inspectWorkflow(mine.workspaceId, randomUUID()),
      await inspectWorkflow(mine.workspaceId, theirs.workflow.id.slice(0, 8)),
      await inspectApplication(mine.workspaceId, theirs.application.id),
      await inspectApplication(mine.workspaceId, randomUUID()),
      await inspectApplication(mine.workspaceId, undefined),
    ]
    expect(missing.map((outcome) => outcome.content)).toEqual([
      'No Workflow in this workspace has that id.',
      'No Workflow in this workspace has that id.',
      'No Workflow in this workspace has that id.',
      'No Application in this workspace has that id.',
      'No Application in this workspace has that id.',
      'No Application in this workspace has that id.',
    ])
  })

  it('caps how many nodes it lists', async () => {
    const f = await fixture('Mine')
    const nodes = Array.from({ length: 60 }, (_, index) => ({
      id: `n${index}`,
      type: 'end',
    }))
    await repositories.workflow.saveWorkflowDraft(
      db,
      f.workspaceId,
      f.workflow.id,
      {
        nodes,
        edges: [],
      },
    )
    const { content } = await inspectWorkflow(f.workspaceId, f.workflow.id)
    expect(content).toContain('- and 10 more')
    expect(content).not.toContain('n55 ')
  })
})
