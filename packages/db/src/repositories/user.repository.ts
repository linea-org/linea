import { eq } from "drizzle-orm"
import { users, type User } from "../schema/index.js"
import type { DbClient } from "./types.js"

export async function getUserById(
  db: DbClient,
  userId: string
): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  return user
}
