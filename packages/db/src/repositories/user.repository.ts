import { eq } from "drizzle-orm"
import { userSettings, users, type User } from "../schema/index.js"
import type { DbClient } from "./types.js"

export async function getUserById(
  db: DbClient,
  userId: string
): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  return user
}

/** Where to send a person an email, and whether they have asked not to get them; no settings row means the default, yes. */
export async function getEmailContact(
  db: DbClient,
  userId: string
): Promise<
  { email: string; name: string; emailNotifications: boolean } | undefined
> {
  const [row] = await db
    .select({
      email: users.email,
      name: users.name,
      emailNotifications: userSettings.emailNotifications,
    })
    .from(users)
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .where(eq(users.id, userId))
  return row && { ...row, emailNotifications: row.emailNotifications ?? true }
}
