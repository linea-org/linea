import {
  cancelEnvironmentExecutionOperation,
  createEnvironmentConversationOperation,
  getEnvironmentConversationOperation,
  getEnvironmentExecutionOperation,
  listEnvironmentConversationsOperation,
  listEnvironmentConnectorAuditEventsOperation,
  listWebhookDeliveriesOperation,
  provisionEnvironmentSubjectOperation,
  startEnvironmentExecutionOperation,
} from "@linea/protocol/operations"
import type {
  ConversationProjection,
  CreateEnvironmentConversation,
  ExternalSubjectProjection,
  OperatorConnectorAuditEvent,
  ProvisionExternalSubject,
  PublicExecution,
  StartEnvironmentExecution,
} from "@linea/protocol/resources"
import type { PaginatedResponse, PaginationQuery } from "@linea/protocol/shared"
import type { WebhookDelivery } from "@linea/protocol/webhooks"
import type { EnvironmentKey } from "./credentials.js"
import { ServerTransport } from "./transport.js"

const defaultBaseUrl = "http://localhost:3000"

export type LineaEnvironmentClientOptions = {
  environmentId: string
  environmentKey: EnvironmentKey
  baseUrl?: string
}

export type IdempotencyOptions = {
  idempotencyKey?: string
}

function idempotencyKey(options: IdempotencyOptions): string {
  return options.idempotencyKey ?? crypto.randomUUID()
}

export class LineaEnvironmentClient {
  private readonly environmentId: string
  private readonly transport: ServerTransport

  constructor(options: LineaEnvironmentClientOptions) {
    this.environmentId = options.environmentId
    this.transport = new ServerTransport(
      options.baseUrl ?? defaultBaseUrl,
      options.environmentKey.value
    )
  }

  provisionSubject(
    input: ProvisionExternalSubject
  ): Promise<ExternalSubjectProjection> {
    return this.transport.execute(provisionEnvironmentSubjectOperation, {
      path: { environmentId: this.environmentId },
      body: input,
    })
  }

  createConversation(
    input: CreateEnvironmentConversation,
    options: IdempotencyOptions = {}
  ): Promise<ConversationProjection> {
    return this.transport.execute(createEnvironmentConversationOperation, {
      path: { environmentId: this.environmentId },
      body: input,
      idempotencyKey: idempotencyKey(options),
    })
  }

  listConversations(
    query: Partial<PaginationQuery> = {}
  ): Promise<PaginatedResponse<ConversationProjection>> {
    return this.transport.execute(listEnvironmentConversationsOperation, {
      path: { environmentId: this.environmentId },
      query,
    })
  }

  getConversation(conversationId: string): Promise<ConversationProjection> {
    return this.transport.execute(getEnvironmentConversationOperation, {
      path: { environmentId: this.environmentId, conversationId },
    })
  }

  startExecution(
    input: StartEnvironmentExecution,
    options: IdempotencyOptions = {}
  ): Promise<PublicExecution> {
    return this.transport.execute(startEnvironmentExecutionOperation, {
      path: { environmentId: this.environmentId },
      body: input,
      idempotencyKey: idempotencyKey(options),
    })
  }

  getExecution(executionId: string): Promise<PublicExecution> {
    return this.transport.execute(getEnvironmentExecutionOperation, {
      path: { executionId },
    })
  }

  cancelExecution(
    executionId: string,
    options: IdempotencyOptions = {}
  ): Promise<PublicExecution> {
    return this.transport.execute(cancelEnvironmentExecutionOperation, {
      path: { executionId },
      idempotencyKey: idempotencyKey(options),
    })
  }

  listWebhookDeliveries(
    query: Partial<PaginationQuery> = {}
  ): Promise<PaginatedResponse<WebhookDelivery>> {
    return this.transport.execute(listWebhookDeliveriesOperation, {
      path: { environmentId: this.environmentId },
      query,
    })
  }

  listAuditEvents(
    query: Partial<PaginationQuery> = {}
  ): Promise<PaginatedResponse<OperatorConnectorAuditEvent>> {
    return this.transport.execute(
      listEnvironmentConnectorAuditEventsOperation,
      { path: { environmentId: this.environmentId }, query }
    )
  }
}
