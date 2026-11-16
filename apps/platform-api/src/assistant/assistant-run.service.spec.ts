import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { NotFoundException } from '@nestjs/common'
import { db, pool, repositories, schema } from '@linea/db'
import type { ExecutionsService } from '../executions/executions.service'
import { AssistantRunService } from './assistant-run.service'

afterAll(async () => {
  await pool.end()
})

const graph = {
  version: 1,
  trigger: { type: 'manual' },
  entryNodeId: 'start',
  nodes: [
    { id: 'start', type: 'start', config: { triggerType: 'manual' } },
    { id: 'end', type: 'end', config: {} },
  ],
  edges: [{ from: 'start', to: 'end' }],
} as never

async function fixture() {
  const [workspace] = await db
    .insert(schema.organizations)
    .values({ name: 'Runs', slug: randomUUID(), createdAt: new Date() })
    .returning()
  const application = await repositories.application.createApplication(db, {
    workspaceId: workspace.id,
    name: 'App',
    slug: 'app',
  })
  return { workspace, application }
}

describe('AssistantRunService', () => {
  it('runs on one hidden scratch workflow that is reused', async () => {
    const f = await fixture()
    const testRun = jest.fn().mockResolvedValue({ id: 'execution' })
    const service = new AssistantRunService({
      testRun,
    } as unknown as ExecutionsService)
    await service.run(f.workspace.id, 'user', f.application.id, { graph })
    await service.run(f.workspace.id, 'user', f.application.id, { graph })
    const [first, second] = testRun.mock.calls as [string, string][]
    expect(first[1]).toBe(second[1])
    const listed = await repositories.workflow.listWorkflows(db, f.workspace.id)
    expect(listed.map((workflow) => workflow.id)).not.toContain(first[1])
  })

  it('refuses an application from another workspace', async () => {
    const f = await fixture()
    const other = await fixture()
    const service = new AssistantRunService({
      testRun: jest.fn(),
    } as unknown as ExecutionsService)
    await expect(
      service.run(f.workspace.id, 'user', other.application.id, { graph }),
    ).rejects.toThrow(NotFoundException)
  })
})
