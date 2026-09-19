import {
  decryptCredential,
  repositories,
  type ActionIntent,
  type Database,
} from "@linea/db"
import { z } from "zod"
import {
  ACTION_INTENT_DIGEST_VERSION,
  digestActionIntent,
} from "./action-intent-canonicalization.js"
import {
  registeredReadOperation,
  type ConnectorOperationRegistry,
  type ConnectorReadCredential,
} from "./connector-read-operation.js"
import {
  registeredSideEffectOperation,
  type ActionIntentEnvelope,
  type ConnectorSideEffectOperation,
  type NormalizedSideEffect,
} from "./connector-side-effect-operation.js"
import { validateSafeDisplay } from "./safe-display.js"

const storedCredentialSchema = z
  .object({
    accountId: z.string().min(1),
    accessToken: z.string().min(1),
    expiresAt: z.string().datetime().nullable(),
  })
  .passthrough()

export class ConnectorGatewayError extends Error {
  constructor(
    message = "Connector operation rejected",
    readonly code = "connector_rejected"
  ) {
    super(message)
    this.name = "ConnectorGatewayError"
  }
}

export class ConnectorGateway {
  constructor(
    private readonly db: Database,
    private readonly operations: ConnectorOperationRegistry
  ) {}

  async execute(input: {
    executionId: string
    workspaceId: string
    nodeId: string
    connectionId: string
    operationId: string
    operationInput: unknown
    invocationIdempotencyKey: string
    executionClaimId: string
    signal?: AbortSignal
  }): Promise<
    | { outcome: "completed"; result: unknown }
    | { outcome: "awaiting_consent"; actionIntentId: string }
    | {
        outcome: "rejected"
        actionIntentId: string
        reason: "human" | "timeout"
      }
  > {
    const read = registeredReadOperation(this.operations, input.operationId)
    if (read) {
      return {
        outcome: "completed",
        result: await this.executeRead(input),
      }
    }
    const sideEffect = registeredSideEffectOperation(
      this.operations,
      input.operationId
    )
    if (!sideEffect) throw new ConnectorGatewayError()
    return this.executeSideEffect(sideEffect, input)
  }

  async executeRead(input: {
    executionId: string
    workspaceId: string
    connectionId: string
    operationId: string
    operationInput: unknown
    signal?: AbortSignal
  }): Promise<unknown> {
    const operation = registeredReadOperation(
      this.operations,
      input.operationId
    )
    if (!operation) throw new ConnectorGatewayError()
    const authority = await repositories.connection.getConnectorReadAuthority(
      this.db,
      {
        executionId: input.executionId,
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
      }
    )
    if (authority?.connection.status !== "active") {
      throw new ConnectorGatewayError()
    }
    if (
      authority.connection.provider !== operation.provider ||
      !authority.providerPolicy.actionFamilies.includes(
        operation.actionFamily
      ) ||
      operation.requiredScopes.some(
        (scope) => !authority.connection.scopes.includes(scope)
      ) ||
      operation.requiredScopes.some(
        (scope) => !authority.providerPolicy.maxScopes.includes(scope)
      )
    ) {
      throw new ConnectorGatewayError()
    }
    const credential = this.resolveCredential(authority.connection)
    if (credential.accountId !== authority.connection.providerAccountId) {
      throw new ConnectorGatewayError()
    }
    let validatedInput: unknown
    try {
      validatedInput = operation.inputSchema.parse(input.operationInput)
    } catch {
      throw new ConnectorGatewayError("Connector input is invalid")
    }
    try {
      const result = await operation.execute(
        validatedInput,
        credential,
        input.signal
      )
      return operation.outputSchema.parse(result)
    } catch {
      throw new ConnectorGatewayError(operation.providerErrorMessage)
    }
  }

