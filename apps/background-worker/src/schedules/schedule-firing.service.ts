import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common"
import { db, repositories } from "@linea/db"

const POLL_INTERVAL_MS = 5_000

@Injectable()
export class ScheduleFiringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduleFiringService.name)
  private interval?: NodeJS.Timeout
  private polling = false

  onModuleInit(): void {
    this.interval = setInterval(() => void this.poll(), POLL_INTERVAL_MS)
  }

  onModuleDestroy(): void {
    clearInterval(this.interval)
  }

  async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      let result = await repositories.schedule.claimAndFireDueSchedule(db)
      while (result.outcome !== "empty") {
        if (result.outcome === "skipped") {
          this.logger.warn(
            `Schedule ${result.schedule.id} skipped: ${result.reason}`
          )
        }
        result = await repositories.schedule.claimAndFireDueSchedule(db)
      }
    } catch (error) {
      this.logger.error(
        `Schedule poll failed: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      this.polling = false
    }
  }
}
