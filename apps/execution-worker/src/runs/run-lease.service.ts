import { Injectable, Logger } from "@nestjs/common"
import { db, repositories } from "@linea/db"

const LEASE_DURATION_MS = 30_000
const HEARTBEAT_INTERVAL_MS = 10_000

@Injectable()
export class RunLeaseService {
  private readonly logger = new Logger(RunLeaseService.name)
  // Keyed by leasedBy, not executionId — two attempts for the same execution stay independent.
  private readonly timers = new Map<string, NodeJS.Timeout>()

  computeLeaseExpiry(): Date {
    return new Date(Date.now() + LEASE_DURATION_MS)
  }

  /**
   * Renews well inside the lease window (10s heartbeat, 30s lease), so a slow tick or two
   * doesn't expire it. `onLeaseLost`, if given, fires the moment a renewal finds the lease
   * already reclaimed — the caller uses this to abort whatever node handler call is currently
   * in flight, rather than letting it run to completion only to lose the checkpoint race.
   */
  startHeartbeat(
    executionId: string,
    leasedBy: string,
    onLeaseLost?: () => void
  ): void {
    const timer = setInterval(() => {
      repositories.execution
        .renewLease(db, executionId, leasedBy, this.computeLeaseExpiry())
        .then((renewed) => {
          // Undefined means someone else reclaimed the lease — stop polling with a stale identity.
          if (!renewed) {
            this.logger.warn(
              `Lost lease for execution ${executionId} to another worker — stopping heartbeat`
            )
            this.stopHeartbeat(leasedBy)
            onLeaseLost?.()
          }
        })
        .catch((error: unknown) => {
          this.logger.error(
            `Failed to renew lease for execution ${executionId}`,
            error
          )
        })
    }, HEARTBEAT_INTERVAL_MS)
    this.timers.set(leasedBy, timer)
  }

  stopHeartbeat(leasedBy: string): void {
    const timer = this.timers.get(leasedBy)
    if (timer) {
      clearInterval(timer)
      this.timers.delete(leasedBy)
    }
  }
}
