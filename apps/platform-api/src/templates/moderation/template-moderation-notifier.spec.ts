import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { db, pool, repositories, schema } from '@linealabs/db'
import { sendEmail } from '@linealabs/auth/email'
import { TemplateModerationNotifier } from './template-moderation-notifier'

jest.mock('@linealabs/auth/email', () => ({ sendEmail: jest.fn() }))
jest.mock('@linealabs/auth/emails', () => ({
  noticeEmailHtml: jest.fn(() => '<p>notice</p>'),
}))

const send = sendEmail as jest.Mock

afterAll(async () => {
  await pool.end()
})

beforeEach(() => {
  send.mockReset()
  process.env.APP_URL = 'https://app.example.com'
})

async function fixture(emailNotifications = true) {
  const [workspace] = await db
    .insert(schema.organizations)
    .values({ name: 'Authors', slug: randomUUID(), createdAt: new Date() })
    .returning()
  const [author] = await db
    .insert(schema.users)
    .values({ name: 'Author', email: `${randomUUID()}@test.dev` })
    .returning()
  if (!emailNotifications) {
    await db
      .insert(schema.userSettings)
      .values({ userId: author.id, emailNotifications: false })
  }
  const template = await repositories.workflowTemplate.createWorkflowTemplate(
    db,
    {
      workspaceId: workspace.id,
      authorId: author.id,
      name: 'Shared',
      graph: {},
      visibility: 'public',
    },
  )
  const notices = async () =>
    repositories.notification.listNotifications(db, author.id, {
      workspaceId: workspace.id,
      unreadOnly: false,
      archived: false,
      limit: 20,
    })
  return { workspace, author, template, notices }
}

describe('TemplateModerationNotifier', () => {
  const notifier = new TemplateModerationNotifier()

  it('tells the author in the app and by email when their template is hidden', async () => {
    const f = await fixture()
    await notifier.hidden(f.template, 'Contains a live key')
    const [notice] = await f.notices()
    expect(notice).toMatchObject({
      type: 'template.hidden',
      severity: 'warning',
      metadata: { templateId: f.template.id },
    })
    expect(notice.body).toContain('Contains a live key')
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: '“Shared” was hidden' }),
    )
  })

  it('still notifies in the app, but sends no email, when they have turned emails off', async () => {
    const f = await fixture(false)
    await notifier.hidden(f.template, null)
    expect(await f.notices()).toHaveLength(1)
    expect(send).not.toHaveBeenCalled()
  })

  it('keeps the in-app notice, and does not throw, when the email fails', async () => {
    const f = await fixture()
    send.mockRejectedValue(new Error('provider down'))
    await expect(notifier.hidden(f.template, null)).resolves.toBeUndefined()
    expect(await f.notices()).toHaveLength(1)
  })

  it('says whether an appeal was upheld or rejected, and when it was the last', async () => {
    const f = await fixture()
    const appeal = { appellantId: f.author.id }
    await notifier.appealDecided(appeal, f.template, {
      upheld: true,
      note: null,
      finalAppeal: false,
    })
    await notifier.appealDecided(appeal, f.template, {
      upheld: false,
      note: 'Still unsafe',
      finalAppeal: true,
    })
    const byType = Object.fromEntries(
      (await f.notices()).map((notice) => [notice.type, notice]),
    )
    expect(byType['template.appeal_upheld'].severity).toBe('success')
    expect(byType['template.appeal_rejected'].body).toContain('Still unsafe')
    expect(byType['template.appeal_rejected'].body).toContain('last appeal')
  })

  it('tells nobody when there is no one to tell', async () => {
    const f = await fixture()
    await notifier.hidden({ ...f.template, authorId: null }, null)
    await notifier.appealDecided({ appellantId: null }, f.template, {
      upheld: true,
      note: null,
      finalAppeal: false,
    })
    expect(await f.notices()).toHaveLength(0)
    expect(send).not.toHaveBeenCalled()
  })
})
