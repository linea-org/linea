import { Injectable, Logger } from "@nestjs/common"
import { db, repositories, type Execution } from "@linea/db"
import { agentDefinitionSchema } from "@linea/runtime"
import {
  calculateCostMicros,
  executionBudgetMessage,
  MAX_EXECUTION_TOKENS,
  resolveApiKey,
  resolveKeyName,
  resolveProvider,
  resolveProviderId,
  type ConversationTurn,
} from "@linea/ai"
import {
  connectorOperationRegistry,
  registeredReadOperation,
  registeredSideEffectOperation,
} from "@linea/connectors"
import { compileContractSchema } from "@linea/protocol/json-schema"
import { z } from "zod"
import {
  CheckpointsService,
  LeaseLostError,
} from "../checkpoints/checkpoints.service"
import { ConnectorGatewayService } from "../connectors/connector-gateway.service"

const completionSchema = z.object({
  text: z.string(),
  tokensInput: z.number().int().nonnegative(),
  tokensOutput: z.number().int().nonnegative(),
  toolCalls: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string(),
        arguments: z.record(z.string(), z.unknown()),
      })
    )
    .optional(),
})
const requestSchema = z.strictObject({
  connectionId: z.uuid(),
  input: z.unknown(),
})
type AgentDefinition = z.infer<typeof agentDefinitionSchema>
type RegisteredOperation = NonNullable<
  | ReturnType<typeof registeredReadOperation>
  | ReturnType<typeof registeredSideEffectOperation>
>
type RegisteredTools = Map<string, RegisteredOperation>
type AgentContract = NonNullable<
  Awaited<
    ReturnType<typeof repositories.agentContract.getAgentContractRevision>
  >
>
type Completion = z.infer<typeof completionSchema>
type Completed = Awaited<ReturnType<CheckpointsService["getResumeState"]>>
type ToolCall = NonNullable<Completion["toolCalls"]>[number]
type ToolOutcome =
  | { kind: "output"; output: unknown }
  | { kind: "paused" }
  | { kind: "resume" }

type RunContext = {
  execution: Execution
  leasedBy: string
  signal: AbortSignal
  definition: AgentDefinition
  contract: AgentContract
  completed: Completed
  registeredTools: RegisteredTools
  tools: { name: string; parameters: Record<string, unknown> }[]
}

@Injectable()
export class AgentExecutionService {
  private readonly logger = new Logger(AgentExecutionService.name)

  constructor(
    private readonly checkpoints: CheckpointsService,
    private readonly gateway: ConnectorGatewayService
  ) {}

  async run(
    execution: Execution,
    leasedBy: string,
    signal: AbortSignal
  ): Promise<void> {
    const context = await this.prepare(execution, leasedBy, signal)
    const conversation: ConversationTurn[] = [
      { role: "user", content: JSON.stringify(execution.triggerPayload) },
    ]
    for (
      let iteration = 0;
      iteration < context.definition.maxIterations;
      iteration += 1
    ) {
      const result = await this.modelTurn(context, conversation, iteration)
      if (!result.toolCalls?.length) {
        await this.finish(context, result)
        return
      }
      conversation.push({ role: "assistant", toolCalls: result.toolCalls })
      for (const [index, call] of result.toolCalls.entries()) {
        // Sequential: a tool call may pause for approval before the next starts.
        const outcome = await this.toolTurn(context, iteration, index, call) // NOSONAR
        if (outcome.kind === "paused") return
        if (outcome.kind === "resume")
          return this.run(execution, leasedBy, signal)
        conversation.push({
          role: "tool",
          toolCallId: call.id,
          content: JSON.stringify(outcome.output),
        })
      }
    }
    throw new Error(
      `Agent exceeded maxIterations (${context.definition.maxIterations})`
    )
  }

  private async prepare(
    execution: Execution,
    leasedBy: string,
    signal: AbortSignal
  ): Promise<RunContext> {
    if (
      !execution.agentId ||
      !execution.agentVersionId ||
      !execution.agentContractRevisionId
    )
      throw new Error("Agent Execution pin is incomplete")
    const [version, contract, completed] = await Promise.all([
      repositories.agent.getAgentVersionById(
        db,
        execution.workspaceId,
        execution.agentId,
        execution.agentVersionId
      ),
      repositories.agentContract.getAgentContractRevision(
        db,
        execution.workspaceId,
        execution.agentId,
        execution.agentContractRevisionId
      ),
      this.checkpoints.getResumeState(execution.id),
    ])
    if (!version || !contract)
      throw new Error("Pinned Agent definition or Contract is missing")
    const definition = agentDefinitionSchema.parse(version.definition)
    const registeredTools = this.registerTools(definition)
    const tools = [...registeredTools].map(([name, operation]) => ({
      name,
      parameters: z.toJSONSchema(
        z.strictObject({
          connectionId: z.uuid(),
          input: operation.inputSchema,
        }),
        { io: "input" }
      ),
    }))
    return {
      execution,
      leasedBy,
      signal,
      definition,
      contract,
      completed,
      registeredTools,
      tools,
    }
  }

