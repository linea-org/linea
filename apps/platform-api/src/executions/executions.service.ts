import { randomUUID } from 'node:crypto'
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  db,
  repositories,
  type ChatMessage,
  type Execution,
  type ExecutionStep,
} from '@linea/db'
import {
  assertNoReservedNodeIds,
  hashWorkflowGraph,
  validateGraphStructure,
  workflowGraphSchema,
  WorkflowGraphError,
} from '@linea/runtime'
import { StepReplayQueueService } from '../queue/step-replay-queue.service'
import { WorkflowQueueService } from '../queue/workflow-queue.service'
import type { CountNewWorkspaceExecutionsDto } from './dto/count-new-workspace-executions.dto'
import type { ListWorkspaceExecutionsDto } from './dto/list-workspace-executions.dto'
import type { SendChatMessageDto } from './dto/chat-preview.dto'
import type { ReplayStepDto } from './dto/replay-step.dto'
import type { TestRunDto } from './dto/test-run.dto'
import type { TriggerExecutionDto } from './dto/trigger-execution.dto'

@Injectable()
export class ExecutionsService {
  constructor(
    private readonly queue: WorkflowQueueService,
    private readonly stepReplayQueue: StepReplayQueueService,
  ) {}

  async trigger(
    workspaceId: string,
    workflowId: string,
    input: TriggerExecutionDto,
  ): Promise<Execution> {
    const result = await repositories.execution.triggerWorkflowExecution(
      db,
      workspaceId,
      { by: 'id', value: workflowId },
      { trigger: 'manual', triggerPayload: input.triggerPayload },
    )
    switch (result.outcome) {
      case 'not_found':
        throw new NotFoundException('Workflow not found')
      case 'archived':
        throw new BadRequestException('Workflow is archived')
      case 'unpublished':
        throw new BadRequestException('Workflow has no published version')
    }

    const execution = result.execution

    try {
      await this.queue.enqueue(execution.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await repositories.execution.failQueuedExecution(db, execution.id, {
        message,
      })
      throw new ServiceUnavailableException(
        'Failed to enqueue execution — it will not run',
      )
    }

    return execution
  }

  /** Runs a graph the builder hasn't published (or even committed) yet — checkpoints it under the hood via ensureVersionForGraph so the interpreter has a version row to read, without polluting the "Save as version" history the user curates explicitly. */
  async testRun(
    workspaceId: string,
    workflowId: string,
    input: TestRunDto,
  ): Promise<Execution> {
    // Confirms the workflow belongs to this workspace before any write — ensureVersionForGraph below is not itself workspace-scoped.
    const workflow = await repositories.workflow.getWorkflowById(
      db,
      workspaceId,
      workflowId,
    )
    if (!workflow) {
      throw new NotFoundException('Workflow not found')
    }

    try {
      validateGraphStructure(input.graph)
      assertNoReservedNodeIds(input.graph)
    } catch (error) {
      if (error instanceof WorkflowGraphError) {
        throw new BadRequestException(error.message)
      }
      throw error
    }

    const version = await repositories.workflow.ensureVersionForGraph(
      db,
      workflowId,
      { graph: input.graph, contentHash: hashWorkflowGraph(input.graph) },
    )

    const result =
      await repositories.execution.triggerWorkflowExecutionForVersion(
        db,
        workspaceId,
        workflowId,
        version.id,
        { trigger: 'manual' },
      )
    switch (result.outcome) {
      case 'not_found':
        throw new NotFoundException('Workflow not found')
      case 'archived':
        throw new BadRequestException('Workflow is archived')
    }

    const execution = result.execution

    try {
      await this.queue.enqueue(execution.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await repositories.execution.failQueuedExecution(db, execution.id, {
        message,
      })
      throw new ServiceUnavailableException(
        'Failed to enqueue execution — it will not run',
      )
    }

    return execution
  }

  /** One turn of a chat preview: persists the user's message, then runs the (possibly draft) graph as a normal one-shot execution carrying conversationId in triggerPayload — the AI node picks up prior turns from there. Follows testRun's exact draft-graph pattern. A conversation is a sequence of independent executions sharing a conversationId, not one execution pausing repeatedly — the graph is a DAG and can't loop back to "wait for the next message." */
  async sendChatMessage(
    workspaceId: string,
    workflowId: string,
    input: SendChatMessageDto,
  ): Promise<{ execution: Execution; conversationId: string }> {
    const workflow = await repositories.workflow.getWorkflowById(
      db,
      workspaceId,
      workflowId,
    )
    if (!workflow) {
      throw new NotFoundException('Workflow not found')
    }

    try {
      validateGraphStructure(input.graph)
      assertNoReservedNodeIds(input.graph)
    } catch (error) {
      if (error instanceof WorkflowGraphError) {
        throw new BadRequestException(error.message)
      }
      throw error
    }

    const conversationId = input.conversationId ?? randomUUID()

    const version = await repositories.workflow.ensureVersionForGraph(
      db,
      workflowId,
      { graph: input.graph, contentHash: hashWorkflowGraph(input.graph) },
    )

    // The user turn and the execution that will answer it are created together so a trigger
    // failure (e.g. the workflow was archived in the gap since the check above) rolls back the
    // message too, instead of leaving an orphaned turn with nothing able to reply to it. The
    // message's own id rides along in triggerPayload as chatMessageId so the AI node can find
    // its own turn precisely rather than assuming "whichever message is latest" once it runs.
    const { chatMessage, execution } = await db.transaction(async (tx) => {
      const chatMessage = await repositories.chatMessage.createChatMessage(tx, {
        workspaceId,
        workflowId,
        conversationId,
        role: 'user',
        content: input.message,
      })

      const result =
        await repositories.execution.triggerWorkflowExecutionForVersion(
          tx,
          workspaceId,
          workflowId,
          version.id,
          {
            trigger: 'manual',
            triggerPayload: { conversationId, chatMessageId: chatMessage.id },
          },
        )
      switch (result.outcome) {
        case 'not_found':
          throw new NotFoundException('Workflow not found')
        case 'archived':
          throw new BadRequestException('Workflow is archived')
      }

      return { chatMessage, execution: result.execution }
    })

    try {
      await this.queue.enqueue(execution.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failed = await repositories.execution.failQueuedExecution(
        db,
        execution.id,
        { message },
      )
      // failQueuedExecution only transitions a still-"queued" row - an enqueue() timeout doesn't
      // guarantee the underlying Redis command actually failed (see WorkflowQueueService's own
      // accepted-risk note), so a worker may already have claimed this execution by the time we
      // get here. Only delete the triggering message when we genuinely won the "failed"
      // transition - otherwise the execution really is running and still needs this message to
      // persist its linked reply.
      if (failed) {
        await repositories.chatMessage
          .deleteChatMessage(db, workspaceId, chatMessage.id)
          .catch(() => {})
      }
      throw new ServiceUnavailableException(
        'Failed to enqueue execution — it will not run',
      )
    }

    return { execution, conversationId }
  }

  async listChatMessages(
    workspaceId: string,
    workflowId: string,
    conversationId: string,
  ): Promise<ChatMessage[]> {
    const workflow = await repositories.workflow.getWorkflowById(
      db,
      workspaceId,
      workflowId,
    )
    if (!workflow) {
      throw new NotFoundException('Workflow not found')
    }
    return repositories.chatMessage.listChatMessages(
      db,
      workspaceId,
      workflowId,
      conversationId,
    )
  }

  async listChatConversations(workspaceId: string, workflowId: string) {
    const workflow = await repositories.workflow.getWorkflowById(
      db,
      workspaceId,
      workflowId,
    )
    if (!workflow) {
      throw new NotFoundException('Workflow not found')
    }
    return repositories.chatMessage.listConversations(
      db,
      workspaceId,
      workflowId,
    )
  }

  async list(workspaceId: string, workflowId: string): Promise<Execution[]> {
    const workflow = await repositories.workflow.getWorkflowById(
      db,
      workspaceId,
      workflowId,
    )
    if (!workflow) {
      throw new NotFoundException('Workflow not found')
    }
    return repositories.execution.listExecutions(db, workflowId)
  }

  listWorkspace(workspaceId: string, filters: ListWorkspaceExecutionsDto) {
    return repositories.execution.listWorkspaceExecutions(db, workspaceId, {
      status: filters.status,
      trigger: filters.trigger,
      cursor: filters.cursor,
    })
  }

  countNew(workspaceId: string, filters: CountNewWorkspaceExecutionsDto) {
    return repositories.execution.countNewWorkspaceExecutions(db, workspaceId, {
      status: filters.status,
      trigger: filters.trigger,
      since: filters.since,
    })
  }

  async get(
    workspaceId: string,
    id: string,
  ): Promise<{
    execution: Execution
    steps: ExecutionStep[]
    nodeConfigs: Record<string, Record<string, unknown>>
    replayable: boolean
  }> {
    const result = await repositories.execution.getExecutionWithSteps(db, id)
    if (!result || result.execution.workspaceId !== workspaceId) {
      throw new NotFoundException('Execution not found')
    }

    const version = await repositories.workflow.getWorkflowVersionById(
      db,
      result.execution.workflowVersionId,
    )
    const nodeConfigs: Record<string, Record<string, unknown>> = {}
    if (version) {
      const graph = workflowGraphSchema.parse(version.graph)
      for (const node of graph.nodes) {
        nodeConfigs[node.id] = node.config
      }
    }

    const replayable =
      result.execution.origin === 'native' &&
      repositories.execution.terminalStatuses.includes(result.execution.status)

    return { ...result, nodeConfigs, replayable }
  }

  async replayStep(
    workspaceId: string,
    executionId: string,
    stepId: string,
    input: ReplayStepDto,
  ): Promise<{ replayStepId: string }> {
    const result = await repositories.execution.getExecutionWithSteps(
      db,
      executionId,
    )
    if (!result || result.execution.workspaceId !== workspaceId) {
      throw new NotFoundException('Execution not found')
    }
    if (
      result.execution.origin !== 'native' ||
      !repositories.execution.terminalStatuses.includes(result.execution.status)
    ) {
      throw new BadRequestException('Execution is not replayable')
    }

    const step = result.steps.find((s) => s.id === stepId)
    if (!step) {
      throw new NotFoundException('Step not found')
    }
    if (step.isSystemEvent) {
      throw new BadRequestException('Cannot replay a system event')
    }
    if (step.replayedFromStepId !== null) {
      throw new BadRequestException(
        'Cannot replay a replay — replay the original step',
      )
    }

    const replayStepId = randomUUID()
    await this.stepReplayQueue.enqueue({
      replayStepId,
      originalStepId: step.id,
      overrideConfig: input.overrideConfig ?? {},
    })
    return { replayStepId }
  }
}
