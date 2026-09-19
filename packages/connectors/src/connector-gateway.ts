import { decryptCredential, repositories, type Database } from "@linea/db"
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
    let normalized
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
    let canonicalDigest: string
    let safeDisplay
    try {
      canonicalDigest = digestActionIntent(envelope)
      safeDisplay = validateSafeDisplay(operation.display(envelope))
    } catch {
      throw new ConnectorGatewayError(
        "Connector action is invalid",
        "validation_failed"
      )
    }
    const created = await repositories.actionIntent.createActionIntent(
      this.db,
      {
        workspaceId: input.workspaceId,
        executionId: input.executionId,
        nodeId: input.nodeId,
        connectionId: input.connectionId,
        connector: operation.provider,
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
    if (consent.approvalRequest.status === "pending") {
      return {
        outcome: "awaiting_consent",
        actionIntentId: consent.intent.id,
      }
    }
    if (consent.approvalRequest.status === "cancelled") {
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
    const currentAuthority = await this.requireAuthority(operation, {
      executionId: input.executionId,
      workspaceId: input.workspaceId,
      connectionId: consent.intent.connectionId,
    })
    const credential = this.resolveCredential(currentAuthority.connection)
    const claimed = await repositories.actionIntent.claimApprovedActionIntent(
      this.db,
      consent.intent.id
    )
    if (!claimed) throw new Error("Action Intent was not claimable")
    if (claimed.status === "succeeded") {
      return { outcome: "completed", result: claimed.normalizedResult }
    }
    if (claimed.status === "rejected") {
      return {
        outcome: "rejected",
        actionIntentId: claimed.id,
        reason: consent.decision.reason,
      }
    }
    if (
      claimed.status === "failed" ||
      claimed.status === "stale" ||
      claimed.status === "outcome_unknown"
    ) {
      if (!claimed.normalizedError) {
        throw new Error("Terminal Action Intent is missing its error")
      }
      throw new ConnectorGatewayError(
        claimed.normalizedError.message,
        claimed.normalizedError.code
      )
    }
    if (claimed.status !== "executing") {
      throw new ConnectorGatewayError("Action Intent is not executable")
    }
    let result: unknown
    try {
      const parameters = operation.parametersSchema.parse(
        claimed.canonicalEnvelope.parameters
      )
      const preconditions = operation.preconditionsSchema.parse(
        claimed.canonicalEnvelope.providerPreconditions
      )
      result = operation.resultSchema.parse(
        await operation.execute(
          parameters,
          preconditions,
          credential,
          claimed.invocationIdempotencyKey,
          input.signal
        )
      )
    } catch (providerFailure) {
      const normalizedError = operation.providerErrorSchema.parse(
        operation.normalizeProviderError(providerFailure)
      )
      const status = normalizedError.outcomeUnknown
        ? "outcome_unknown"
        : normalizedError.code === "precondition_failed"
          ? "stale"
          : "failed"
      const failed = await repositories.actionIntent.failActionIntent(
        this.db,
        claimed.id,
        normalizedError,
        status
      )
      if (!failed) throw new Error("Action Intent failure was lost")
      throw new ConnectorGatewayError(
        normalizedError.message,
        normalizedError.code
      )
    }
    const completed = await repositories.actionIntent.completeActionIntent(
      this.db,
      claimed.id,
      result
    )
    if (!completed) throw new Error("Action Intent completion was lost")
    return { outcome: "completed", result }
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
