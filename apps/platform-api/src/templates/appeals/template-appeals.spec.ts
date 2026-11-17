import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import {
  db,
  pool,
  repositories,
  schema,
  templateAppealTypeIds,
} from '@linealabs/db'
import type { TemplateModerationNotifier } from '../moderation/template-moderation-notifier'
import { TemplateModerationService } from '../moderation/template-moderation.service'
import { TemplatesService } from '../templates.service'
import { appealTypeDefinition, listAppealTypes } from './template-appeal-types'
import { TemplateAppealsService } from './template-appeals.service'

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

const hidden = jest.fn()
const appealDecided = jest.fn()
const notifier = {
  hidden,
  appealDecided,
} as unknown as TemplateModerationNotifier
const templates = new TemplatesService(notifier)
const appeals = new TemplateAppealsService()
const moderation = new TemplateModerationService(notifier)

beforeEach(() => {
  hidden.mockClear()
  appealDecided.mockClear()
})

async function fixture() {
  const [workspace, others] = await db
    .insert(schema.organizations)
    .values([
      { name: 'Authors', slug: randomUUID(), createdAt: new Date() },
      { name: 'Others', slug: randomUUID(), createdAt: new Date() },
    ])
    .returning()
  const [author, staff, member, admin, browser] = await db
    .insert(schema.users)
    .values(
      ['author', 'staff', 'member', 'admin', 'browser'].map((name) => ({
        name,
        email: `${randomUUID()}@test.dev`,
      })),
    )
    .returning()
  await db.insert(schema.members).values(
    [
      [member, 'member'],
      [admin, 'admin'],
    ].map(([user, role]) => ({
      organizationId: workspace.id,
      userId: (user as typeof member).id,
      role: role as string,
      createdAt: new Date(),
    })),
  )
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
    draftGraph: graph,
  })
  const asAuthor = { workspaceId: workspace.id, userId: author.id }
  const published = await templates.publish(asAuthor, {
    workflowId: workflow.id,
    name: 'Shared',
    visibility: 'public',
  })
  const viewAsAuthor = async () =>
    (
      await templates.list(asAuthor, {
        scope: 'workspace',
        q: '',
        sort: 'new',
        page: 1,
      })
    ).items.find((item) => item.id === published.id)
  const hide = () =>
    moderation.setHidden(staff.id, published.id, true, 'Looks unsafe')
  return {
    workspace,
    others,
    staff,
    asAuthor,
    asMember: { workspaceId: workspace.id, userId: member.id },
    asAdmin: { workspaceId: workspace.id, userId: admin.id },
    asBrowser: { workspaceId: others.id, userId: browser.id },
    published,
    viewAsAuthor,
    hide,
  }
}

describe('appeal types', () => {
  it('has wording for every type the database accepts', () => {
    expect(listAppealTypes().map((type) => type.id)).toEqual([
      ...templateAppealTypeIds,
    ])
    expect(appealTypeDefinition('other').messageRequired).toBe(true)
    expect(appealTypeDefinition('credentials_rotated').messageRequired).toBe(
      false,
    )
  })
})

describe('appealing a hidden template', () => {
  it('is only possible once it is hidden, and the type decides whether words are needed', async () => {
    const f = await fixture()
    await expect(
      appeals.submit(f.asAuthor, f.published.id, {
        type: 'credentials_rotated',
      }),
    ).rejects.toThrow(ConflictException)
    await f.hide()
    await expect(
      appeals.submit(f.asAuthor, f.published.id, { type: 'not_a_violation' }),
    ).rejects.toThrow(UnprocessableEntityException)
    await expect(
      appeals.submit(f.asAuthor, f.published.id, {
        type: 'credentials_rotated',
      }),
    ).resolves.toMatchObject({ status: 'open' })
  })

  it('lets the author or an admin appeal, not another member or another workspace', async () => {
    const f = await fixture()
    await f.hide()
    const input = { type: 'automatic_hide_review' } as const
    await expect(
      appeals.submit(f.asMember, f.published.id, input),
    ).rejects.toThrow(ForbiddenException)
    await expect(
      appeals.submit(f.asBrowser, f.published.id, input),
    ).rejects.toThrow(NotFoundException)
    await expect(
      appeals.submit(f.asAdmin, f.published.id, input),
    ).resolves.toBeDefined()
  })

  it('shows the author where it stands, from waiting to decided', async () => {
    const f = await fixture()
    await f.hide()
    expect(await f.viewAsAuthor()).toMatchObject({
      canAppeal: true,
      appeal: null,
      moderation: { status: 'hidden', note: 'Looks unsafe' },
    })
    await appeals.submit(f.asAuthor, f.published.id, {
      type: 'not_a_violation',
      message: 'It is a plain router',
    })
    expect(await f.viewAsAuthor()).toMatchObject({
      canAppeal: false,
      appeal: { status: 'open', type: 'not_a_violation' },
    })
    await expect(
      appeals.submit(f.asAuthor, f.published.id, {
        type: 'other',
        message: 'again',
      }),
    ).rejects.toThrow(ConflictException)
    const [open] = (
      await moderation.listAppeals({ status: 'open', page: 1 })
    ).items.filter((item) => item.templateId === f.published.id)
    await moderation.decideAppeal(
      f.staff.id,
      open.id,
      'rejected',
      'Still unsafe',
    )
    expect(appealDecided).toHaveBeenCalledWith(
      expect.objectContaining({ id: open.id }),
      expect.objectContaining({ id: f.published.id }),
      { upheld: false, note: 'Still unsafe', finalAppeal: false },
    )
    expect(await f.viewAsAuthor()).toMatchObject({
      canAppeal: true,
      appeal: { status: 'rejected', decisionNote: 'Still unsafe' },
    })
  })

  it('puts the template back when an appeal is upheld', async () => {
    const f = await fixture()
    await f.hide()
    await appeals.submit(f.asAuthor, f.published.id, {
      type: 'reported_in_bad_faith',
      message: 'Same person reported it from three accounts',
    })
    const detail = await moderation.detail(f.published.id)
    expect(detail.appeals).toHaveLength(1)
    await moderation.decideAppeal(
      f.staff.id,
      detail.appeals[0].id,
      'upheld',
      undefined,
    )
    expect(appealDecided).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { upheld: true, note: null, finalAppeal: false },
    )
    expect(
      (await moderation.detail(f.published.id)).template.moderationStatus,
    ).toBe('active')
    const community = await templates.list(f.asBrowser, {
      scope: 'public',
      q: 'Shared',
      sort: 'new',
      page: 1,
    })
    expect(community.items.map((item) => item.id)).toContain(f.published.id)
    await expect(
      moderation.decideAppeal(
        f.staff.id,
        detail.appeals[0].id,
        'upheld',
        undefined,
      ),
    ).rejects.toThrow(NotFoundException)
  })
})
