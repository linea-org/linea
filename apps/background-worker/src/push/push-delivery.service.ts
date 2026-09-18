import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common"
import { db, repositories, type PushDelivery } from "@linea/db"
import {
  ExpoTransportError,
  getExpoPushReceipt,
  sendExpoPush,
  type ExpoPushTicketResult,
} from "./expo-push-client"
import { buildPushPayload } from "./push-payload"

type ClaimedPushDelivery = NonNullable<
  Awaited<ReturnType<typeof repositories.pushNotification.claimPushDelivery>>
>

const POLL_INTERVAL_MS = 5_000
const RECEIPT_DELAY_MS = 15 * 60_000
const RETRY_BASE_DELAY_MS = 5_000

function retryAt(attempts: number): Date {
  return new Date(Date.now() + RETRY_BASE_DELAY_MS * 2 ** (attempts - 1))
}

function isTransientExpoCode(code: string | undefined): boolean {
  return code === "MessageRateExceeded"
}

function invalidatesDevice(code: string | undefined): boolean {
  return code === "DeviceNotRegistered"
}

@Injectable()
export class PushDeliveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushDeliveryService.name)
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
      let delivery = await repositories.pushNotification.claimPushDelivery(db)
      while (delivery) {
        await this.send(delivery)
        delivery = await repositories.pushNotification.claimPushDelivery(db)
      }
      let receipt = await repositories.pushNotification.claimPushReceipt(db)
      while (receipt) {
        await this.checkReceipt(receipt)
        receipt = await repositories.pushNotification.claimPushReceipt(db)
      }
    } catch (error) {
      this.logger.error(
        `Push delivery poll failed: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      this.polling = false
    }
  }

  private async send(claimed: ClaimedPushDelivery): Promise<void> {
    const payload = buildPushPayload(claimed.notification)
    if (!payload) {
      await repositories.pushNotification.permanentlyFailPushDelivery(
        db,
        claimed.delivery,
        "Notification is missing safe deep-link identifiers",
        false
      )
      return
    }
    try {
      const result = await sendExpoPush({ to: claimed.token, ...payload })
      await this.handleTicket(claimed.delivery, result)
    } catch (error) {
      if (error instanceof ExpoTransportError && !error.transient) {
        await repositories.pushNotification.permanentlyFailPushDelivery(
          db,
          claimed.delivery,
          error.message,
          false
        )
        return
      }
      await repositories.pushNotification.retryPushDelivery(
        db,
        claimed.delivery,
        error instanceof Error ? error.message : String(error),
        retryAt(claimed.delivery.attempts)
      )
    }
  }

  private async handleTicket(
    delivery: PushDelivery,
    result: ExpoPushTicketResult
  ): Promise<void> {
    if (result.status === "ok") {
      await repositories.pushNotification.recordPushTicket(
        db,
        delivery.id,
        result.id,
        new Date(Date.now() + RECEIPT_DELAY_MS)
      )
      return
    }
    const error = result.code
      ? `${result.code}: ${result.message}`
      : result.message
    if (isTransientExpoCode(result.code)) {
      await repositories.pushNotification.retryPushDelivery(
        db,
        delivery,
        error,
        retryAt(delivery.attempts)
      )
      return
    }
    await repositories.pushNotification.permanentlyFailPushDelivery(
      db,
      delivery,
      error,
      invalidatesDevice(result.code)
    )
  }

  private async checkReceipt(delivery: PushDelivery): Promise<void> {
    if (!delivery.ticketId) {
      await repositories.pushNotification.permanentlyFailPushDelivery(
        db,
        delivery,
        "Receipt delivery has no Expo ticket ID",
        false
      )
      return
    }
    try {
      const result = await getExpoPushReceipt(delivery.ticketId)
      if (!result) {
        await repositories.pushNotification.retryPushReceipt(
          db,
          delivery,
          "Expo receipt is not available yet",
          retryAt(delivery.receiptAttempts)
        )
        return
      }
      if (result.status === "ok") {
        await repositories.pushNotification.completePushDelivery(
          db,
          delivery.id
        )
        return
      }
      const error = result.code
        ? `${result.code}: ${result.message}`
        : result.message
      if (isTransientExpoCode(result.code)) {
        await repositories.pushNotification.retryPushReceipt(
          db,
          delivery,
          error,
          retryAt(delivery.receiptAttempts)
        )
        return
      }
      await repositories.pushNotification.permanentlyFailPushDelivery(
        db,
        delivery,
        error,
        invalidatesDevice(result.code)
      )
    } catch (error) {
      if (error instanceof ExpoTransportError && !error.transient) {
        await repositories.pushNotification.permanentlyFailPushDelivery(
          db,
          delivery,
          error.message,
          false
        )
        return
      }
      await repositories.pushNotification.retryPushReceipt(
        db,
        delivery,
        error instanceof Error ? error.message : String(error),
        retryAt(delivery.receiptAttempts)
      )
    }
  }
}
