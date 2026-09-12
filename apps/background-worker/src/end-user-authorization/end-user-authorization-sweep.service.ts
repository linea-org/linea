import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common"
import { db, repositories } from "@linea/db"

const SWEEP_INTERVAL_MS = 5 * 60 * 1000

@Injectable()
export class EndUserAuthorizationSweepService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(EndUserAuthorizationSweepService.name)
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
      const deleted =
        await repositories.endUserAuthorization.deleteExpiredEndUserAuthorizationArtifacts(
          db,
          new Date()
        )
      if (deleted > 0) {
        this.logger.log(`Deleted ${deleted} expired authorization artifacts`)
      }
    } catch (error) {
      this.logger.error(
        `Authorization artifact sweep failed: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      this.sweeping = false
    }
  }
}
