import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import {
  organizations,
  users,
  workflowTemplateModerationEvents,
  workflowTemplates,
} from "../schema/index.js"
import { withRollback } from "./test-utils.js"
import type { Transaction } from "./types.js"
import {
  AUTO_HIDE_REPORTS,
  createTemplateReport,
  dismissTemplateReport,
  getTemplateForModeration,
  grantPlatformAdmin,
  isPlatformAdmin,
  listTemplateReports,
  listTemplatesForModeration,
  removeTemplateAsModerator,
  setTemplateHidden,
} from "./workflow-template-moderation.repository.js"
import {
  createWorkflowTemplate,
  getVisibleWorkflowTemplate,
  listWorkflowTemplates,
  recordWorkflowTemplateUse,
} from "./workflow-template.repository.js"

async function fixture(tx: Transaction) {
  const [author, other] = await tx
    .insert(organizations)
    .values([
      { name: "Author", slug: randomUUID(), createdAt: new Date() },
      { name: "Other", slug: randomUUID(), createdAt: new Date() },
    ])
    .returning()
  const people = await tx
    .insert(users)
    .values(
      ["staff", "r1", "r2", "r3"].map((name) => ({
        name,
        email: `${randomUUID()}@test.dev`,
      }))
    )
    .returning()
  const [staff, ...reporters] = people
  const template = await createWorkflowTemplate(tx, {
    workspaceId: author.id,
    authorId: null,
    name: "Shared",
    graph: { version: 1 },
    visibility: "public",
  })
  const report = (index: number) =>
    createTemplateReport(tx, {
      templateId: template.id,
      reporterId: reporters[index].id,
      reporterWorkspaceId: other.id,
      reason: "credentials",
      details: null,
    })
  return { author, other, staff, reporters, template, report }
}

const community = (viewer: { workspaceId: string; userId: string }) =>
  listWorkflowTemplates(tx0(), viewer, {
    scope: "public",
    query: "",
    sort: "new",
    page: 1,
    pageSize: 10,
  })
let tx0: () => Transaction

describe("platform admins", () => {
  it("knows who is staff", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      expect(await isPlatformAdmin(tx, f.staff.id)).toBe(false)
      await grantPlatformAdmin(tx, f.staff.id)
      await grantPlatformAdmin(tx, f.staff.id)
      expect(await isPlatformAdmin(tx, f.staff.id)).toBe(true)
    })
  })
})

describe("template reports", () => {
  it("counts a person once, and hides the template when enough people report it", async () => {
    await withRollback(async (tx) => {
      tx0 = () => tx
      const f = await fixture(tx)
      expect((await f.report(0)).created).toBe(true)
      expect((await f.report(0)).created).toBe(false)
      expect(await f.report(1)).toEqual({ created: true, autoHidden: false })
      expect(AUTO_HIDE_REPORTS).toBe(3)
      expect(await f.report(2)).toEqual({ created: true, autoHidden: true })
      const viewer = { workspaceId: f.other.id, userId: f.reporters[0].id }
      expect(
        (await community(viewer)).items.some(
          (item) => item.id === f.template.id
        )
      ).toBe(false)
      expect(
        await getVisibleWorkflowTemplate(tx, f.other.id, f.template.id)
      ).toBeUndefined()
      expect(
        await recordWorkflowTemplateUse(tx, f.other.id, f.template.id)
      ).toBeUndefined()
      expect(
        (await getVisibleWorkflowTemplate(tx, f.author.id, f.template.id))
          ?.moderationStatus
      ).toBe("hidden")
      const events = await tx
        .select()
        .from(workflowTemplateModerationEvents)
        .where(eq(workflowTemplateModerationEvents.templateId, f.template.id))
      expect(events.map((event) => [event.action, event.actorId])).toEqual([
        ["auto_hide", null],
      ])
    })
  })

  it("lists open reports with the template and who reported it", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      await f.report(0)
      const { items } = await listTemplateReports(tx, {
        status: "open",
        page: 1,
        pageSize: 100,
      })
      expect(
        items.find((item) => item.templateId === f.template.id)
      ).toMatchObject({
        templateName: "Shared",
        workspaceName: "Author",
        reporterName: "r1",
        reason: "credentials",
      })
    })
  })
})

