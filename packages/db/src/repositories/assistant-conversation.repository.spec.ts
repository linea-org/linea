import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { organizations, users, workflows } from "../schema/index.js"
import { createApplication } from "./application.repository.js"
import {
  appendAssistantMessage,
  createAssistantConversation,
  deleteAssistantConversation,
  getAssistantConversation,
  listAssistantConversations,
  listPinnedAssistantConversations,
  setAssistantConversationPinned,
  listAssistantMessages,
} from "./assistant-conversation.repository.js"
import { withRollback } from "./test-utils.js"
import type { Transaction } from "./types.js"

async function fixture(tx: Transaction) {
  const [workspace] = await tx
    .insert(organizations)
    .values({ name: "Chats", slug: randomUUID(), createdAt: new Date() })
    .returning()
  const [alice, bob] = await tx
    .insert(users)
    .values([
      { name: "Alice", email: `${randomUUID()}@test.dev` },
      { name: "Bob", email: `${randomUUID()}@test.dev` },
    ])
    .returning()
  const application = await createApplication(tx, {
    workspaceId: workspace.id,
    name: "Support",
    slug: "support",
  })
  const [workflow] = await tx
    .insert(workflows)
    .values({
      workspaceId: workspace.id,
      applicationId: application.id,
      name: "Flow",
      slug: "flow",
    })
    .returning()
  return { workspace, alice, bob, workflow }
}

