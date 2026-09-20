import { randomUUID } from 'node:crypto'
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common'
import { db, decryptCredential, repositories } from '@linea/db'
import {
  CONNECTION_OAUTH_PROVIDERS,
  type ConnectionOAuthProvider,
} from './connection-oauth-provider'
import { parseConnectionProviderCredential } from './connection-provider-credential'

const POLL_INTERVAL_MS = 30_000
const CLAIM_LEASE_MS = 30_000
const HEARTBEAT_INTERVAL_MS = 10_000
const PROVIDER_TIMEOUT_MS = 20_000
const MAXIMUM_RETRY_DELAY_MS = 60_000
const AUTHORIZATION_RESULT_RETENTION_MS = 24 * 60 * 60 * 1_000

@Injectable()
export class ConnectionRevocationService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ConnectionRevocationService.name)
  private readonly workerId = randomUUID()
  private interval?: NodeJS.Timeout
  private activeAbortController?: AbortController
  private polling = false

  constructor(
    @Inject(CONNECTION_OAUTH_PROVIDERS)
    private readonly providers: readonly ConnectionOAuthProvider[],
  ) {}

  onModuleInit(): void {
    void this.poll()
    this.interval = setInterval(() => void this.poll(), POLL_INTERVAL_MS)
  }

  onModuleDestroy(): void {
    clearInterval(this.interval)
    this.activeAbortController?.abort()
  }

  async poll(now = new Date()): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      let claimed = await this.claim(now)
      while (claimed) {
        await this.dispatch(claimed)
        claimed = await this.claim(now)
      }
      await repositories.connection.deleteExpiredRevocationDeliveries(db, now)
      await repositories.connection.deleteExpiredConnectionAuthorizationRequests(
        db,
        new Date(now.getTime() - AUTHORIZATION_RESULT_RETENTION_MS),
      )
    } catch (error) {
      this.logger.error(
        `Connection revocation poll failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      this.polling = false
    }
  }

  private claim(now: Date) {
    return repositories.connection.claimRevocationDelivery(db, {
      claimedBy: this.workerId,
      now,
      claimExpiresAt: new Date(now.getTime() + CLAIM_LEASE_MS),
    })
  }

  private async dispatch(
    claimed: NonNullable<
      Awaited<ReturnType<ConnectionRevocationService['claim']>>
    >,
  ): Promise<void> {
    const { delivery, connection } = claimed
    const provider = this.providers.find(
      (candidate) => candidate.provider === delivery.provider,
    )
    try {
      if (!provider) throw new Error('Connection provider unavailable')
      if (!delivery.credentialEncrypted) {
        throw new Error('Revocation credential is unavailable')
      }
      const credential = parseConnectionProviderCredential(
        decryptCredential(delivery.credentialEncrypted, {
          workspaceId: connection.workspaceId,
          applicationId: connection.applicationId,
          externalSubjectId: connection.externalSubjectId,
          recordId: delivery.id,
          provider: `${delivery.provider}:revocation`,
        }),
      )
      const controller = new AbortController()
      this.activeAbortController = controller
      const heartbeat = setInterval(() => {
        void repositories.connection
          .renewRevocationDeliveryClaim(db, {
            deliveryId: delivery.id,
            claimedBy: this.workerId,
            claimExpiresAt: new Date(Date.now() + CLAIM_LEASE_MS),
          })
          .then((renewed) => {
            if (!renewed) controller.abort()
          })
          .catch((error: unknown) => {
            this.logger.error(
              `Connection revocation lease renewal failed: ${error instanceof Error ? error.message : String(error)}`,
            )
            controller.abort()
          })
      }, HEARTBEAT_INTERVAL_MS)
      try {
        await provider.revokeCredential(
          credential,
          AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
          ]),
        )
      } finally {
        clearInterval(heartbeat)
        this.activeAbortController = undefined
      }
      const completed =
        await repositories.connection.completeRevocationDelivery(db, {
          deliveryId: delivery.id,
          claimedBy: this.workerId,
          deliveredAt: new Date(),
        })
      if (!completed) throw new Error('Connection revocation claim was lost')
    } catch (error) {
      const delay = Math.min(
        2 ** Math.min(delivery.attemptCount - 1, 16) * 1_000,
        MAXIMUM_RETRY_DELAY_MS,
      )
      await repositories.connection.recordRevocationDeliveryFailure(db, {
        deliveryId: delivery.id,
        claimedBy: this.workerId,
        retryAt: new Date(Date.now() + delay),
      })
      this.logger.warn(
        `Connection revocation delivery ${delivery.id} failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
