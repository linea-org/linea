import { Injectable, Logger } from "@nestjs/common"
import { calculateCostMicros } from "@linea/ai"
import {
  db,
  repositories,
  type RegressionCase,
  type RegressionRun,
} from "@linea/db"
import { jsonValueSchema } from "@linea/protocol/shared"
import { workflowGraphSchema, type WorkflowGraph } from "@linea/runtime"
import { InterpreterService } from "../graph/interpreter.service"
import { resolveNodeModel } from "../graph/resolve-node-model"
import { AiNode } from "../graph/nodes/ai.node"
import { getErrorTokenUsage } from "../graph/nodes/usage-error"
import { gradeOutput } from "./regression-grading"

type CaseOutcome = {
  status: "passed" | "failed" | "errored"
  output: unknown
  score: number | null
  costMicros: bigint
}

type ConversationInput = {
  turns: { role: "user" | "assistant"; content: string }[]
  finalPrompt: string
  externalSubjectId?: string
}

@Injectable()
export class RegressionExecutionService {
  private readonly logger = new Logger(RegressionExecutionService.name)

  constructor(
    private readonly interpreter: InterpreterService,
    private readonly aiNode: AiNode
  ) {}

  private async executeNodeCase(
    regressionCase: RegressionCase,
    graph: WorkflowGraph,
    workflowVersionId: string
  ): Promise<CaseOutcome> {
    const node = graph.nodes.find((n) => n.id === regressionCase.nodeId)
    if (!node) {
      return {
        status: "errored",
        output: {
          message: `Node "${regressionCase.nodeId}" not found in this workflow version`,
        },
        score: null,
        costMicros: 0n,
      }
    }
    const input =
      (regressionCase.input as { nodeInput?: unknown }).nodeInput ?? {}
    let result: Awaited<ReturnType<InterpreterService["executeNode"]>>
    try {
      result = await this.interpreter.executeNode(
        node,
        input,
        regressionCase.workspaceId,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        workflowVersionId
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const usage = getErrorTokenUsage(error)
      const model = resolveNodeModel(node)
      const costMicros =
        usage && model
          ? (calculateCostMicros(
              model,
              usage.tokensInput,
              usage.tokensOutput
            ) ?? 0n)
          : 0n
      return {
        status: "errored",
        output: { error: message },
        score: null,
        costMicros,
      }
    }
    const model = resolveNodeModel(node)
    const runCostMicros =
      model !== undefined &&
      result.tokensInput !== undefined &&
      result.tokensOutput !== undefined
        ? (calculateCostMicros(
            model,
            result.tokensInput,
            result.tokensOutput
          ) ?? 0n)
        : 0n
    const graded = await gradeOutput(
      regressionCase.workspaceId,
      result.output,
      regressionCase.assertions
    )
    return {
      status: graded.status,
      output: result.output,
      score: graded.score,
      costMicros: runCostMicros + graded.costMicros,
    }
  }

  private async executeConversationCase(
    regressionCase: RegressionCase,
    graph: WorkflowGraph
  ): Promise<CaseOutcome> {
    // A conversation snapshot cannot choose unambiguously between multiple Agent nodes.
    const agentNodes = graph.nodes.filter((n) => n.type === "ai")
    if (agentNodes.length !== 1) {
      return {
        status: "errored",
        output: {
          message:
            agentNodes.length === 0
              ? "No Agent node in this workflow version"
              : "Multiple Agent nodes — conversation-level regression cases need exactly one to be unambiguous",
        },
        score: null,
        costMicros: 0n,
      }
    }
    const node = agentNodes[0]
    const input = regressionCase.input as unknown as ConversationInput

    let text: string
    let tokensInput = 0
    let tokensOutput = 0
    try {
      const output = await this.aiNode.execute(
        node.config,
        {},
        {
          workspaceId: regressionCase.workspaceId,
          nodeId: node.id,
          regressionConversation: {
            turns: input.turns,
            finalPrompt: input.finalPrompt,
            externalSubjectId: input.externalSubjectId,
          },
        }
      )
      const parsed = output as {
        text: string
        tokensInput: number
        tokensOutput: number
      }
      text = parsed.text
      tokensInput = parsed.tokensInput
      tokensOutput = parsed.tokensOutput
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        status: "errored",
        output: { error: message },
        score: null,
        costMicros: 0n,
      }
    }

    // AiNode exposes only the final reply, so tool-calling intermediate turns cannot be reconstructed.
    const fullSequence = [
      ...input.turns,
      { role: "user" as const, content: input.finalPrompt },
      { role: "assistant" as const, content: text },
    ]
    const runCostMicros =
      calculateCostMicros(
        node.config.model as string,
        tokensInput,
        tokensOutput
      ) ?? 0n
    const graded = await gradeOutput(
      regressionCase.workspaceId,
      fullSequence,
      regressionCase.assertions
    )
    return {
      status: graded.status,
      output: fullSequence,
      score: graded.score,
      costMicros: runCostMicros + graded.costMicros,
    }
  }

  private executeCase(
    regressionCase: RegressionCase,
    graph: WorkflowGraph,
    workflowVersionId: string
  ): Promise<CaseOutcome> {
    return regressionCase.caseType === "node"
      ? this.executeNodeCase(regressionCase, graph, workflowVersionId)
      : this.executeConversationCase(regressionCase, graph)
  }

  /** Runs every active case against exactly one workflow version. */
  async runRegressionForVersion(
    workspaceId: string,
    workflowId: string,
    workflowVersionId: string,
    trigger: RegressionRun["trigger"]
  ): Promise<RegressionRun> {
    const version = await repositories.workflow.getWorkflowVersionById(
      db,
      workflowVersionId
    )
    if (!version) {
      throw new Error(`Workflow version ${workflowVersionId} not found`)
    }
    const graph = workflowGraphSchema.parse(version.graph)
    const cases = await repositories.regressionCase.listRegressionCases(
      db,
      workspaceId,
      workflowId
    )

    const run = await repositories.regressionRun.createRegressionRun(db, {
      workspaceId,
      workflowId,
      workflowVersionId,
      trigger,
    })

    let passed = 0
    let failed = 0
    let totalCostMicros = 0n
    const results: repositories.regressionRun.NewRegressionResultInput[] = []
    for (const regressionCase of cases) {
      let outcome: CaseOutcome
      try {
        outcome = await this.executeCase(
          regressionCase,
          graph,
          workflowVersionId
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.logger.error(
          `Regression case ${regressionCase.id} threw outside its own error handling: ${message}`
        )
        outcome = {
          status: "errored",
          output: { error: message },
          score: null,
          costMicros: 0n,
        }
      }
      // Run summaries count errors as failures while results retain the finer status.
      if (outcome.status === "passed") passed++
      else failed++
      totalCostMicros += outcome.costMicros
      results.push({
        caseId: regressionCase.id,
        status: outcome.status,
        score: outcome.score,
        output: jsonValueSchema.parse(outcome.output),
        costMicros: outcome.costMicros,
      })
    }

    await repositories.regressionRun.insertRegressionResults(
      db,
      run.id,
      workspaceId,
      results
    )
    return (
      (await repositories.regressionRun.completeRegressionRun(
        db,
        workspaceId,
        run.id,
        {
          passed,
          failed,
          total: cases.length,
          costMicros: totalCostMicros,
        }
      )) ?? run
    )
  }
}
