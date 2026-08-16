import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common"
import { db, repositories } from "@linea/db"

const SWEEP_INTERVAL_MS = 5 * 60 * 1000
const ORPHAN_AFTER_MS = 5 * 60 * 1000

/** Catches what a failed compensating delete missed (see ExecutionsService.sendChatMessage): a chat turn whose triggering execution definitively failed, still unanswered. */
@Injectable()
export class ChatMessageSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatMessageSweepService.name)
  private interval?: NodeJS.Timeout

  onModuleInit(): void {
    this.interval = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS)
  }

  onModuleDestroy(): void {
    clearInterval(this.interval)
  }

  async sweep(): Promise<void> {
    try {
      const deleted = await repositories.chatMessage.deleteOrphanedChatMessages(
        db,
        new Date(Date.now() - ORPHAN_AFTER_MS)
      )
      if (deleted > 0) {
        this.logger.warn(`Deleted ${deleted} orphaned chat message(s)`)
      }
    } catch (error) {
      this.logger.error(
        `Chat message sweep failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
