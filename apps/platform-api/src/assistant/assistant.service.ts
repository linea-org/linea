import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import type { ConversationTurn, ToolCall } from '@linea/ai'
import { db, repositories } from '@linea/db'
import type { WorkflowGraph } from '@linea/runtime'
import { branchUpTo } from './assistant-branch'
import { validateAssistantGraph } from './assistant-graph'
import { AssistantModel } from './assistant-model'
import { AssistantModelUnavailableError } from './assistant-model-error'
import { AssistantOutputError } from './assistant-output-error'
import {
  AssistantTools,
  WEB_TOOL,
  type AssistantAction,
} from './assistant-tools'
import {
  buildAssistantSystemPrompt,
  buildAssistantUserTurn,
  withAttachments,
} from './assistant-prompt'
import { parseAssistantReply } from './assistant-reply'
import type { AssistantMessageDto } from './dto/assistant-message.dto'

const MAX_ATTEMPTS = 2
const MAX_TOOL_ROUNDS = 5
const MAX_OUTPUT_TOKENS = 6000

export type AssistantAnswer = {
  conversationId: string
  userMessageId: string
  messageId: string
  reply: string
  title: string | null
  graph: WorkflowGraph | null
  /** What the assistant did on the way, so the user can see it. */
  actions: AssistantAction[]
  model: string | null
}

type Reply = Omit<
  AssistantAnswer,
  'conversationId' | 'userMessageId' | 'messageId'
>

const MAX_HISTORY_MESSAGES = 20
const MAX_TITLE_LENGTH = 60

/** Only proposes a graph: it never saves, publishes or runs anything. */
@Injectable()
export class AssistantService {
  constructor(
    private readonly model: AssistantModel,
    private readonly tools: AssistantTools,
  ) {}

  async replyForWorkflow(
    workspaceId: string,
    userId: string,
    workflowId: string,
    input: AssistantMessageDto,
  ): Promise<AssistantAnswer> {
    const workflow = await repositories.workflow.getWorkflowById(
      db,
      workspaceId,
      workflowId,
    )
    if (!workflow) throw new NotFoundException('Workflow not found')
    const environment = await repositories.environment.getWorkflowEnvironment(
      db,
      workspaceId,
      workflowId,
      'dev',
    )
    if (!environment) {
      throw new NotFoundException('Development Environment not found')
    }
    return this.converse(workspaceId, userId, workflowId, environment.id, input)
  }

  async replyForApplication(
    workspaceId: string,
    userId: string,
    applicationId: string,
    input: AssistantMessageDto,
  ): Promise<AssistantAnswer> {
    const application = await repositories.application.getApplicationById(
      db,
      workspaceId,
      applicationId,
    )
    if (!application) throw new NotFoundException('Application not found')
    const environments = await repositories.environment.listEnvironments(
      db,
      workspaceId,
      applicationId,
    )
    const environment = environments.find((item) => item.environment === 'dev')
    if (!environment) {
      throw new NotFoundException('Development Environment not found')
    }
    return this.converse(workspaceId, userId, null, environment.id, input)
  }

  /** Saves the chat as it goes, and takes the model's context from what was saved, not from the browser. */
  private async converse(
    workspaceId: string,
    userId: string,
    workflowId: string | null,
    environmentId: string,
    input: AssistantMessageDto,
  ): Promise<AssistantAnswer> {
    const conversation = await this.openConversation(
      workspaceId,
      userId,
      workflowId,
      input,
    )
    const saved =
      await repositories.assistantConversation.listAssistantMessages(
        db,
        workspaceId,
        conversation.id,
      )
    const branch = branchUpTo(saved, input.parentMessageId)
    const history: ConversationTurn[] = branch
      .slice(-MAX_HISTORY_MESSAGES)
      .map(({ role, content, attachments }) => ({
        role,
        content: withAttachments(content, attachments),
      }))
    const userMessage =
      await repositories.assistantConversation.appendAssistantMessage(db, {
        workspaceId,
        conversationId: conversation.id,
        parentId: branch.at(-1)?.id ?? null,
        role: 'user',
        content: input.message,
        attachments: input.attachments,
      })
    const reply = await this.think(workspaceId, environmentId, input, history)
    const replyMessage =
      await repositories.assistantConversation.appendAssistantMessage(db, {
        workspaceId,
        conversationId: conversation.id,
        parentId: userMessage.id,
        role: 'assistant',
        content: reply.reply,
        proposal: reply.graph
          ? { title: reply.title, graph: reply.graph }
          : null,
        actions: reply.actions,
        model: reply.model,
      })
    return {
      ...reply,
      conversationId: conversation.id,
      userMessageId: userMessage.id,
      messageId: replyMessage.id,
    }
  }