  private async executeSideEffect(
    operation: ConnectorSideEffectOperation,
    input: {
      executionId: string
      workspaceId: string
      nodeId: string
      connectionId: string
      operationInput: unknown
      invocationIdempotencyKey: string
      executionClaimId: string
      signal?: AbortSignal
    }
  ): Promise<
    | { outcome: "completed"; result: unknown }
    | { outcome: "awaiting_consent"; actionIntentId: string }
    | {
        outcome: "rejected"
        actionIntentId: string
        reason: "human" | "timeout"
      }
  > {
    const authority = await this.requireAuthority(operation, input)
    this.resolveCredential(authority.connection)
    const { normalized, envelope, canonicalDigest, safeDisplay } =
      this.prepareSideEffect(operation, input)
    const created = await repositories.actionIntent.createActionIntent(
      this.db,
      {
        workspaceId: input.workspaceId,
        executionId: input.executionId,
        nodeId: input.nodeId,
        connectionId: input.connectionId,
        connector: operation.provider,
        actionFamily: operation.actionFamily,
        requiredScopes: operation.requiredScopes,
        operationId: operation.id,
        operationRevision: operation.revision,
        target: normalized.target,
        normalizedParameters: normalized.parameters,
        providerPreconditions: normalized.providerPreconditions,
        safeDisplay,
        digestVersion: ACTION_INTENT_DIGEST_VERSION,
        canonicalDigest,
        canonicalEnvelope: envelope,
        invocationIdempotencyKey: input.invocationIdempotencyKey,
        expiresAt: new Date(Date.now() + 15 * 60_000),
      }
    )
    if (created.outcome === "idempotency_conflict") {
      throw new ConnectorGatewayError(
        "Connector invocation idempotency conflict",
        "idempotency_conflict"
      )
    }
    if (created.outcome === "authority_invalid") {
      throw new ConnectorGatewayError()
    }
    const consent = await repositories.actionIntent.getActionIntentConsent(
      this.db,
      {
        workspaceId: input.workspaceId,
        executionId: input.executionId,
        nodeId: input.nodeId,
        invocationIdempotencyKey: input.invocationIdempotencyKey,
      }
    )
    if (!consent) throw new Error("Created Action Intent was not found")
    switch (consent.approvalRequest.status) {
      case "pending":
        return {
          outcome: "awaiting_consent",
          actionIntentId: consent.intent.id,
        }
      case "cancelled":
        throw new ConnectorGatewayError(
          "Action Intent was cancelled",
          "cancelled"
        )
    }
    if (!consent.decision) {
      throw new Error("Action Intent Approval Request has no Decision")
    }
    if (consent.decision.outcome === "rejected") {
      await repositories.actionIntent.rejectActionIntent(
        this.db,
        consent.intent.id
      )
      return {
        outcome: "rejected",
        actionIntentId: consent.intent.id,
        reason: consent.decision.reason,
      }
    }
    if (
      consent.intent.operationRevision !== operation.revision ||
      consent.intent.digestVersion !== ACTION_INTENT_DIGEST_VERSION ||
      digestActionIntent(consent.intent.canonicalEnvelope) !==
        consent.intent.canonicalDigest ||
      consent.approvalRequest.actionIntentDigest !==
        consent.intent.canonicalDigest
    ) {
      throw new ConnectorGatewayError(
        "Action Intent digest verification failed",
        "digest_mismatch"
      )
    }
    const claimed = await repositories.actionIntent.claimApprovedActionIntent(
      this.db,
      {
        actionIntentId: consent.intent.id,
        executionClaimId: input.executionClaimId,
        provider: operation.provider,
        actionFamily: operation.actionFamily,
        requiredScopes: operation.requiredScopes,
        now: new Date(),
      }
    )
    if (!claimed) throw new Error("Action Intent was not claimable")
    if (claimed.outcome === "cancelled") {
      throw new ConnectorGatewayError(
        "Action Intent was cancelled",
        "cancelled"
      )
    }
    if (claimed.outcome === "in_progress") {
      throw new ConnectorGatewayError(
        "Action Intent execution is already in progress",
        "execution_in_progress"
      )
    }
    if (claimed.outcome === "not_ready") {
      throw new ConnectorGatewayError("Action Intent is not executable")
    }
    if (claimed.outcome === "terminal") {
      switch (claimed.intent.status) {
        case "succeeded":
          return {
            outcome: "completed",
            result: claimed.intent.normalizedResult,
          }
        case "rejected":
          return {
            outcome: "rejected",
            actionIntentId: claimed.intent.id,
            reason: consent.decision.reason,
          }
        case "failed":
        case "stale":
        case "outcome_unknown":
          if (!claimed.intent.normalizedError) {
            throw new Error("Terminal Action Intent is missing its error")
          }
          throw new ConnectorGatewayError(
            claimed.intent.normalizedError.message,
            claimed.intent.normalizedError.code
          )
        default:
          throw new ConnectorGatewayError("Action Intent is not executable")
      }
    }
    if (claimed.outcome !== "claimed" && claimed.outcome !== "recovered") {
      throw new ConnectorGatewayError("Action Intent is not executable")
    }
    if (
      claimed.outcome === "recovered" &&
      claimed.intent.dispatchStartedAt &&
      operation.retrySafety === "none"
    ) {
      await this.failSideEffect(
        claimed.intent,
        input.executionClaimId,
        {
          code: "outcome_unknown",
          message: "Connector provider outcome could not be reconciled",
          outcomeUnknown: true,
        },
        "outcome_unknown"
      )
    }
    let credential: ConnectorReadCredential
    try {
      credential = this.resolveCredential(claimed.connection)
    } catch {
      const dispatchMayHaveReachedProvider = Boolean(
        claimed.intent.dispatchStartedAt
      )
      const normalizedError = dispatchMayHaveReachedProvider
        ? {
            code: "outcome_unknown",
            message: "Connector provider outcome could not be reconciled",
            outcomeUnknown: true,
          }
        : {
            code: "provider_failed",
            message: "Connector credential became unavailable",
            outcomeUnknown: false,
          }
      return this.failSideEffect(
        claimed.intent,
        input.executionClaimId,
        normalizedError,
        dispatchMayHaveReachedProvider ? "outcome_unknown" : "failed"
      )
    }
    switch (claimed.intent.status) {
      case "rejected":
        return {
          outcome: "rejected",
          actionIntentId: claimed.intent.id,
          reason: consent.decision.reason,
        }
      case "executing":
        return {
          outcome: "completed",
          result: await this.invokeSideEffect(
            operation,
            claimed.intent,
            credential,
            input.executionClaimId,
            input.signal
          ),
        }
      default:
        throw new ConnectorGatewayError("Action Intent is not executable")
    }
  }

