import { and, eq, gte, sql } from "drizzle-orm"
import { assistantUsage } from "../schema/index.js"
import type { DbClient } from "./types.js"

export async function recordAssistantUsage(
  db: DbClient,
  workspaceId: string,
  tokens: number
): Promise<void> {
  await db.insert(assistantUsage).values({ workspaceId, tokens })
}

export async function sumAssistantTokensSince(
  db: DbClient,
  workspaceId: string,
  since: Date
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${assistantUsage.tokens}), 0)::float8`,
    })
    .from(assistantUsage)
    .where(
      and(
        eq(assistantUsage.workspaceId, workspaceId),
        gte(assistantUsage.createdAt, since)
      )
    )
  return row.total
}
