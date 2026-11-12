import { and, eq, gt } from "drizzle-orm"
import { members, sessions } from "../schema/index.js"
import type { DbClient } from "./types.js"

export async function getBuilderSocketSessionExpiry(
  db: DbClient,
  input: { sessionId: string; userId: string; workspaceId: string }
): Promise<Date | undefined> {
  const [session] = await db
    .select({ expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(
      members,
      and(
        eq(members.userId, sessions.userId),
        eq(members.organizationId, input.workspaceId)
      )
    )
    .where(
      and(
        eq(sessions.id, input.sessionId),
        eq(sessions.userId, input.userId),
        gt(sessions.expiresAt, new Date())
      )
    )
    .limit(1)
  return session?.expiresAt
}
