import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { db, pool, repositories, schema } from '@linealabs/db'
import {
  inspectApplication,
  inspectWorkflow,
} from './assistant-record-inspector'

afterAll(async () => {
  await pool.end()
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
  })
  return { workspaceId: workspace.id, application, workflow }
}

describe('record inspector', () => {
  it('shows a Workflow of the workspace by its full id', async () => {
    const f = await fixture('Mine')
    const outcome = await inspectWorkflow(f.workspaceId, f.workflow.id)
    expect(outcome.content).toContain('Workflow "Mine flow"')
    expect(outcome.content).toContain('Not published.')
    expect(outcome.content).toContain('Draft graph: null')
  })

  it('shows an Application with its Workflows and no archived ones', async () => {
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
    const outcome = await inspectApplication(f.workspaceId, f.application.id)
    expect(outcome.content).toContain('Application "Mine app"')
    expect(outcome.content).toContain(`- "Mine flow" ${f.workflow.id}`)
    expect(outcome.content).not.toContain('Old flow')
    expect(outcome.content).toContain('Agents:\n- none')
  })

  it('refuses a record of another workspace, an unknown id and a short id', async () => {
    const mine = await fixture('Mine')
    const theirs = await fixture('Theirs')
    const missing = [
      await inspectWorkflow(mine.workspaceId, theirs.workflow.id),
      await inspectWorkflow(mine.workspaceId, randomUUID()),
      await inspectWorkflow(mine.workspaceId, theirs.workflow.id.slice(0, 8)),
      await inspectApplication(mine.workspaceId, theirs.application.id),
      await inspectApplication(mine.workspaceId, undefined),
    ]
    for (const outcome of missing) {
      expect(outcome.content).toMatch(/^No (Workflow|Application) in this/)
      expect(outcome.content).not.toContain('Theirs')
    }
  })
})
