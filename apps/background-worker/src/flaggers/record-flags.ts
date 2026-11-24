import type { Logger } from "@nestjs/common"
import { db, repositories, type schema } from "@linealabs/db"

/** Logs a failed flag and continues, so a row deleted since detection cannot stop the sweep. */
export async function recordFlags(
  logger: Logger,
  flags: schema.NewFlag[]
): Promise<void> {
  // Sequential: flags of one signal lock the same row, so parallel writes only hold connections.
  for (const flag of flags) {
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
}
