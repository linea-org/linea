import { createHash } from 'node:crypto'
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { db, repositories, type Execution } from '@linea/db'
import type {
  CreateApplicationConversation,
  CreateEndUserConversation,
  CreateMessage,
  StartApplicationExecution,
  StartEndUserExecution,
} from '@linea/protocol/resources'
import { publicErrorStatuses } from '@linea/protocol/errors'
import { jsonValueSchema, type PaginationQuery } from '@linea/protocol/shared'
import { workflowGraphSchema } from '@linea/runtime'
import Ajv2020 from 'ajv/dist/2020'
import type { ApplicationPrincipal } from '../auth/application-key.guard'
import { publicError } from '../auth/public-error'
import type { EndUserPrincipal } from '../end-user-sessions/end-user-session.guard'
import { WorkflowQueueService } from '../queue/workflow-queue.service'
import {
  conversationProjection,
  executionProjection,
  messageProjection,
} from './public-runtime.projections'
import {
  decodeConversationCursor,
  decodeMessageCursor,
  encodeConversationCursor,
  encodeMessageCursor,
} from './public-pagination'
import { PublicRuntimeRateLimitException } from './public-runtime-rate-limit.filter'

const RATE_LIMIT_WINDOW_MS = 60 * 1000
const MESSAGE_RATE_LIMIT = 60
const EXECUTION_RATE_LIMIT = 10
const outputValidator = new Ajv2020({ strict: true, addUsedSchema: false })

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

@Injectable()
export class PublicRuntimeService {
  constructor(private readonly queue: WorkflowQueueService) {}

  async createApplicationConversation(
    principal: ApplicationPrincipal,
    input: CreateApplicationConversation,
    idempotencyKey: string,
  ) {
    return this.createConversation(
      principal,
      input.externalSubjectId,
      input,
      'backend',
      idempotencyKey,
    )
  }

  async createEndUserConversation(
    principal: EndUserPrincipal,
    input: CreateEndUserConversation,
    idempotencyKey: string,
  ) {
    return this.createConversation(
      principal,
      principal.externalSubjectId,
      input,
      'end_user',
      idempotencyKey,
    )
  }

  private async createConversation(
    principal: ApplicationPrincipal | EndUserPrincipal,
    externalSubjectId: string,
    input: CreateEndUserConversation,
    startKind: 'backend' | 'end_user',
    idempotencyKey: string,
  ) {
    const actor: {
      kind: 'application_key' | 'end_user_session'
      id: string
    } =
      'keyId' in principal
        ? { kind: 'application_key', id: principal.keyId }
        : { kind: 'end_user_session', id: principal.sessionId }
    const result = await repositories.publicRuntime.createPublicConversation(
      db,
      {
        workspaceId: principal.workspaceId,
        applicationId: principal.applicationId,
        externalSubjectId,
        workflowId: input.workflowId,
        startKind,
        externalThreadKey: input.externalThreadKey,
        title: input.title,
        metadata: input.metadata,
        idempotency: {
          actor,
          key: idempotencyKey,
          requestHash: repositories.publicIdempotency.hashPublicRequest({
            externalSubjectId,
            ...input,
          }),
        },
      },
    )
    if (result.outcome === 'resource_not_found') this.notFound()
    if (result.outcome === 'workflow_start_not_allowed') {
      throw new ForbiddenException(
        publicError(result.outcome, 'Workflow start is not allowed'),
      )
    }
    if (result.outcome === 'conversation_identity_conflict') {
      throw new ConflictException(
        publicError(result.outcome, 'Conversation identity conflicts'),
      )
    }
    if (result.outcome === 'idempotency_conflict') {
      throw new ConflictException(
        publicError(result.outcome, 'Idempotency key conflicts'),
      )
    }
    return conversationProjection(result.conversation)
  }

  async listApplicationConversations(
    principal: ApplicationPrincipal,
    query: PaginationQuery,
  ) {
    const cursor = decodeConversationCursor(query.cursor)
    const conversations =
      await repositories.publicRuntime.listPublicConversations(
        db,
        principal.workspaceId,
        principal.applicationId,
        undefined,
        query.limit + 1,
        cursor,
      )
    const page = conversations.slice(0, query.limit)
    const last = page.at(-1)
    return {
      data: page.map(conversationProjection),
      nextCursor:
        conversations.length > query.limit && last
          ? encodeConversationCursor(last)
          : null,
    }
  }

  async listEndUserConversations(
    principal: EndUserPrincipal,
    query: PaginationQuery,
  ) {
    const cursor = decodeConversationCursor(query.cursor)
    const conversations =
      await repositories.publicRuntime.listPublicConversations(
        db,
        principal.workspaceId,
        principal.applicationId,
        principal.externalSubjectId,
        query.limit + 1,
        cursor,
      )
    const page = conversations.slice(0, query.limit)
    const last = page.at(-1)
    return {
      data: page.map(conversationProjection),
      nextCursor:
        conversations.length > query.limit && last
          ? encodeConversationCursor(last)
          : null,
    }
  }