  private prepareSideEffect(
    operation: ConnectorSideEffectOperation,
    input: { connectionId: string; operationInput: unknown }
  ) {
    let normalized: NormalizedSideEffect
    try {
      const validatedInput = operation.inputSchema.parse(input.operationInput)
      normalized = operation.normalize(validatedInput)
      normalized.parameters = operation.parametersSchema.parse(
        normalized.parameters
      )
      normalized.providerPreconditions = operation.preconditionsSchema.parse(
        normalized.providerPreconditions
      )
    } catch {
      throw new ConnectorGatewayError(
        "Connector input is invalid",
        "validation_failed"
      )
    }
    const envelope: ActionIntentEnvelope = {
      version: 1,
      operationRevision: operation.revision,
      connectionId: input.connectionId,
      connector: operation.provider,
      operation: operation.id,
      target: normalized.target,
      parameters: normalized.parameters,
      providerPreconditions: normalized.providerPreconditions,
    }
    try {
      return {
        normalized,
        envelope,
        canonicalDigest: digestActionIntent(envelope),
        safeDisplay: validateSafeDisplay(operation.display(envelope)),
      }
    } catch {
      throw new ConnectorGatewayError(
        "Connector action is invalid",
        "validation_failed"
      )
    }
  }

  private async invokeSideEffect(
    operation: ConnectorSideEffectOperation,
    claimed: ActionIntent,
    credential: ConnectorReadCredential,
    executionClaimId: string,
    signal?: AbortSignal
  ): Promise<unknown> {
    const parameters = operation.parametersSchema.parse(
      claimed.canonicalEnvelope.parameters
    )
    const preconditions = operation.preconditionsSchema.parse(
      claimed.canonicalEnvelope.providerPreconditions
    )
    const maximumAttempts =
      operation.retrySafety === "provider_idempotency" ? 2 : 1
    if (!claimed.dispatchStartedAt) {
      let preconditionsValid = false
      try {
        preconditionsValid = await operation.revalidateProviderPreconditions(
          parameters,
          preconditions,
          credential,
          signal
        )
      } catch {
        await this.failSideEffect(
          claimed,
          executionClaimId,
          {
            code: "provider_failed",
            message: "Connector provider precondition check failed",
            outcomeUnknown: false,
          },
          "failed"
        )
      }
      if (!preconditionsValid) {
        await this.failSideEffect(
          claimed,
          executionClaimId,
          {
            code: "precondition_failed",
            message: "Connector target changed before execution",
            outcomeUnknown: false,
          },
          "stale"
        )
      }
    }
    let attempt = 0
    for (;;) {
      const dispatch =
        await repositories.actionIntent.beginActionIntentDispatch(this.db, {
          actionIntentId: claimed.id,
          executionClaimId,
          now: new Date(),
        })
      if (!dispatch) {
        throw new ConnectorGatewayError(
          "Action Intent execution claim was lost",
          "execution_in_progress"
        )
      }
      attempt += 1
      let result: unknown
      try {
        result = operation.resultSchema.parse(
          await operation.execute(
            parameters,
            preconditions,
            credential,
            claimed.invocationIdempotencyKey,
            signal
          )
        )
      } catch (error_) {
        const normalizedError = operation.providerErrorSchema.parse(
          operation.normalizeProviderError(error_)
        )
        if (
          normalizedError.outcomeUnknown &&
          operation.retrySafety === "provider_idempotency" &&
          attempt < maximumAttempts &&
          !signal?.aborted
        ) {
          continue
        }
        let failureStatus: "failed" | "stale" | "outcome_unknown" = "failed"
        if (normalizedError.outcomeUnknown) failureStatus = "outcome_unknown"
        else if (normalizedError.code === "precondition_failed") {
          failureStatus = "stale"
        }
        await this.failSideEffect(
          claimed,
          executionClaimId,
          normalizedError,
          failureStatus
        )
      }
      const completed = await repositories.actionIntent.completeActionIntent(
        this.db,
        {
          actionIntentId: claimed.id,
          executionClaimId,
          result,
          completedAt: new Date(),
        }
      )
      if (!completed) throw new Error("Action Intent completion was lost")
      return result
    }
  }

