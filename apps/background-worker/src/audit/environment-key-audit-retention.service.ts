import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common"
import { db, repositories } from "@linea/db"

const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const ENVIRONMENT_KEY_ACTIVITY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000

@Injectable()
export class EnvironmentKeyAuditRetentionService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(EnvironmentKeyAuditRetentionService.name)
  private interval?: NodeJS.Timeout
  private sweeping = false

  onModuleInit(): void {
    void this.sweep()
    this.interval = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS)
  }

  onModuleDestroy(): void {
    clearInterval(this.interval)
  }

  async sweep(): Promise<void> {
    if (this.sweeping) return
    this.sweeping = true
    try {
      const before = new Date(
        Date.now() - ENVIRONMENT_KEY_ACTIVITY_RETENTION_MS
      )
      let deleted = 0
      let batch: number
      do {
        batch =
          await repositories.environmentKey.deleteEnvironmentKeyActivityBefore(
            db,
            before
          )
        deleted += batch
      } while (batch > 0)
      if (deleted > 0) {
        this.logger.log(`Deleted ${deleted} expired Environment key audit rows`)
      }
    } catch (error) {
      this.logger.error(
        `Environment key audit retention failed: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      this.sweeping = false
    }
  }
}