  async getApplicationConversation(
    principal: ApplicationPrincipal,
    conversationId: string,
  ) {
    return this.getConversation(principal, undefined, conversationId)
  }

  async getEndUserConversation(
    principal: EndUserPrincipal,
    conversationId: string,
  ) {
    return this.getConversation(
      principal,
      principal.externalSubjectId,
      conversationId,
    )
  }

  private async getConversation(
    principal: ApplicationPrincipal | EndUserPrincipal,
    externalSubjectId: string | undefined,
    conversationId: string,
  ) {
    const conversation = await repositories.publicRuntime.getPublicConversation(
      db,
      principal.workspaceId,
      principal.applicationId,
      externalSubjectId,
      conversationId,
    )
    if (!conversation) this.notFound()
    return conversationProjection(conversation)
  }

  async startApplicationExecution(
    principal: ApplicationPrincipal,
    input: StartApplicationExecution,
    idempotencyKey: string,
  ) {
    return this.startExecution(
      principal,
      input.externalSubjectId,
      input,
      'backend',
      idempotencyKey,
    )
  }

  async startEndUserExecution(
    principal: EndUserPrincipal,
    input: StartEndUserExecution,
    idempotencyKey: string,
  ) {
    await this.enforceRateLimit(
      'execution',
      principal.externalSubjectId,
      EXECUTION_RATE_LIMIT,
    )
    return this.startExecution(
      principal,
      principal.externalSubjectId,
      input,
      'end_user',
      idempotencyKey,
    )
  }

  private async startExecution(
    principal: ApplicationPrincipal | EndUserPrincipal,
    externalSubjectId: string,
    input: StartEndUserExecution,
    startKind: 'backend' | 'end_user',
    idempotencyKey: string,
  ) {
    const actor: {
      kind: 'application_key' | 'end_user_session'
      id: string
    } =
      'keyId' in principal
        ? { kind: 'application_key', id: principal.keyId }
        : { kind: 'end_user_session', id: principal.sessionId }
    const result = await repositories.publicRuntime.startPublicExecution(db, {
      workspaceId: principal.workspaceId,
      applicationId: principal.applicationId,
      externalSubjectId,
      workflowId: input.workflowId,
      conversationId: input.conversationId,
      startKind,
      triggerPayload: input.input,
      idempotency: {
        actor,
        key: idempotencyKey,
        requestHash: repositories.publicIdempotency.hashPublicRequest({
          externalSubjectId,
          ...input,
        }),
      },
    })
    if (result.outcome === 'resource_not_found') this.notFound()
    if (
      result.outcome === 'workflow_start_not_allowed' ||
      result.outcome === 'workflow_binding_incompatible' ||
      result.outcome === 'validation_failed' ||
      result.outcome === 'idempotency_conflict'
    ) {
      throw new HttpException(
        publicError(result.outcome, 'Execution start rejected'),
        publicErrorStatuses[result.outcome],
      )
    }
    if (result.outcome === 'created') {
      try {
        await this.queue.enqueue(result.execution.id)
      } catch {
        await repositories.execution.failQueuedExecution(
          db,
          result.execution.id,
          { message: 'Execution dispatch failed' },
        )
        throw new ServiceUnavailableException(
          publicError(
            'service_unavailable',
            'Execution dispatch is temporarily unavailable',
          ),
        )
      }
    }
    return this.projectExecution(result.execution)
  }

  async getApplicationExecution(
    principal: ApplicationPrincipal,
    executionId: string,
  ) {
    return this.getExecution(principal, undefined, executionId)
  }

  async getEndUserExecution(principal: EndUserPrincipal, executionId: string) {
    return this.getExecution(
      principal,
      principal.externalSubjectId,
      executionId,
    )
  }

  private async getExecution(
    principal: ApplicationPrincipal | EndUserPrincipal,
    externalSubjectId: string | undefined,
    executionId: string,
  ) {
    const execution = await repositories.publicRuntime.getPublicExecution(
      db,
      principal.workspaceId,
      principal.applicationId,
      externalSubjectId,
      executionId,
    )
    if (!execution) this.notFound()
    return this.projectExecution(execution)
  }