  private registerTools(definition: AgentDefinition): RegisteredTools {
    return new Map(
      definition.tools.map((tool) => {
        const operation =
          registeredReadOperation(connectorOperationRegistry, tool.operation) ??
          registeredSideEffectOperation(
            connectorOperationRegistry,
            tool.operation
          )
        if (!operation)
          throw new Error(`Unregistered Connector Operation: ${tool.operation}`)
        return [tool.name, operation] as const
      })
    )
  }

  private async modelTurn(
    context: RunContext,
    conversation: ConversationTurn[],
    iteration: number
  ): Promise<Completion> {
    const { execution, leasedBy, definition, completed } = context
    const modelNodeId = `agent:model:${iteration}`
    if (completed.has(modelNodeId))
      return completionSchema.parse(completed.get(modelNodeId))
    await this.checkpoints.assertOwnsLease(execution.id, leasedBy)
    const used = await this.checkpoints.getResumeTokenTotals(execution.id)
    if (used.tokensInput + used.tokensOutput >= MAX_EXECUTION_TOKENS)
      throw new Error(
        executionBudgetMessage(used.tokensInput + used.tokensOutput)
      )
    const startedAt = new Date()
    let result: Completion
    try {
      result = await this.complete(context, conversation)
    } catch (error) {
      await this.recordFailure(context, {
        nodeId: modelNodeId,
        nodeType: "ai",
        input: { iteration },
        startedAt,
        error,
        model: definition.model,
        provider: resolveProviderId(definition.model),
      })
      throw error
    }
    const cost = calculateCostMicros(
      definition.model,
      result.tokensInput,
      result.tokensOutput
    )
    completed.set(modelNodeId, result)
    await this.checkpoints.recordStep({
      executionId: execution.id,
      workspaceId: execution.workspaceId,
      leasedBy,
      nodeId: modelNodeId,
      nodeType: "ai",
      input: { iteration },
      output: result,
      startedAt,
      endedAt: new Date(),
      completed,
      variables: {},
      tokensInput: result.tokensInput,
      tokensOutput: result.tokensOutput,
      costMicros: cost ?? 0n,
      costUnpriced: cost === undefined,
      model: definition.model,
      provider: resolveProviderId(definition.model),
    })
    return result
  }

  private async complete(
    context: RunContext,
    conversation: ConversationTurn[]
  ): Promise<Completion> {
    const { execution, signal, definition, contract } = context
    const { apiKey } = await resolveApiKey(db, {
      workspaceId: execution.workspaceId,
      environmentId: execution.environmentId ?? undefined,
      keyName: resolveKeyName(definition.model),
    })
    const result = completionSchema.parse(
      await resolveProvider(definition.model).complete(apiKey, {
        model: definition.model,
        systemPrompt: `${definition.instructions}\nReturn a final JSON value satisfying this output schema: ${JSON.stringify(contract.outputSchema)}`,
        history: [...conversation],
        tools: context.tools,
        signal,
      })
    )
    for (const call of result.toolCalls ?? []) {
      const operation = context.registeredTools.get(call.name)
      if (!operation)
        throw new Error(`Agent requested undeclared tool: ${call.name}`)
      operation.inputSchema.parse(requestSchema.parse(call.arguments).input)
    }
    return result
  }