describe("assistant conversations", () => {
  it("keeps messages in the order they were written", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const chat = await createAssistantConversation(tx, {
        workspaceId: f.workspace.id,
        userId: f.alice.id,
        workflowId: null,
        title: "First chat",
      })
      for (const [role, content] of [
        ["user", "hello"],
        ["assistant", "hi"],
        ["user", "build it"],
      ] as const) {
        await appendAssistantMessage(tx, {
          workspaceId: f.workspace.id,
          conversationId: chat.id,
          role,
          content,
        })
      }
      const messages = await listAssistantMessages(tx, f.workspace.id, chat.id)
      expect(messages.map((message) => message.content)).toEqual([
        "hello",
        "hi",
        "build it",
      ])
    })
  })

  it("stores a proposal and the actions taken with a reply", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const chat = await createAssistantConversation(tx, {
        workspaceId: f.workspace.id,
        userId: f.alice.id,
        workflowId: null,
        title: "Proposal",
      })
      await appendAssistantMessage(tx, {
        workspaceId: f.workspace.id,
        conversationId: chat.id,
        role: "assistant",
        content: "Built it",
        model: "gpt-5",
        proposal: { title: "Router", graph: { version: 1 } },
        actions: [
          {
            kind: "fetch",
            url: "https://example.com",
            status: 200,
            error: null,
          },
        ],
      })
      const [message] = await listAssistantMessages(tx, f.workspace.id, chat.id)
      expect(message.proposal).toEqual({
        title: "Router",
        graph: { version: 1 },
      })
      expect(message.actions[0].url).toBe("https://example.com")
      expect(message.model).toBe("gpt-5")
    })
  })

  it("moves a conversation to the top when it gets a new message", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const make = (title: string) =>
        createAssistantConversation(tx, {
          workspaceId: f.workspace.id,
          userId: f.alice.id,
          workflowId: null,
          title,
        })
      const older = await make("Older")
      await make("Newer")
      await appendAssistantMessage(tx, {
        workspaceId: f.workspace.id,
        conversationId: older.id,
        role: "user",
        content: "bump",
      })
      const list = await listAssistantConversations(
        tx,
        f.workspace.id,
        f.alice.id,
        null,
        { after: null, limit: 10 }
      )
      expect(list.map((chat) => chat.title)).toEqual(["Older", "Newer"])
    })
  })

  it("never shows one member another's chat", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const chat = await createAssistantConversation(tx, {
        workspaceId: f.workspace.id,
        userId: f.alice.id,
        workflowId: null,
        title: "Private",
      })
      expect(
        await getAssistantConversation(tx, f.workspace.id, f.bob.id, chat.id)
      ).toBeUndefined()
      expect(
        await listAssistantConversations(tx, f.workspace.id, f.bob.id, null, {
          after: null,
          limit: 10,
        })
      ).toEqual([])
      expect(
        await deleteAssistantConversation(tx, f.workspace.id, f.bob.id, chat.id)
      ).toBe(false)
      expect(
        await getAssistantConversation(tx, f.workspace.id, f.alice.id, chat.id)
      ).toBeDefined()
    })
  })

  it("separates general chats from a workflow's chats", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const base = { workspaceId: f.workspace.id, userId: f.alice.id }
      await createAssistantConversation(tx, {
        ...base,
        workflowId: null,
        title: "General",
      })
      await createAssistantConversation(tx, {
        ...base,
        workflowId: f.workflow.id,
        title: "About the flow",
      })
      const titles = async (workflowId: string | null) =>
        (
          await listAssistantConversations(
            tx,
            f.workspace.id,
            f.alice.id,
            workflowId,
            { after: null, limit: 10 }
          )
        ).map((chat) => chat.title)
      expect(await titles(null)).toEqual(["General"])
      expect(await titles(f.workflow.id)).toEqual(["About the flow"])
    })
  })

  it("deletes a conversation together with its messages", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const chat = await createAssistantConversation(tx, {
        workspaceId: f.workspace.id,
        userId: f.alice.id,
        workflowId: null,
        title: "Temporary",
      })
      await appendAssistantMessage(tx, {
        workspaceId: f.workspace.id,
        conversationId: chat.id,
        role: "user",
        content: "bye",
      })
      expect(
        await deleteAssistantConversation(
          tx,
          f.workspace.id,
          f.alice.id,
          chat.id
        )
      ).toBe(true)
      expect(await listAssistantMessages(tx, f.workspace.id, chat.id)).toEqual(
        []
      )
    })
  })

  it("pages through unpinned chats without repeats or gaps, even when times tie", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const made = []
      for (const title of ["a", "b", "c", "d", "e"]) {
        made.push(
          await createAssistantConversation(tx, {
            workspaceId: f.workspace.id,
            userId: f.alice.id,
            workflowId: null,
            title,
          })
        )
      }
      const seen: string[] = []
      let after = null
      for (;;) {
        const page = await listAssistantConversations(
          tx,
          f.workspace.id,
          f.alice.id,
          null,
          { after, limit: 2 }
        )
        seen.push(...page.map((chat) => chat.id))
        const last = page.at(-1)
        if (page.length < 2 || !last) break
        after = { updatedAt: last.cursorAt, id: last.id }
      }
      expect(seen).toHaveLength(5)
      expect(new Set(seen)).toEqual(new Set(made.map((chat) => chat.id)))
    })
  })

  it("lists pinned chats apart from the paged ones, and unpins them back", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const base = {
        workspaceId: f.workspace.id,
        userId: f.alice.id,
        workflowId: null,
      }
      const keep = await createAssistantConversation(tx, {
        ...base,
        title: "Keep",
      })
      await createAssistantConversation(tx, { ...base, title: "Other" })
      await setAssistantConversationPinned(
        tx,
        f.workspace.id,
        f.alice.id,
        keep.id,
        true
      )
      const page = { after: null, limit: 10 }
      expect(
        (
          await listPinnedAssistantConversations(
            tx,
            f.workspace.id,
            f.alice.id,
            null
          )
        ).map((chat) => chat.title)
      ).toEqual(["Keep"])
      expect(
        (
          await listAssistantConversations(
            tx,
            f.workspace.id,
            f.alice.id,
            null,
            page
          )
        ).map((chat) => chat.title)
      ).toEqual(["Other"])
      await setAssistantConversationPinned(
        tx,
        f.workspace.id,
        f.alice.id,
        keep.id,
        false
      )
      expect(
        await listPinnedAssistantConversations(
          tx,
          f.workspace.id,
          f.alice.id,
          null
        )
      ).toEqual([])
    })
  })

  it("lets only the owner pin a chat", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const chat = await createAssistantConversation(tx, {
        workspaceId: f.workspace.id,
        userId: f.alice.id,
        workflowId: null,
        title: "Mine",
      })
      expect(
        await setAssistantConversationPinned(
          tx,
          f.workspace.id,
          f.bob.id,
          chat.id,
          true
        )
      ).toBeUndefined()
    })
  })
})