describe("moderator decisions", () => {
  it("hides and restores a template, closes its reports, and records both", async () => {
    await withRollback(async (tx) => {
      tx0 = () => tx
      const f = await fixture(tx)
      await f.report(0)
      const hidden = await setTemplateHidden(tx, {
        templateId: f.template.id,
        actorId: f.staff.id,
        hidden: true,
        note: "Contains a live key",
      })
      expect(hidden).toMatchObject({
        moderationStatus: "hidden",
        moderationNote: "Contains a live key",
        moderatedBy: f.staff.id,
      })
      const actioned = await listTemplateReports(tx, {
        status: "actioned",
        page: 1,
        pageSize: 100,
      })
      expect(
        actioned.items.some((item) => item.templateId === f.template.id)
      ).toBe(true)
      await setTemplateHidden(tx, {
        templateId: f.template.id,
        actorId: f.staff.id,
        hidden: false,
        note: null,
      })
      const detail = await getTemplateForModeration(tx, f.template.id)
      expect(detail?.template.moderationStatus).toBe("active")
      expect(detail?.template.moderationNote).toBeNull()
      expect(detail?.events.map((event) => event.action).sort()).toEqual([
        "hide",
        "unhide",
      ])
      expect(detail?.reports).toHaveLength(1)
    })
  })

  it("removes a template but keeps the record of it", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const removed = await removeTemplateAsModerator(tx, {
        templateId: f.template.id,
        actorId: f.staff.id,
        note: "Spam",
      })
      expect(removed?.id).toBe(f.template.id)
      expect(await getTemplateForModeration(tx, f.template.id)).toBeUndefined()
      const [event] = await tx
        .select()
        .from(workflowTemplateModerationEvents)
        .where(
          eq(workflowTemplateModerationEvents.authorWorkspaceId, f.author.id)
        )
      expect(event).toMatchObject({
        action: "remove",
        templateName: "Shared",
        templateId: null,
        note: "Spam",
      })
    })
  })

  it("dismisses an open report once", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      await f.report(0)
      const report = (
        await listTemplateReports(tx, {
          status: "open",
          page: 1,
          pageSize: 100,
        })
      ).items.find((item) => item.templateId === f.template.id)
      if (!report) throw new Error("expected the report")
      const input = {
        reportId: report.id,
        actorId: f.staff.id,
        note: "Not an issue",
      }
      expect((await dismissTemplateReport(tx, input))?.status).toBe("dismissed")
      expect(await dismissTemplateReport(tx, input)).toBeUndefined()
    })
  })

  it("lists public templates for review, most reported first", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const token = randomUUID().slice(0, 8)
      await tx
        .update(workflowTemplates)
        .set({ name: `Shared ${token}` })
        .where(eq(workflowTemplates.id, f.template.id))
      const quiet = await createWorkflowTemplate(tx, {
        workspaceId: f.author.id,
        name: `Quiet ${token}`,
        graph: {},
        visibility: "public",
      })
      await createWorkflowTemplate(tx, {
        workspaceId: f.author.id,
        name: `Private ${token}`,
        graph: {},
        visibility: "workspace",
      })
      await f.report(0)
      const { items } = await listTemplatesForModeration(tx, {
        status: null,
        query: token,
        page: 1,
        pageSize: 10,
      })
      expect(items.map((item) => item.name)).toEqual([
        `Shared ${token}`,
        `Quiet ${token}`,
      ])
      expect(items[0].openReportCount).toBe(1)
      expect(items[1].id).toBe(quiet.id)
    })
  })
})