  async cancelApplicationExecution(
    principal: ApplicationPrincipal,
    executionId: string,
    idempotencyKey: string,
  ) {
    const result = await repositories.publicRuntime.cancelPublicExecution(
      db,
      principal.workspaceId,
      principal.applicationId,
      executionId,
      {
        actor: { kind: 'application_key', id: principal.keyId },
        key: idempotencyKey,
        requestHash: repositories.publicIdempotency.hashPublicRequest({
          executionId,
        }),
      },
    )
    if (result.outcome === 'resource_not_found') this.notFound()
    if (result.outcome === 'execution_not_cancellable') {
      throw new ConflictException(
        publicError(result.outcome, 'Execution cannot be cancelled'),
      )
    }
    if (result.outcome === 'idempotency_conflict') {
      throw new ConflictException(
        publicError(result.outcome, 'Idempotency key conflicts'),
      )
    }
    return this.projectExecution(result.execution)
  }

  async createEndUserMessage(
    principal: EndUserPrincipal,
    conversationId: string,
    input: CreateMessage,
    idempotencyKey: string,
  ) {
    await this.enforceRateLimit(
      'message',
      principal.sessionId,
      MESSAGE_RATE_LIMIT,
    )
    const result = await repositories.publicRuntime.createPublicMessage(db, {
      workspaceId: principal.workspaceId,
      applicationId: principal.applicationId,
      externalSubjectId: principal.externalSubjectId,
      conversationId,
      content: input.content,
      idempotency: {
        actor: { kind: 'end_user_session', id: principal.sessionId },
        key: idempotencyKey,
        requestHash: repositories.publicIdempotency.hashPublicRequest({
          conversationId,
          content: input.content,
        }),
      },
    })
    if (result.outcome === 'resource_not_found') this.notFound()
    if (result.outcome === 'idempotency_conflict') {
      throw new ConflictException(
        publicError(result.outcome, 'Idempotency key conflicts'),
      )
    }
    return messageProjection(result.message)
  }

  async listEndUserMessages(
    principal: EndUserPrincipal,
    conversationId: string,
    query: PaginationQuery,
  ) {
    const beforeSequence = decodeMessageCursor(query.cursor)
    const messages = await repositories.publicRuntime.listPublicMessages(
      db,
      principal.workspaceId,
      principal.applicationId,
      principal.externalSubjectId,
      conversationId,
      query.limit + 1,
      beforeSequence,
    )
    if (!messages) this.notFound()
    const page = messages.slice(0, query.limit)
    const oldest = page.at(-1)
    return {
      data: page.toReversed().map(messageProjection),
      nextCursor:
        messages.length > query.limit && oldest
          ? encodeMessageCursor(oldest.sequence)
          : null,
    }
  }

  private async projectExecution(execution: Execution) {
    if (execution.status !== 'succeeded') {
      return executionProjection(execution, null)
    }
    if (!execution.workflowContractRevisionId) {
      throw new Error('Public Execution Contract is missing')
    }
    const [executionWithSteps, version, contract] = await Promise.all([
      repositories.execution.getExecutionWithSteps(db, execution.id),
      repositories.workflow.getWorkflowVersionById(
        db,
        execution.workflowVersionId,
      ),
      repositories.workflowContract.getWorkflowContractRevision(
        db,
        execution.workspaceId,
        execution.workflowId,
        execution.workflowContractRevisionId,
      ),
    ])
    if (!executionWithSteps || !version || !contract) {
      throw new Error('Public Execution result state is incomplete')
    }
    const graph = workflowGraphSchema.parse(version.graph)
    const endNodeIds = new Set(
      graph.nodes.filter((node) => node.type === 'end').map((node) => node.id),
    )
    const endStep = executionWithSteps.steps
      .toReversed()
      .find(
        (step) => step.status === 'succeeded' && endNodeIds.has(step.nodeId),
      )
    if (!endStep) throw new Error('Public Execution has no completed End node')
    if (!outputValidator.compile(contract.outputSchema)(endStep.output)) {
      throw new Error('Public Execution output failed Contract validation')
    }
    return executionProjection(execution, jsonValueSchema.parse(endStep.output))
  }

  private async enforceRateLimit(
    operation: 'execution' | 'message',
    actorId: string,
    limit: number,
  ) {
    const now = Date.now()
    const bucket = Math.floor(now / RATE_LIMIT_WINDOW_MS)
    const resetAt = new Date((bucket + 1) * RATE_LIMIT_WINDOW_MS)
    const allowed =
      await repositories.endUserAuthorization.consumeAuthorizationRateLimits(
        db,
        [
          {
            key: hash(`runtime:${operation}:${actorId}:${bucket}`),
            limit,
          },
        ],
        new Date((bucket + 2) * RATE_LIMIT_WINDOW_MS),
      )
    if (!allowed) throw new PublicRuntimeRateLimitException(limit, resetAt)
  }

  private notFound(): never {
    throw new NotFoundException(
      publicError('resource_not_found', 'Resource not found'),
    )
  }
}
