import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common"
import { db, repositories } from "@linea/db"

const POLL_INTERVAL_MS = 5_000

@Injectable()
export class WaitFiringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WaitFiringService.name)
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
      let result = await repositories.waitTimer.claimAndResolveDueWaitTimer(db)
      while (result.outcome !== "empty") {
        result = await repositories.waitTimer.claimAndResolveDueWaitTimer(db)
      }
    } catch (error) {
      this.logger.error(
        `Wait timer poll failed: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      this.polling = false
    }
  }
}
