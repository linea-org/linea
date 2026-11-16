import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { db, pool, repositories, schema } from '@linea/db'
import { TemplatesService } from './templates.service'

afterAll(async () => {
  await pool.end()
})

const validGraph = {
  version: 1,
  trigger: { type: 'manual' },
  entryNodeId: 'start',
  nodes: [
    { id: 'start', type: 'start', config: { triggerType: 'manual' } },
    { id: 'end', type: 'end', config: {} },
  ],
  edges: [{ from: 'start', to: 'end' }],
}

async function fixture(
  draftGraph: Record<string, unknown> | null = validGraph,
) {
  const [workspace, other] = await db
    .insert(schema.organizations)
    .values([
      { name: 'Authors', slug: randomUUID(), createdAt: new Date() },
      { name: 'Others', slug: randomUUID(), createdAt: new Date() },
    ])
    .returning()
  const [author, colleague] = await db
    .insert(schema.users)
    .values([
      { name: 'Author', email: `${randomUUID()}@test.dev` },
      { name: 'Colleague', email: `${randomUUID()}@test.dev` },
    ])
    .returning()
  const application = await repositories.application.createApplication(db, {
    workspaceId: workspace.id,
    name: 'App',
    slug: 'app',
  })
  const workflow = await repositories.workflow.createWorkflow(db, {
    workspaceId: workspace.id,
    applicationId: application.id,
    name: 'Flow',
    slug: 'flow',
    draftGraph,
  })
  const viewer = { workspaceId: workspace.id, userId: author.id }
  return { workspace, other, author, colleague, workflow, viewer }
}

const publishInput = (workflowId: string) => ({
  workflowId,
  name: 'My template',
  visibility: 'public' as const,
})

describe('TemplatesService', () => {
  const service = new TemplatesService()

  it('publishes a copy of the workflow for others to find', async () => {
    const f = await fixture()
    const published = await service.publish(
      f.viewer,
      publishInput(f.workflow.id),
    )
    expect(published).toMatchObject({ mine: true, starCount: 0, useCount: 0 })
    const seenElsewhere = await service.list(
      { workspaceId: f.other.id, userId: f.colleague.id },
      { scope: 'public', q: '', sort: 'new', page: 1 },
    )
    expect(seenElsewhere.items.map((item) => item.id)).toContain(published.id)
    expect(seenElsewhere.items[0].mine).toBe(false)
  })

  it('keeps a workspace-only template inside its workspace', async () => {
    const f = await fixture()
    const published = await service.publish(f.viewer, {
      ...publishInput(f.workflow.id),
      visibility: 'workspace',
    })
    const outside = await service.list(
      { workspaceId: f.other.id, userId: f.colleague.id },
      { scope: 'public', q: '', sort: 'new', page: 1 },
    )
    expect(outside.items.map((item) => item.id)).not.toContain(published.id)
    await expect(service.use(f.other.id, published.id)).rejects.toThrow(
      NotFoundException,
    )
  })

  it('refuses a graph that is not valid yet, or that holds a credential', async () => {
    const broken = await fixture({ version: 1 })
    await expect(
      service.publish(broken.viewer, publishInput(broken.workflow.id)),
    ).rejects.toThrow(UnprocessableEntityException)
    const leaky = await fixture({
      ...validGraph,
      nodes: [
        { id: 'start', type: 'start', config: { triggerType: 'manual' } },
        {
          id: 'call',
          type: 'http',
          config: {
            url: 'https://example.com',
            method: 'GET',
            headers: { Authorization: 'Bearer abc' },
          },
        },
        { id: 'end', type: 'end', config: {} },
      ],
      edges: [
        { from: 'start', to: 'call' },
        { from: 'call', to: 'end' },
      ],
    })
    await expect(
      service.publish(leaky.viewer, publishInput(leaky.workflow.id)),
    ).rejects.toThrow(/call\.headers\.Authorization/)
  })

  it('will not publish a workflow from another workspace', async () => {
    const f = await fixture()
    await expect(
      service.publish(
        { workspaceId: f.other.id, userId: f.colleague.id },
        publishInput(f.workflow.id),
      ),
    ).rejects.toThrow(NotFoundException)
  })

  it('counts stars once per person and uses each time', async () => {
    const f = await fixture()
    const { id } = await service.publish(f.viewer, publishInput(f.workflow.id))
    const colleague = { workspaceId: f.other.id, userId: f.colleague.id }
    expect(await service.setStar(colleague, id, true)).toEqual({
      starCount: 1,
      starred: true,
    })
    expect((await service.setStar(colleague, id, true)).starCount).toBe(1)
    await service.use(f.other.id, id)
    const used = await service.use(f.other.id, id)
    expect(used.graph).toEqual(validGraph)
    const list = await service.list(colleague, {
      scope: 'public',
      q: '',
      sort: 'stars',
      page: 1,
    })
    expect(list.items[0]).toMatchObject({
      starCount: 1,
      useCount: 2,
      starred: true,
    })
  })

  it('lets the author or a workspace admin remove a template, nobody else', async () => {
    const f = await fixture()
    const colleague = { workspaceId: f.workspace.id, userId: f.colleague.id }
    const mine = await service.publish(f.viewer, publishInput(f.workflow.id))
    await expect(service.remove(colleague, mine.id)).rejects.toThrow(
      ForbiddenException,
    )
    await db.insert(schema.members).values({
      organizationId: f.workspace.id,
      userId: f.colleague.id,
      role: 'member',
      createdAt: new Date(),
    })
    await expect(service.remove(colleague, mine.id)).rejects.toThrow(
      ForbiddenException,
    )
    const [admin] = await db
      .insert(schema.users)
      .values({ name: 'Admin', email: `${randomUUID()}@test.dev` })
      .returning()
    await db.insert(schema.members).values({
      organizationId: f.workspace.id,
      userId: admin.id,
      role: 'admin',
      createdAt: new Date(),
    })
    await service.remove(
      { workspaceId: f.workspace.id, userId: admin.id },
      mine.id,
    )
    await expect(service.use(f.workspace.id, mine.id)).rejects.toThrow(
      NotFoundException,
    )
  })

  it('keeps another workspace from removing a template, even an admin', async () => {
    const f = await fixture()
    const { id } = await service.publish(f.viewer, publishInput(f.workflow.id))
    await expect(
      service.remove({ workspaceId: f.other.id, userId: f.colleague.id }, id),
    ).rejects.toThrow(NotFoundException)
  })
})