  /** Best-effort: lost leases and cancellations are not step failures. */
  private async recordFailure(
    context: RunContext,
    failure: {
      nodeId: string
      nodeType: string
      input: unknown
      startedAt: Date
      error: unknown
      model?: string
      provider?: string
    }
  ): Promise<void> {
    if (failure.error instanceof LeaseLostError || context.signal.aborted)
      return
    const { execution, leasedBy, completed } = context
    const message =
      failure.error instanceof Error
        ? failure.error.message
        : String(failure.error)
    try {
      await this.checkpoints.recordStep({
        executionId: execution.id,
        workspaceId: execution.workspaceId,
        leasedBy,
        nodeId: failure.nodeId,
        nodeType: failure.nodeType,
        input: failure.input,
        error: {
          message,
          stack:
            failure.error instanceof Error ? failure.error.stack : undefined,
        },
        startedAt: failure.startedAt,
        endedAt: new Date(),
        completed,
        variables: {},
        model: failure.model,
        provider: failure.provider,
      })
    } catch (recordError) {
      this.logger.warn(
        `Could not record failed step ${failure.nodeId}: ${recordError instanceof Error ? recordError.message : String(recordError)}`
      )
    }
  }

  private async finish(context: RunContext, result: Completion): Promise<void> {
    const { execution, leasedBy, contract } = context
    const output: unknown = JSON.parse(result.text)
    if (!compileContractSchema(contract.outputSchema)(output))
      throw new Error("Agent output failed pinned Contract validation")
    const totals = await this.checkpoints.getResumeTokenTotals(execution.id)
    await repositories.execution.completeExecution(db, execution.id, leasedBy, {
      status: "succeeded",
      output,
      ...totals,
    })
  }

  private async toolTurn(
    context: RunContext,
    iteration: number,
    index: number,
    call: ToolCall
  ): Promise<ToolOutcome> {
    const { execution, leasedBy, signal, definition, completed } = context
    const nodeId = `agent:tool:${iteration}:${index}`
    if (completed.has(nodeId))
      return { kind: "output", output: completed.get(nodeId) }
    const tool = definition.tools.find(
      (candidate) => candidate.name === call.name
    )
    if (!tool) throw new Error(`Agent requested undeclared tool: ${call.name}`)
    const request = requestSchema.parse(call.arguments)
    await this.checkpoints.assertOwnsLease(execution.id, leasedBy)
    const startedAt = new Date()
    const toolInput = { operation: tool.operation, ...request }
    let response: Awaited<ReturnType<ConnectorGatewayService["execute"]>>
    try {
      response = await this.gateway.execute({
        executionId: execution.id,
        workspaceId: execution.workspaceId,
        nodeId,
        connectionId: request.connectionId,
        operationId: tool.operation,
        operationInput: request.input,
        invocationIdempotencyKey: `${execution.id}:${nodeId}`,
        executionClaimId: leasedBy,
        signal,
      })
    } catch (error) {
      await this.recordFailure(context, {
        nodeId,
        nodeType: "connector",
        input: toolInput,
        startedAt,
        error,
      })
      throw error
    }
    if (response.outcome === "awaiting_consent")
      return this.pauseForApproval(context, nodeId)
    if (response.outcome === "rejected")
      throw new Error(await this.rejectionMessage(execution.id))
    const output = response.result
    completed.set(nodeId, output)
    await this.checkpoints.recordStep({
      executionId: execution.id,
      workspaceId: execution.workspaceId,
      leasedBy,
      nodeId,
      nodeType: "connector",
      input: toolInput,
      output,
      startedAt,
      endedAt: new Date(),
      completed,
      variables: {},
    })
    return { kind: "output", output }
  }

  /** Reports earlier completed external writes so a rejection is never mistaken for nothing having happened. */
  private async rejectionMessage(executionId: string): Promise<string> {
    const result = await repositories.execution.getExecutionWithSteps(
      db,
      executionId
    )
    const written = (result?.steps ?? []).filter((step) => {
      const operation = step.input?.operation
      return (
        step.status === "succeeded" &&
        typeof operation === "string" &&
        registeredSideEffectOperation(connectorOperationRegistry, operation) !==
          undefined
      )
    }).length
    const stopped = "Agent action was rejected; further Agent work stopped"
    if (written === 0) return `${stopped}. No external action was completed.`
    return `${stopped}. ${written} earlier external action${written === 1 ? " was" : "s were"} completed and kept.`
  }

  private async pauseForApproval(
    context: RunContext,
    nodeId: string
  ): Promise<ToolOutcome> {
    const { execution, leasedBy } = context
    const claim =
      await repositories.approvalRequest.claimPauseForPendingApprovalRequest(
        db,
        execution.workspaceId,
        execution.id,
        nodeId,
        leasedBy
      )
    if (claim.outcome === "lease-lost") throw new LeaseLostError(execution.id)
    return claim.outcome === "paused" ? { kind: "paused" } : { kind: "resume" }
  }
}
