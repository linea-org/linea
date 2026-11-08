import { Injectable } from "@nestjs/common"
import { db, repositories, type Execution } from "@linea/db"
import { agentDefinitionSchema } from "@linea/runtime"
import {
  calculateCostMicros,
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
import Ajv2020 from "ajv/dist/2020"
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
const validator = new Ajv2020({ strict: true, addUsedSchema: false })

@Injectable()
export class AgentExecutionService {
  constructor(
    private readonly checkpoints: CheckpointsService,
    private readonly gateway: ConnectorGatewayService
  ) {}

  async run(
    execution: Execution,
    leasedBy: string,
    signal: AbortSignal
  ): Promise<void> {
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
    const registeredTools = new Map(
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
    const conversation: ConversationTurn[] = [
      { role: "user", content: JSON.stringify(execution.triggerPayload) },
    ]
    for (
      let iteration = 0;
      iteration < definition.maxIterations;
      iteration += 1
    ) {
      const modelNodeId = `agent:model:${iteration}`
      let result: z.infer<typeof completionSchema>
      if (completed.has(modelNodeId)) {
        result = completionSchema.parse(completed.get(modelNodeId))
      } else {
        await this.checkpoints.assertOwnsLease(execution.id, leasedBy)
        const { apiKey } = await resolveApiKey(
          db,
          execution.environmentId ?? undefined,
          resolveKeyName(definition.model)
        )
        const startedAt = new Date()
        result = completionSchema.parse(
          await resolveProvider(definition.model).complete(apiKey, {
            model: definition.model,
            systemPrompt: `${definition.instructions}\nReturn a final JSON value satisfying this output schema: ${JSON.stringify(contract.outputSchema)}`,
            history: [...conversation],
            tools,
            signal,
          })
        )
        for (const call of result.toolCalls ?? []) {
          const operation = registeredTools.get(call.name)
          if (!operation)
            throw new Error(`Agent requested undeclared tool: ${call.name}`)
          operation.inputSchema.parse(requestSchema.parse(call.arguments).input)
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
      }
      if (!result.toolCalls?.length) {
        const output: unknown = JSON.parse(result.text)
        if (!validator.compile(contract.outputSchema)(output))
          throw new Error("Agent output failed pinned Contract validation")
        const totals = await this.checkpoints.getResumeTokenTotals(execution.id)
        await repositories.execution.completeExecution(
          db,
          execution.id,
          leasedBy,
          { status: "succeeded", output, ...totals }
        )
        return
      }
      conversation.push({ role: "assistant", toolCalls: result.toolCalls })
      for (const [index, call] of result.toolCalls.entries()) {
        const nodeId = `agent:tool:${iteration}:${index}`
        let output = completed.get(nodeId)
        if (!completed.has(nodeId)) {
          const tool = definition.tools.find((tool) => tool.name === call.name)
          if (!tool)
            throw new Error(`Agent requested undeclared tool: ${call.name}`)
          const request = requestSchema.parse(call.arguments)
          await this.checkpoints.assertOwnsLease(execution.id, leasedBy)
          const startedAt = new Date()
          const response = await this.gateway.execute({
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
          if (response.outcome === "awaiting_consent") {
            const claim =
              await repositories.approvalRequest.claimPauseForPendingApprovalRequest(
                db,
                execution.workspaceId,
                execution.id,
                nodeId,
                leasedBy
              )
            if (claim.outcome === "lease-lost")
              throw new LeaseLostError(execution.id)
            if (claim.outcome === "paused") return
            return this.run(execution, leasedBy, signal)
          }
          if (response.outcome === "rejected")
            throw new Error(
              "Agent action was rejected; further Agent work stopped"
            )
          output = response.result
          completed.set(nodeId, output)
          await this.checkpoints.recordStep({
            executionId: execution.id,
            workspaceId: execution.workspaceId,
            leasedBy,
            nodeId,
            nodeType: "connector",
            input: { operation: tool.operation, ...request },
            output,
            startedAt,
            endedAt: new Date(),
            completed,
            variables: {},
          })
        }
        conversation.push({
          role: "tool",
          toolCallId: call.id,
          content: JSON.stringify(output),
        })
      }
    }
    throw new Error(
      `Agent exceeded maxIterations (${definition.maxIterations})`
    )
  }
}