  private async openConversation(
    workspaceId: string,
    userId: string,
    workflowId: string | null,
    input: AssistantMessageDto,
  ) {
    if (!input.conversationId) {
      const title = input.message.trim()
      return repositories.assistantConversation.createAssistantConversation(
        db,
        {
          workspaceId,
          userId,
          workflowId,
          title:
            title.length > MAX_TITLE_LENGTH
              ? `${title.slice(0, MAX_TITLE_LENGTH - 1)}…`
              : title,
        },
      )
    }
    const conversation =
      await repositories.assistantConversation.getAssistantConversation(
        db,
        workspaceId,
        userId,
        input.conversationId,
      )
    if (conversation?.workflowId !== workflowId) {
      throw new NotFoundException('Conversation not found')
    }
    return conversation
  }

  private async think(
    workspaceId: string,
    environmentId: string,
    input: AssistantMessageDto,
    history: ConversationTurn[],
  ): Promise<Reply> {
    const actions: AssistantAction[] = []
    let prompt: string | undefined = buildAssistantUserTurn(
      input.message,
      input.graph,
      input.attachments,
    )
    let rejections = 0
    let toolRounds = 0
    for (;;) {
      const result = await this.completeTurn(
        workspaceId,
        environmentId,
        input,
        history,
        prompt,
      )
      if (prompt !== undefined) {
        history.push({ role: 'user', content: prompt })
        prompt = undefined
      }
      if (result.toolCalls?.length) {
        toolRounds += 1
        if (toolRounds > MAX_TOOL_ROUNDS) {
          return noGraphReply(
            'I used too many steps on that and stopped. Try a narrower ask.',
            actions,
            result.model,
          )
        }
        history.push({ role: 'assistant', toolCalls: result.toolCalls })
        await this.runToolCalls(result.toolCalls, history, actions)
        continue
      }
      try {
        const parsed = parseAssistantReply(result.text)
        const graph = parsed.graph ? validateAssistantGraph(parsed.graph) : null
        return {
          reply: parsed.reply,
          title: graph ? (parsed.title ?? null) : null,
          graph,
          actions,
          model: result.model,
        }
      } catch (error) {
        if (!(error instanceof AssistantOutputError)) throw error
        rejections += 1
        if (rejections >= MAX_ATTEMPTS) {
          return noGraphReply(
            `I couldn't produce a valid workflow for that: ${error.message}`,
            actions,
            result.model,
          )
        }
        history.push({ role: 'assistant', content: result.text })
        prompt = `Your last answer was rejected: ${error.message}\nAnswer again with the corrected JSON object only.`
      }
    }
  }

  private completeTurn(
    workspaceId: string,
    environmentId: string,
    input: AssistantMessageDto,
    history: ConversationTurn[],
    prompt: string | undefined,
  ) {
    return this.model
      .complete(
        workspaceId,
        environmentId,
        {
          systemPrompt: buildAssistantSystemPrompt(input.tools),
          history: [...history],
          prompt,
          tools: input.tools.web ? [WEB_TOOL] : undefined,
          maxTokens: MAX_OUTPUT_TOKENS,
          temperature: 0.2,
        },
        input.model,
      )
      .catch((error: unknown) => {
        if (error instanceof AssistantModelUnavailableError) {
          throw new UnprocessableEntityException(error.message)
        }
        throw error
      })
  }

  /** Sequential on purpose: each tool result is appended to the history in call order. */
  private async runToolCalls(
    calls: ToolCall[],
    history: ConversationTurn[],
    actions: AssistantAction[],
  ) {
    for (const call of calls) {
      const outcome = await this.tools.run(call)
      if (outcome.action) actions.push(outcome.action)
      history.push({
        role: 'tool',
        toolCallId: call.id,
        content: outcome.content,
      })
    }
  }
}

function noGraphReply(
  reply: string,
  actions: AssistantAction[],
  model: string,
): Reply {
  return { reply, title: null, graph: null, actions, model }
}
