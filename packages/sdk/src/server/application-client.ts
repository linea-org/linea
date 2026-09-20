import {
  cancelApplicationExecutionOperation,
  createApplicationConversationOperation,
  getApplicationConversationOperation,
  getApplicationExecutionOperation,
  listApplicationConversationsOperation,
  listApplicationConnectorAuditEventsOperation,
  listWebhookDeliveriesOperation,
  provisionApplicationSubjectOperation,
  startApplicationExecutionOperation,
} from "@linea/protocol/operations"
import type {
  ConversationProjection,
  CreateApplicationConversation,
  ExternalSubjectProjection,
  OperatorConnectorAuditEvent,
  ProvisionExternalSubject,
  PublicExecution,
  StartApplicationExecution,
} from "@linea/protocol/resources"
import type { PaginatedResponse, PaginationQuery } from "@linea/protocol/shared"
import type { WebhookDelivery } from "@linea/protocol/webhooks"
import type { ApplicationKey } from "./credentials.js"
import { ServerTransport } from "./transport.js"

const defaultBaseUrl = "http://localhost:3000"

export type LineaApplicationClientOptions = {
  applicationId: string
  applicationKey: ApplicationKey
  baseUrl?: string
}

export type IdempotencyOptions = {
  idempotencyKey?: string
}

function idempotencyKey(options: IdempotencyOptions): string {
  return options.idempotencyKey ?? crypto.randomUUID()
}

export class LineaApplicationClient {
  private readonly applicationId: string
  private readonly transport: ServerTransport

  constructor(options: LineaApplicationClientOptions) {
    this.applicationId = options.applicationId
    this.transport = new ServerTransport(
      options.baseUrl ?? defaultBaseUrl,
      options.applicationKey.value
    )
  }

  provisionSubject(
    input: ProvisionExternalSubject
  ): Promise<ExternalSubjectProjection> {
    return this.transport.execute(provisionApplicationSubjectOperation, {
      path: { applicationId: this.applicationId },
      body: input,
    })
  }

  createConversation(
    input: CreateApplicationConversation,
    options: IdempotencyOptions = {}
  ): Promise<ConversationProjection> {
    return this.transport.execute(createApplicationConversationOperation, {
      path: { applicationId: this.applicationId },
      body: input,
      idempotencyKey: idempotencyKey(options),
    })
  }

  listConversations(
    query: Partial<PaginationQuery> = {}
  ): Promise<PaginatedResponse<ConversationProjection>> {
    return this.transport.execute(listApplicationConversationsOperation, {
      path: { applicationId: this.applicationId },
      query,
    })
  }

  getConversation(conversationId: string): Promise<ConversationProjection> {
    return this.transport.execute(getApplicationConversationOperation, {
      path: { applicationId: this.applicationId, conversationId },
    })
  }

  startExecution(
    input: StartApplicationExecution,
    options: IdempotencyOptions = {}
  ): Promise<PublicExecution> {
    return this.transport.execute(startApplicationExecutionOperation, {
      path: { applicationId: this.applicationId },
      body: input,
      idempotencyKey: idempotencyKey(options),
    })
  }

  getExecution(executionId: string): Promise<PublicExecution> {
    return this.transport.execute(getApplicationExecutionOperation, {
      path: { executionId },
    })
  }

  cancelExecution(
    executionId: string,
    options: IdempotencyOptions = {}
  ): Promise<PublicExecution> {
    return this.transport.execute(cancelApplicationExecutionOperation, {
      path: { executionId },
      idempotencyKey: idempotencyKey(options),
    })
  }

  listWebhookDeliveries(
    query: Partial<PaginationQuery> = {}
  ): Promise<PaginatedResponse<WebhookDelivery>> {
    return this.transport.execute(listWebhookDeliveriesOperation, {
      path: { applicationId: this.applicationId },
      query,
    })
  }

  listAuditEvents(
    query: Partial<PaginationQuery> = {}
  ): Promise<PaginatedResponse<OperatorConnectorAuditEvent>> {
    return this.transport.execute(
      listApplicationConnectorAuditEventsOperation,
      { path: { applicationId: this.applicationId }, query }
    )
  }
}