  private async failSideEffect(
    claimed: ActionIntent,
    executionClaimId: string,
    normalizedError: {
      code: string
      message: string
      outcomeUnknown: boolean
    },
    status: "failed" | "stale" | "outcome_unknown"
  ): Promise<never> {
    const failed = await repositories.actionIntent.failActionIntent(this.db, {
      actionIntentId: claimed.id,
      executionClaimId,
      error: normalizedError,
      status,
      failedAt: new Date(),
    })
    if (!failed) throw new Error("Action Intent failure was lost")
    throw new ConnectorGatewayError(
      normalizedError.message,
      normalizedError.code
    )
  }

  private async requireAuthority(
    operation: {
      provider: string
      actionFamily: string
      requiredScopes: readonly string[]
    },
    input: { executionId: string; workspaceId: string; connectionId: string }
  ) {
    const authority = await repositories.connection.getConnectorReadAuthority(
      this.db,
      input
    )
    if (authority?.connection.status !== "active") {
      throw new ConnectorGatewayError()
    }
    if (
      authority.connection.provider !== operation.provider ||
      !authority.providerPolicy.actionFamilies.includes(
        operation.actionFamily
      ) ||
      operation.requiredScopes.some(
        (scope) => !authority.connection.scopes.includes(scope)
      ) ||
      operation.requiredScopes.some(
        (scope) => !authority.providerPolicy.maxScopes.includes(scope)
      )
    ) {
      throw new ConnectorGatewayError()
    }
    return authority
  }

  private resolveCredential(connection: {
    id: string
    workspaceId: string
    applicationId: string
    externalSubjectId: string
    provider: string
    credentialEncrypted: string | null
  }): ConnectorReadCredential {
    if (!connection.credentialEncrypted) throw new ConnectorGatewayError()
    try {
      const credential = storedCredentialSchema.parse(
        JSON.parse(
          decryptCredential(connection.credentialEncrypted, {
            workspaceId: connection.workspaceId,
            applicationId: connection.applicationId,
            externalSubjectId: connection.externalSubjectId,
            recordId: connection.id,
            provider: connection.provider,
          })
        )
      )
      if (
        credential.expiresAt &&
        Date.parse(credential.expiresAt) <= Date.now()
      ) {
        throw new ConnectorGatewayError()
      }
      return credential
    } catch (error) {
      if (error instanceof ConnectorGatewayError) throw error
      throw new ConnectorGatewayError()
    }
  }
}
