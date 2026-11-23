import type { Logger } from "@nestjs/common"
import { db, repositories, type schema } from "@linealabs/db"

/** Logs instead of throwing, so a row deleted since it was detected cannot stop the sweep. */
export async function recordFlag(
  logger: Logger,
  flag: schema.NewFlag
): Promise<void> {
  try {
    await repositories.flag.createFlagIfNew(db, flag)
  } catch (error) {
    // Drizzle's own message is only the failed query; the Postgres reason is on the cause.
    const reason = error instanceof Error ? (error.cause ?? error) : error
    logger.error(
      `Could not record flag ${flag.dedupeKey}: ${reason instanceof Error ? reason.message : String(reason)}`
    )
  }
}
