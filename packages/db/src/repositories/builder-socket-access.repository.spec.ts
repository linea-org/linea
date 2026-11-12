import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { members, organizations, sessions, users } from "../schema/index.js"
import { getBuilderSocketSessionExpiry } from "./builder-socket-access.repository.js"
import { withRollback } from "./test-utils.js"

describe("builder socket access", () => {
  it.each([
    "member removal",
    "revoked session",
    "expired session",
    "wrong user",
    "wrong workspace",
  ])(
    "requires live session ownership and membership after %s",
    async (reason) => {
      await withRollback(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({ name: "Builder", email: `${randomUUID()}@test.dev` })
          .returning()
        const [workspace] = await tx
          .insert(organizations)
          .values({
            name: "Builder workspace",
            slug: randomUUID(),
            createdAt: new Date(),
          })
          .returning()
        await tx.insert(members).values({
          organizationId: workspace.id,
          userId: user.id,
          role: "member",
          createdAt: new Date(),
        })
        const expiresAt = new Date(Date.now() + 60_000)
        const [session] = await tx
          .insert(sessions)
          .values({ userId: user.id, token: randomUUID(), expiresAt })
          .returning()
        const input = {
          sessionId: session.id,
          userId: user.id,
          workspaceId: workspace.id,
        }
        expect(await getBuilderSocketSessionExpiry(tx, input)).toEqual(
          expiresAt
        )
        if (reason === "member removal")
          await tx.delete(members).where(eq(members.userId, user.id))
        if (reason === "revoked session")
          await tx.delete(sessions).where(eq(sessions.id, session.id))
        if (reason === "expired session")
          await tx
            .update(sessions)
            .set({ expiresAt: new Date(0) })
            .where(eq(sessions.id, session.id))
        if (reason === "wrong user") input.userId = randomUUID()
        if (reason === "wrong workspace") input.workspaceId = randomUUID()
        expect(await getBuilderSocketSessionExpiry(tx, input)).toBeUndefined()
      })
    }
  )
})
