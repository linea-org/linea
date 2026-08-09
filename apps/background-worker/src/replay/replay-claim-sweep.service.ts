import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common"
import { db, repositories } from "@linea/db"

const SWEEP_INTERVAL_MS = 30_000

/** Finalizes replay claims stale past REPLAY_CLAIM_STALE_MS using the same claimToken fencing as completeReplayStep, so a live worker's real result — even a late one — always overwrites a false-positive "abandoned" finalization here. */
@Injectable()
export class ReplayClaimSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReplayClaimSweepService.name)
  private interval?: NodeJS.Timeout

  onModuleInit(): void {
    this.interval = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS)
  }

  onModuleDestroy(): void {
    clearInterval(this.interval)
  }

  async sweep(): Promise<void> {
    try {
      const stale = await repositories.executionStep.findStaleReplayClaims(
        db,
        new Date(Date.now() - repositories.executionStep.REPLAY_CLAIM_STALE_MS)
      )
      for (const claim of stale) {
        await repositories.executionStep.completeReplayStep(
          db,
          claim.id,
          claim.startedAt,
          {
            status: "failed",
            error: {
              message:
                "Replay abandoned: no worker finished it before the claim went stale.",
            },
            costMicros: 0n,
            tokensInput: 0,
            tokensOutput: 0,
            endedAt: new Date(),
          }
        )
        this.logger.warn(`Finalized abandoned replay claim ${claim.id}`)
      }
    } catch (error) {
      this.logger.error(
        `Replay claim sweep failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
