import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common"
import { db, repositories } from "@linea/db"

const SWEEP_INTERVAL_MS = 5 * 60 * 1000

@Injectable()
export class TranscriptFlaggersService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TranscriptFlaggersService.name)
  private interval?: NodeJS.Timeout
  private sweeping = false

  onModuleInit(): void {
    this.interval = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS)
  }

  onModuleDestroy(): void {
    clearInterval(this.interval)
  }

  async sweep(): Promise<void> {
    if (this.sweeping) return
    this.sweeping = true
    try {
      await this.flagToolErrors()
      await this.flagEmptyResponses()
      await this.flagRefusals()
      await this.flagRepeatedReplays()
    } catch (error) {
      this.logger.error(
        `Transcript flagger sweep failed: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      this.sweeping = false
    }
  }

  private async flagToolErrors(): Promise<void> {
    const results = await repositories.flag.detectToolErrors(db)
    for (const r of results) {
      await repositories.flag.createFlagIfNew(db, {
        workspaceId: r.workspaceId,
        executionId: r.executionId,
        nodeId: r.nodeId,
        flagType: "tool_error",
        detail: { stepId: r.stepId },
        dedupeKey: `tool_error:${r.stepId}`,
      })
    }
  }

  private async flagEmptyResponses(): Promise<void> {
    const results = await repositories.flag.detectEmptyResponses(db)
    for (const r of results) {
      await repositories.flag.createFlagIfNew(db, {
        workspaceId: r.workspaceId,
        executionId: r.executionId,
        nodeId: r.nodeId,
        flagType: "empty_response",
        detail: { stepId: r.stepId },
        dedupeKey: `empty_response:${r.stepId}`,
      })
    }
  }

  private async flagRefusals(): Promise<void> {
    const results = await repositories.flag.detectRefusals(db)
    for (const r of results) {
      await repositories.flag.createFlagIfNew(db, {
        workspaceId: r.workspaceId,
        executionId: r.executionId,
        nodeId: r.nodeId,
        flagType: "refusal",
        detail: { stepId: r.stepId },
        dedupeKey: `refusal:${r.stepId}`,
      })
    }
  }

  private async flagRepeatedReplays(): Promise<void> {
    const results = await repositories.flag.detectRepeatedReplay(db)
    for (const r of results) {
      await repositories.flag.createFlagIfNew(db, {
        workspaceId: r.workspaceId,
        executionId: r.executionId,
        flagType: "repeated_replay",
        detail: {
          originalStepId: r.originalStepId,
          replayCount: r.replayCount,
        },
        dedupeKey: `repeated_replay:${r.originalStepId}:${r.replayCount}`,
      })
    }
  }
}
