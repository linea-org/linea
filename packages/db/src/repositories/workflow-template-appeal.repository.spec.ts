import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { organizations, users } from "../schema/index.js"
import { withRollback } from "./test-utils.js"
import type { Transaction } from "./types.js"
import {
  MAX_APPEALS_PER_TEMPLATE,
  createTemplateAppeal,
  decideTemplateAppeal,
  getAppealStates,
  listTemplateAppeals,
} from "./workflow-template-appeal.repository.js"
import {
  getTemplateForModeration,
  setTemplateHidden,
} from "./workflow-template-moderation.repository.js"
import {
  createWorkflowTemplate,
  getVisibleWorkflowTemplate,
} from "./workflow-template.repository.js"

async function fixture(tx: Transaction, hidden = true) {
  const [author, other] = await tx
    .insert(organizations)
    .values([
      { name: "Author", slug: randomUUID(), createdAt: new Date() },
      { name: "Other", slug: randomUUID(), createdAt: new Date() },
    ])
    .returning()
  const [alice, staff] = await tx
    .insert(users)
    .values(
      ["alice", "staff"].map((name) => ({
        name,
        email: `${randomUUID()}@test.dev`,
      }))
    )
    .returning()
  const template = await createWorkflowTemplate(tx, {
    workspaceId: author.id,
    authorId: alice.id,
    name: "Shared",
    graph: {},
    visibility: "public",
  })
  if (hidden) {
    await setTemplateHidden(tx, {
      templateId: template.id,
      actorId: staff.id,
      hidden: true,
      note: "Looks unsafe",
    })
  }
  const appeal = (type: "not_a_violation" | "other" = "not_a_violation") =>
    createTemplateAppeal(tx, {
      templateId: template.id,
      workspaceId: author.id,
      appellantId: alice.id,
      type,
      message: "Please look again",
    })
  return { author, other, alice, staff, template, appeal }
}

describe("template appeals", () => {
  it("takes an appeal on a hidden template from its own workspace, one at a time", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const first = await f.appeal()
      expect(first.outcome).toBe("created")
      expect((await f.appeal()).outcome).toBe("already_open")
    })
  })

  it("refuses an appeal on a template that is not hidden, or from another workspace", async () => {
    await withRollback(async (tx) => {
      const visible = await fixture(tx, false)
      expect((await visible.appeal()).outcome).toBe("not_hidden")
      const f = await fixture(tx)
      const outsider = await createTemplateAppeal(tx, {
        templateId: f.template.id,
        workspaceId: f.other.id,
        appellantId: f.alice.id,
        type: "other",
        message: null,
      })
      expect(outsider.outcome).toBe("not_found")
    })
  })

  it("restores the template when an appeal is upheld, and says so in the trail", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const created = await f.appeal()
      if (created.outcome !== "created") throw new Error("expected an appeal")
      const decided = await decideTemplateAppeal(tx, {
        appealId: created.appeal.id,
        actorId: f.staff.id,
        decision: "upheld",
        note: "Checked: fine",
      })
      expect(decided).toMatchObject({
        status: "upheld",
        decisionNote: "Checked: fine",
      })
      expect(
        (await getVisibleWorkflowTemplate(tx, f.other.id, f.template.id))
          ?.moderationStatus
      ).toBe("active")
      const detail = await getTemplateForModeration(tx, f.template.id)
      expect(detail?.events.map((event) => event.action).sort()).toEqual(
        ["appeal", "appeal_upheld", "hide"].sort()
      )
      expect(detail?.appeals).toHaveLength(1)
    })
  })

  it("leaves the template hidden when rejected, decides an appeal once, and stops after the limit", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      for (let round = 0; round < MAX_APPEALS_PER_TEMPLATE; round++) {
        const created = await f.appeal()
        if (created.outcome !== "created") throw new Error("expected an appeal")
        const decision = {
          appealId: created.appeal.id,
          actorId: f.staff.id,
          decision: "rejected" as const,
          note: "Still unsafe",
        }
        expect((await decideTemplateAppeal(tx, decision))?.status).toBe(
          "rejected"
        )
        expect(await decideTemplateAppeal(tx, decision)).toBeUndefined()
      }
      expect((await f.appeal()).outcome).toBe("limit_reached")
      expect(
        await getVisibleWorkflowTemplate(tx, f.other.id, f.template.id)
      ).toBeUndefined()
      const state = (await getAppealStates(tx, [f.template.id])).get(
        f.template.id
      )
      expect(state?.total).toBe(MAX_APPEALS_PER_TEMPLATE)
      expect(state?.latest.status).toBe("rejected")
    })
  })

  it("lists open appeals with the template and who appealed", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      await f.appeal("other")
      const { items } = await listTemplateAppeals(tx, {
        status: "open",
        page: 1,
        pageSize: 100,
      })
      const mine = items.find((item) => item.templateId === f.template.id)
      expect(mine).toMatchObject({
        templateName: "Shared",
        workspaceName: "Author",
        appellantName: "alice",
        type: "other",
      })
    })
  })
})
