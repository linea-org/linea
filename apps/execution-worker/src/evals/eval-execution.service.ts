import { Injectable, Logger } from "@nestjs/common"
import { calculateCostMicros } from "@linea/ai"
import { db, repositories, type EvalCase, type EvalRun } from "@linea/db"
import { workflowGraphSchema, type WorkflowGraph } from "@linea/runtime"
import { InterpreterService } from "../graph/interpreter.service"
import { AiNode } from "../graph/nodes/ai.node"
import { gradeOutput } from "./eval-grading"

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
export class EvalExecutionService {
  private readonly logger = new Logger(EvalExecutionService.name)

  constructor(
    private readonly interpreter: InterpreterService,
    private readonly aiNode: AiNode
  ) {}

  private async executeNodeCase(
    evalCase: EvalCase,
    graph: WorkflowGraph
  ): Promise<CaseOutcome> {
    const node = graph.nodes.find((n) => n.id === evalCase.nodeId)
    if (!node) {
      return {
        status: "errored",
        output: {
          message: `Node "${evalCase.nodeId}" not found in this workflow version`,
        },
        score: null,
        costMicros: 0n,
      }
    }
    const input = (evalCase.input as { nodeInput?: unknown }).nodeInput ?? {}
    let result: Awaited<ReturnType<InterpreterService["executeNode"]>>
    try {
      result = await this.interpreter.executeNode(
        node,
        input,
        evalCase.workspaceId
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        status: "errored",
        output: { error: message },
        score: null,
        costMicros: 0n,
      }
    }
    const runCostMicros =
      node.type === "ai" &&
      result.tokensInput !== undefined &&
      result.tokensOutput !== undefined
        ? (calculateCostMicros(
            node.config.model as string,
            result.tokensInput,
            result.tokensOutput
          ) ?? 0n)
        : 0n
    const graded = await gradeOutput(
      evalCase.workspaceId,
      result.output,
      evalCase.assertions
    )
    return {
      status: graded.status,
      output: result.output,
      score: graded.score,
      costMicros: runCostMicros + graded.costMicros,
    }
  }

  private async executeConversationCase(
    evalCase: EvalCase,
    graph: WorkflowGraph
  ): Promise<CaseOutcome> {
    // The conversation-level replay path is always the Agent node's chat-mode logic (see
    // evalConversation on NodeExecutionContext) — a graph with zero or multiple Agent nodes has
    // no unambiguous target to replay this case's snapshot through.
    const agentNodes = graph.nodes.filter((n) => n.type === "ai")
    if (agentNodes.length !== 1) {
      return {
        status: "errored",
        output: {
          message:
            agentNodes.length === 0
              ? "No Agent node in this workflow version"
              : "Multiple Agent nodes — conversation-level eval cases need exactly one to be unambiguous",
        },
        score: null,
        costMicros: 0n,
      }
    }
    const node = agentNodes[0]
    const input = evalCase.input as unknown as ConversationInput

    let text: string
    let tokensInput = 0
    let tokensOutput = 0
    try {
      const output = await this.aiNode.execute(
        node.config,
        {},
        {
          workspaceId: evalCase.workspaceId,
          nodeId: node.id,
          evalConversation: {
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

    // Reconstructed from what was sent plus what came back, not AiNode's own internal state —
    // AiNode's public return contract is just {text, tokensInput, tokensOutput}, so a multi-step
    // tool-calling run's intermediate turns aren't visible here, only the final reply. Still an
    // honest record of what was actually tested.
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
      evalCase.workspaceId,
      fullSequence,
      evalCase.assertions
    )
    return {
      status: graded.status,
      output: fullSequence,
      score: graded.score,
      costMicros: runCostMicros + graded.costMicros,
    }
  }

  private executeCase(
    evalCase: EvalCase,
    graph: WorkflowGraph
  ): Promise<CaseOutcome> {
    return evalCase.caseType === "node"
      ? this.executeNodeCase(evalCase, graph)
      : this.executeConversationCase(evalCase, graph)
  }

  /** Runs every active eval case for a workflow against one specific version — publish (warn,
   * never block) and manual re-runs both go through this, differing only in `trigger`. */
  async runEvalsForVersion(
    workspaceId: string,
    workflowId: string,
    workflowVersionId: string,
    trigger: EvalRun["trigger"]
  ): Promise<EvalRun> {
    const version = await repositories.workflow.getWorkflowVersionById(
      db,
      workflowVersionId
    )
    if (!version) {
      throw new Error(`Workflow version ${workflowVersionId} not found`)
    }
    const graph = workflowGraphSchema.parse(version.graph)
    const cases = await repositories.evalCase.listEvalCases(
      db,
      workspaceId,
      workflowId
    )

    const run = await repositories.evalRun.createEvalRun(db, {
      workspaceId,
      workflowId,
      workflowVersionId,
      trigger,
    })

    let passed = 0
    let failed = 0
    let totalCostMicros = 0n
    const results: repositories.evalRun.NewEvalResultInput[] = []
    for (const evalCase of cases) {
      let outcome: CaseOutcome
      try {
        outcome = await this.executeCase(evalCase, graph)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.logger.error(
          `Eval case ${evalCase.id} threw outside its own error handling: ${message}`
        )
        outcome = {
          status: "errored",
          output: { error: message },
          score: null,
          costMicros: 0n,
        }
      }
      // errored counts toward failed for the run's own summary counters — eval_results keeps
      // the finer-grained distinction per case, but "did this run reveal a problem" only needs
      // pass/fail at the run level.
      if (outcome.status === "passed") passed++
      else failed++
      totalCostMicros += outcome.costMicros
      results.push({
        caseId: evalCase.id,
        status: outcome.status,
        score: outcome.score,
        output: outcome.output as Record<string, unknown> | unknown[],
        costMicros: outcome.costMicros,
      })
    }

    await repositories.evalRun.insertEvalResults(
      db,
      run.id,
      workspaceId,
      results
    )
    return (
      (await repositories.evalRun.completeEvalRun(db, workspaceId, run.id, {
        passed,
        failed,
        total: cases.length,
        costMicros: totalCostMicros,
      })) ?? run
    )
  }
}
