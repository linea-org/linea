import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common'
import { db, pool, repositories, schema } from '@linea/db'
import { PlatformAdminGuard } from '../../auth/platform-admin.guard'
import { TemplatesService } from '../templates.service'
import { TemplateModerationService } from './template-moderation.service'

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
}

async function fixture() {
  const [authors, others] = await db
    .insert(schema.organizations)
    .values([
      { name: 'Authors', slug: randomUUID(), createdAt: new Date() },
      { name: 'Others', slug: randomUUID(), createdAt: new Date() },
    ])
    .returning()
  const [author, staff, ...reporters] = await db
    .insert(schema.users)
    .values(
      ['author', 'staff', 'r1', 'r2', 'r3'].map((name) => ({
        name,
        email: `${randomUUID()}@test.dev`,
      })),
    )
    .returning()
  await repositories.templateModeration.grantPlatformAdmin(db, staff.id)
  const application = await repositories.application.createApplication(db, {
    workspaceId: authors.id,
    name: 'App',
    slug: 'app',
  })
  const workflow = await repositories.workflow.createWorkflow(db, {
    workspaceId: authors.id,
    applicationId: application.id,
    name: 'Flow',
    slug: 'flow',
    draftGraph: graph,
  })
  const templates = new TemplatesService()
  const viewer = { workspaceId: authors.id, userId: author.id }
  const published = await templates.publish(viewer, {
    workflowId: workflow.id,
    name: 'Shared',
    visibility: 'public',
  })
  const asReporter = (index: number) => ({
    workspaceId: others.id,
    userId: reporters[index].id,
  })
  return {
    authors,
    others,
    author,
    staff,
    templates,
    viewer,
    published,
    asReporter,
  }
}

function contextFor(userId: string | undefined) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ session: userId ? { user: { id: userId } } : null }),
    }),
  } as unknown as ExecutionContext
}

describe('PlatformAdminGuard', () => {
  const guard = new PlatformAdminGuard()

  it('lets staff in and keeps everyone else out', async () => {
    const f = await fixture()
    await expect(guard.canActivate(contextFor(f.staff.id))).resolves.toBe(true)
    await expect(guard.canActivate(contextFor(f.author.id))).rejects.toThrow(
      ForbiddenException,
    )
    await expect(guard.canActivate(contextFor(undefined))).rejects.toThrow(
      UnauthorizedException,
    )
  })
})

describe('reporting a template', () => {
  it('refuses a report on your own template, or on one you cannot see', async () => {
    const f = await fixture()
    await expect(
      f.templates.report(f.viewer, f.published.id, { reason: 'spam' }),
    ).rejects.toThrow(ForbiddenException)
    await expect(
      f.templates.report(f.asReporter(0), randomUUID(), { reason: 'spam' }),
    ).rejects.toThrow(NotFoundException)
  })

  it('hides a template for browsers once enough people report it, but not for its author', async () => {
    const f = await fixture()
    for (const index of [0, 1, 2]) {
      await f.templates.report(f.asReporter(index), f.published.id, {
        reason: 'credentials',
        details: 'Has a key',
      })
    }
    const listed = await f.templates.list(f.asReporter(0), {
      scope: 'public',
      q: '',
      sort: 'new',
      page: 1,
    })
    expect(listed.items.map((item) => item.id)).not.toContain(f.published.id)
    await expect(f.templates.use(f.others.id, f.published.id)).rejects.toThrow(
      NotFoundException,
    )
    const own = await f.templates.list(f.viewer, {
      scope: 'workspace',
      q: '',
      sort: 'new',
      page: 1,
    })
    const mine = own.items.find((item) => item.id === f.published.id)
    expect(mine?.moderation.status).toBe('hidden')
    expect(mine?.moderation.note).toContain('pending review')
  })
})

describe('TemplateModerationService', () => {
  const moderation = new TemplateModerationService()

  it('hides, restores and removes a template, and shows the trail', async () => {
    const f = await fixture()
    await f.templates.report(f.asReporter(0), f.published.id, {
      reason: 'spam',
    })
    expect(
      (await moderation.listReports({ status: 'open', page: 1 })).total,
    ).toBeGreaterThan(0)
    await moderation.setHidden(f.staff.id, f.published.id, true, 'Live key')
    const hidden = await moderation.detail(f.published.id)
    expect(hidden.template.moderationStatus).toBe('hidden')
    expect(hidden.reports.every((report) => report.status === 'actioned')).toBe(
      true,
    )
    await moderation.setHidden(f.staff.id, f.published.id, false, undefined)
    const restored = await moderation.detail(f.published.id)
    expect(restored.events.map((event) => event.action).sort()).toEqual([
      'hide',
      'unhide',
    ])
    await moderation.remove(f.staff.id, f.published.id, 'Spam')
    await expect(moderation.detail(f.published.id)).rejects.toThrow(
      NotFoundException,
    )
  })

  it('leaves the graph out of the review listing and dismisses a report once', async () => {
    const f = await fixture()
    await f.templates.report(f.asReporter(1), f.published.id, {
      reason: 'other',
    })
    const listed = await moderation.listTemplates({ q: 'Shared', page: 1 })
    expect(listed.items[0]).not.toHaveProperty('graph')
    const detail = await moderation.detail(f.published.id)
    await moderation.dismissReport(f.staff.id, detail.reports[0].id, 'Fine')
    await expect(
      moderation.dismissReport(f.staff.id, detail.reports[0].id, 'Again'),
    ).rejects.toThrow(NotFoundException)
  })
})
