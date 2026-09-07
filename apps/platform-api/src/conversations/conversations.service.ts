import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { db, repositories, type Execution } from '@linea/db'
import { WorkflowQueueService } from '../queue/workflow-queue.service'
import { ConversationSessionTokenService } from './conversation-session-token.service'
import type { SendConversationMessageDto } from './dto/send-conversation-message.dto'

type SendConversationMessageResult = {
  execution: Execution
  conversationId: string
  externalSubjectId: string
  sessionToken: string
  sessionExpiresAt: number
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly queue: WorkflowQueueService,
    private readonly sessionTokens: ConversationSessionTokenService,
  ) {}
  async sendMessage(
    workspaceId: string,
    workflowId: string,
    conversationId: string,
    input: SendConversationMessageDto,
  ): Promise<SendConversationMessageResult> {
    const { chatMessage, execution } = await db.transaction(async (tx) => {
      await repositories.chatMessage.acquireConversationLock(
        tx,
        workspaceId,
        workflowId,
        conversationId,
      )
      const established =
        await repositories.chatMessage.getEstablishedExternalSubjectId(
          tx,
          workspaceId,
          workflowId,
          conversationId,
        )
      if (
        established.found &&
        established.externalSubjectId !== input.externalSubjectId
      ) {
        throw new ConflictException(
          'Conversation belongs to a different external subject',
        )
      }
      const chatMessage = await repositories.chatMessage.createChatMessage(tx, {
        workspaceId,
        workflowId,
        conversationId,
        role: 'user',
        content: input.message,
        externalSubjectId: input.externalSubjectId,
      })
      const result = await repositories.execution.triggerWorkflowExecution(
        tx,
        workspaceId,
        { by: 'id', value: workflowId },
        {
          trigger: 'manual',
          triggerPayload: {
            conversationId,
            chatMessageId: chatMessage.id,
            externalSubjectId: input.externalSubjectId,
          },
          environment: 'production',
          externalSubjectId: input.externalSubjectId,
        },
      )
      switch (result.outcome) {
        case 'not_found':
          throw new NotFoundException('Workflow not found')
        case 'archived':
          throw new BadRequestException('Workflow is archived')
        case 'unpublished':
          throw new BadRequestException('Workflow has no published version')
      }
      return { chatMessage, execution: result.execution }
    })
    try {
      await this.queue.enqueue(execution.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await db.transaction(async (tx) => {
        const failed = await repositories.execution.failQueuedExecution(
          tx,
          execution.id,
          { message },
        )
        if (failed) {
          await repositories.chatMessage.deleteChatMessage(
            tx,
            workspaceId,
            chatMessage.id,
          )
        }
      })
      throw new ServiceUnavailableException(
        'Failed to enqueue execution — it will not run',
      )
    }
    const session = this.sessionTokens.mint({
      workspaceId,
      workflowId,
      conversationId,
      externalSubjectId: input.externalSubjectId,
    })
    return {
      execution,
      conversationId,
      externalSubjectId: input.externalSubjectId,
      sessionToken: session.token,
      sessionExpiresAt: session.expiresAt,
    }
  }
}
