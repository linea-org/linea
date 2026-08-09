import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common"
import { db, repositories } from "@linea/db"

const SWEEP_INTERVAL_MS = 30_000

/**
 * Finalizes replay claims left "running" past REPLAY_CLAIM_STALE_MS with no worker left to
 * finish them — e.g. a worker that died right after reclaiming on workflow-step-replay's last
 * configured retry attempt, exhausting its attempts/backoff budget. Marks them failed through
 * the same claimToken fencing claimReplayStep/completeReplayStep already use, so a claim
 * that's actually still live, or that gets renewed or reclaimed between this sweep's read and
 * write, is left untouched. This never re-executes the node — only finalizes an abandoned
 * claim — so unlike a retry it adds no risk of duplicating a real side effect; the tradeoff is
 * the user sees the replay as failed and has to trigger a fresh one, not that anything runs
 * twice.
 */
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
