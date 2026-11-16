import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { organizations, users } from "../schema/index.js"
import { withRollback } from "./test-utils.js"
import type { Transaction } from "./types.js"
import {
  createWorkflowTemplate,
  deleteWorkflowTemplate,
  getVisibleWorkflowTemplate,
  listWorkflowTemplates,
  recordWorkflowTemplateUse,
  setWorkflowTemplateStar,
} from "./workflow-template.repository.js"

const graph = { version: 1 }

async function fixture(tx: Transaction) {
  const [mine, theirs] = await tx
    .insert(organizations)
    .values([
      { name: "Mine", slug: randomUUID(), createdAt: new Date() },
      { name: "Theirs", slug: randomUUID(), createdAt: new Date() },
    ])
    .returning()
  const [alice, bob] = await tx
    .insert(users)
    .values([
      { name: "Alice", email: `${randomUUID()}@test.dev` },
      { name: "Bob", email: `${randomUUID()}@test.dev` },
    ])
    .returning()
  const make = (
    workspaceId: string,
    name: string,
    visibility: "workspace" | "public"
  ) =>
    createWorkflowTemplate(tx, {
      workspaceId,
      authorId: alice.id,
      name,
      graph,
      visibility,
    })
  return { mine, theirs, alice, bob, make }
}

const page = { query: "", sort: "new", page: 1, pageSize: 10 } as const

describe("workflow templates", () => {
  it("shows another workspace only what it published publicly", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const secret = await f.make(f.theirs.id, "Private", "workspace")
      const shared = await f.make(f.theirs.id, "Shared", "public")
      expect(
        await getVisibleWorkflowTemplate(tx, f.mine.id, secret.id)
      ).toBeUndefined()
      expect(
        (await getVisibleWorkflowTemplate(tx, f.mine.id, shared.id))?.name
      ).toBe("Shared")
      const viewer = { workspaceId: f.mine.id, userId: f.bob.id }
      const publicList = await listWorkflowTemplates(tx, viewer, {
        ...page,
        scope: "public",
      })
      const names = publicList.items.map((item) => item.name)
      expect(names).toContain("Shared")
      expect(names).not.toContain("Private")
      expect(
        publicList.items.find((item) => item.id === shared.id)?.workspaceName
      ).toBe("Theirs")
      const ownList = await listWorkflowTemplates(tx, viewer, {
        ...page,
        scope: "workspace",
      })
      expect(ownList.items).toEqual([])
    })
  })

  it("keeps the star count in step, one star per person", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const template = await f.make(f.mine.id, "Starred", "public")
      const alice = { workspaceId: f.mine.id, userId: f.alice.id }
      const bob = { workspaceId: f.theirs.id, userId: f.bob.id }
      expect(
        await setWorkflowTemplateStar(tx, alice, template.id, true)
      ).toEqual({
        starCount: 1,
        starred: true,
      })
      expect(
        (await setWorkflowTemplateStar(tx, alice, template.id, true))?.starCount
      ).toBe(1)
      expect(
        (await setWorkflowTemplateStar(tx, bob, template.id, true))?.starCount
      ).toBe(2)
      expect(
        (await setWorkflowTemplateStar(tx, alice, template.id, false))
          ?.starCount
      ).toBe(1)
      expect(
        (await setWorkflowTemplateStar(tx, alice, template.id, false))
          ?.starCount
      ).toBe(1)
      const list = await listWorkflowTemplates(tx, bob, {
        ...page,
        scope: "public",
      })
      expect(list.items.find((item) => item.id === template.id)).toMatchObject({
        starCount: 1,
        starred: true,
      })
    })
  })

  it("will not star or use a private template from another workspace", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const secret = await f.make(f.theirs.id, "Private", "workspace")
      const outsider = { workspaceId: f.mine.id, userId: f.bob.id }
      expect(
        await setWorkflowTemplateStar(tx, outsider, secret.id, true)
      ).toBeUndefined()
      expect(
        await recordWorkflowTemplateUse(tx, f.mine.id, secret.id)
      ).toBeUndefined()
    })
  })

  it("counts each use and sorts by it", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const token = randomUUID().slice(0, 8)
      await f.make(f.mine.id, `Quiet ${token}`, "public")
      const busy = await f.make(f.mine.id, `Busy ${token}`, "public")
      await recordWorkflowTemplateUse(tx, f.theirs.id, busy.id)
      const used = await recordWorkflowTemplateUse(tx, f.theirs.id, busy.id)
      expect(used?.useCount).toBe(2)
      const list = await listWorkflowTemplates(
        tx,
        { workspaceId: f.theirs.id, userId: f.bob.id },
        { ...page, scope: "public", sort: "used", query: token }
      )
      expect(list.items.map((item) => item.name)).toEqual([
        `Busy ${token}`,
        `Quiet ${token}`,
      ])
    })
  })

  it("pages, searches and reports the total", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const token = randomUUID().slice(0, 8)
      for (const name of ["Alpha flow", "Beta flow", "Gamma 100%"]) {
        await f.make(f.mine.id, `${token} ${name}`, "public")
      }
      const viewer = { workspaceId: f.mine.id, userId: f.alice.id }
      const base = { ...page, scope: "public", query: token } as const
      const first = await listWorkflowTemplates(tx, viewer, {
        ...base,
        pageSize: 2,
      })
      expect(first.items).toHaveLength(2)
      expect(first.total).toBe(3)
      const second = await listWorkflowTemplates(tx, viewer, {
        ...base,
        pageSize: 2,
        page: 2,
      })
      expect(second.items).toHaveLength(1)
      const found = await listWorkflowTemplates(tx, viewer, {
        ...base,
        query: `${token} Beta`,
      })
      expect(found.total).toBe(1)
      const literal = await listWorkflowTemplates(tx, viewer, {
        ...base,
        query: `${token} Gamma 100%`,
      })
      expect(literal.items.map((item) => item.name)).toEqual([
        `${token} Gamma 100%`,
      ])
    })
  })

  it("lets only the authoring workspace delete a template", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const template = await f.make(f.mine.id, "Mine", "public")
      expect(
        await deleteWorkflowTemplate(tx, f.theirs.id, template.id)
      ).toBeUndefined()
      expect(
        (await deleteWorkflowTemplate(tx, f.mine.id, template.id))?.id
      ).toBe(template.id)
    })
  })
})
