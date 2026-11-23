import { setTimeout as sleep } from "node:timers/promises"
import { Injectable, Logger } from "@nestjs/common"
import {
  calculateCostMicros,
  executionBudgetMessage,
  MAX_EXECUTION_TOKENS,
  PlatformKeyBudgetError,
  resolveProviderId,
} from "@linealabs/ai"
import {
  MAX_RETRY_DELAY_MS,
  MAX_NODE_ATTEMPT_MS,
  retryPolicySchema,
  startWalk,
  type RetryPolicy,
  type StepResult,
  type StepToExecute,
  type WalkResult,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowWalk,
} from "@linealabs/runtime"
import {
  CheckpointsService,
  LeaseLostError,
  PauseExecutionError,
} from "../checkpoints/checkpoints.service"
import { AiNode } from "./nodes/ai.node"
import { ApprovalNode } from "./nodes/approval.node"
import { BranchNode } from "./nodes/branch.node"
import { AgentNode } from "./nodes/agent.node"
import { ConnectorNode } from "./nodes/connector.node"
import { DatetimeNode } from "./nodes/datetime.node"
import { EndNode } from "./nodes/end.node"
import { EvaluatorNode } from "./nodes/evaluator.node"
import { ExtractNode } from "./nodes/extract.node"
import { FilterNode } from "./nodes/filter.node"
import { HttpNode } from "./nodes/http.node"
import { MemoryNode } from "./nodes/memory.node"
import { MergeNode } from "./nodes/merge.node"
import type {
  NodeExecutionContext,
  NodeHandler,
} from "./nodes/node-handler.interface"
import { NonRetryableError } from "./nodes/non-retryable-error"
import { getErrorTokenUsage } from "./nodes/usage-error"
import { StartNode } from "./nodes/start.node"
import { TransformNode } from "./nodes/transform.node"
import { VariablesNode } from "./nodes/variables.node"
import { WaitNode } from "./nodes/wait.node"
import { resolveNodeModel } from "./resolve-node-model"
import { diagnosticDispatch } from "./diagnostic-dispatch"
import { runReadySteps } from "./run-ready-steps"

function computeBackoffDelayMs(
  backoff: RetryPolicy["backoff"],
  attemptsMade: number
): number {
  return Math.min(
    MAX_RETRY_DELAY_MS,
    backoff.type === "fixed"
      ? backoff.delayMs
      : backoff.delayMs * 2 ** (attemptsMade - 1)
  )
}

function parseRetryPolicy(raw: unknown): RetryPolicy | undefined {
  if (raw === undefined || raw === null) return undefined
  return retryPolicySchema.parse(raw)
}

// Must not abort input.signal — the outer catch treats that abort as lease loss.
function withAttemptTimeout(
  leaseSignal: AbortSignal | undefined,
  timeoutMs: number | undefined
): AbortSignal | undefined {
  const timeoutSignal = AbortSignal.timeout(
    Math.min(timeoutMs ?? MAX_NODE_ATTEMPT_MS, MAX_NODE_ATTEMPT_MS)
  )
  return leaseSignal
    ? AbortSignal.any([leaseSignal, timeoutSignal])
    : timeoutSignal
}

export type RunInput = {
  executionId: string
  workspaceId: string
  environmentId?: string
  externalSubjectRecordId?: string
  // Optional so replay/tests without a conversation don't have to supply it.
  workflowId?: string
  workflowVersionId?: string
  leasedBy: string
  graph: WorkflowGraph
  triggerPayload: unknown
  // Set by RunsService from the execution row, never read out of triggerPayload here.
  conversationId?: string
  chatMessageId?: string
  resumeFrom: Map<string, unknown>
  // Usage already recorded for steps in `resumeFrom`, since they're skipped rather than re-executed.
  initialTokensInput?: number
  initialTokensOutput?: number
  initialCostMicros?: bigint
  initialCostUnpriced?: boolean | null
  // Aborted by the caller (RunsService) when the execution lease is lost mid-step, so the in-flight node handler's own request is cancelled instead of just racing the checkpoint.
  signal?: AbortSignal
  // Seeded from the latest checkpoint's variables on resume — empty for a fresh execution.
  initialVariables?: Record<string, unknown>
  maxParallelSteps?: number
}

export type RunOutcome = {
  // Absent (undefined) `result` only when `pausedAt` is set — the walk was abandoned mid-node, not completed or failed.
  result?: WalkResult
  // Set when a node handler threw PauseExecutionError — the run stopped short pending external input, distinct from completing or failing.
  pausedAt?: string
  totalTokensInput: number
  totalTokensOutput: number
  totalCostMicros: bigint
  // true: some step unpriced. null: some step predates tracking. false: all priced.
  costUnpriced: boolean | null
  // Every completed node's output, in execution order — lets callers (e.g. chat-preview's assistant-message persistence) find "the last AI node's reply" without a second DB round trip.
  completed: Map<string, unknown>
}

type RunState = {
  walk: WorkflowWalk
  signal: AbortSignal
  // Set once this attempt no longer owns the run, which also aborts every running step.
  leaseLost: () => boolean
  loseLease: () => void
  // Queues checkpoint writes: each must contain every step recorded before it, or a resume from
  // the latest one would repeat a finished step.
  record: (write: () => Promise<void>) => Promise<void>
  completed: Map<string, unknown>
  variables: Record<string, unknown>
  tokensInput: number
  tokensOutput: number
  costMicros: bigint
  costUnpriced: boolean | null
  // Tokens used so far by each running step, which the totals above don't include yet.
  runningTokens: Map<string, number>
  // Set before the failure is saved, so nothing starts while it waits behind other writes.
  failed: boolean
  pausedAt?: string
}

function startRunState(input: RunInput): RunState {
  const deadline = AbortSignal.timeout(30 * 60_000)
  const lost = new AbortController()
  let lastWrite: Promise<void> = Promise.resolve()
  return {
    walk: startWalk(input.graph, {
      completed: input.resumeFrom,
      triggerPayload: input.triggerPayload,
    }),
    signal: AbortSignal.any([
      deadline,
      lost.signal,
      ...(input.signal ? [input.signal] : []),
    ]),
    leaseLost: () => input.signal?.aborted === true || lost.signal.aborted,
    loseLease: () => lost.abort(),
    record: (write) => {
      const result = lastWrite.then(write)
      lastWrite = result.catch(() => undefined)
      return result
    },
    completed: new Map(input.resumeFrom),
    variables: input.initialVariables ?? {},
    tokensInput: input.initialTokensInput ?? 0,
    tokensOutput: input.initialTokensOutput ?? 0,
    costMicros: input.initialCostMicros ?? 0n,
    // ?? would collapse an explicit null (unknown) into false; only an absent field defaults.
    costUnpriced:
      input.initialCostUnpriced === undefined
        ? false
        : input.initialCostUnpriced,
    runningTokens: new Map(),
    failed: false,
  }
}

type StepRun = {
  node: WorkflowNode
  step: StepToExecute
  model: string | undefined
  provider: string | undefined
  startedAt: Date
  attempts: number
}

function endStep(input: RunInput, run: StepRun) {
  return {
    executionId: input.executionId,
    workspaceId: input.workspaceId,
    leasedBy: input.leasedBy,
    nodeId: run.step.nodeId,
    nodeType: run.step.nodeType,
    input: run.step.input,
    startedAt: run.startedAt,
    endedAt: new Date(),
    model: run.model,
    provider: run.provider,
    retryAttempts: run.attempts > 1 ? run.attempts : undefined,
  }
}

/** Applies only the step's own entries, so it can't drop what another branch set meanwhile. */
function setVariables(state: RunState, node: WorkflowNode): void {
  if (node.type !== "variables" || node.config.operation !== "set") return
  const { entries } = node.config
  if (entries === null || typeof entries !== "object") return
  state.variables = { ...state.variables, ...entries }
}

function spentTokens(state: RunState): number {
  let spent = state.tokensInput + state.tokensOutput
  for (const tokens of state.runningTokens.values()) spent += tokens
  return spent
}

function overBudget(state: RunState): boolean {
  return spentTokens(state) >= MAX_EXECUTION_TOKENS
}

function chargeStep(
  state: RunState,
  nodeId: string,
  model: string | undefined,
  tokensInput: number,
  tokensOutput: number
): { costMicros?: bigint; costUnpriced?: boolean } {
  state.runningTokens.delete(nodeId)
  state.tokensInput += tokensInput
  state.tokensOutput += tokensOutput
  if (!model) return {}
  const costMicros = calculateCostMicros(model, tokensInput, tokensOutput)
  if (costMicros !== undefined) state.costMicros += costMicros
  const costUnpriced = costMicros === undefined
  state.costUnpriced = mergeCostUnpriced(state.costUnpriced, costUnpriced)
  return { costMicros, costUnpriced }
}

/** true beats null beats false. */
function mergeCostUnpriced(
  a: boolean | null,
  b: boolean | null
): boolean | null {
  if (a === true || b === true) return true
  if (a === null || b === null) return null
  return false
}

function extractTokenUsage(
  output: unknown
): { tokensInput: number; tokensOutput: number } | undefined {
  if (
    output !== null &&
    typeof output === "object" &&
    typeof (output as Record<string, unknown>).tokensInput === "number" &&
    typeof (output as Record<string, unknown>).tokensOutput === "number"
  ) {
    const usage = output as { tokensInput: number; tokensOutput: number }
    return { tokensInput: usage.tokensInput, tokensOutput: usage.tokensOutput }
  }
  return undefined
}

@Injectable()
export class InterpreterService {
  private readonly logger = new Logger(InterpreterService.name)
  private readonly handlers: Record<string, NodeHandler>

  constructor(
    private readonly checkpoints: CheckpointsService,
    httpNode: HttpNode,
    transformNode: TransformNode,
    branchNode: BranchNode,
    aiNode: AiNode,
    approvalNode: ApprovalNode,
    memoryNode: MemoryNode,
    waitNode: WaitNode,
    datetimeNode: DatetimeNode,
    filterNode: FilterNode,
    mergeNode: MergeNode,
    variablesNode: VariablesNode,
    connectorNode: ConnectorNode = new ConnectorNode(),
    agentNode: AgentNode = new AgentNode()
  ) {
    this.handlers = {
      http: httpNode,
      transform: transformNode,
      branch: branchNode,
      ai: aiNode,
      extract: new ExtractNode(),
      evaluator: new EvaluatorNode(),
      approval: approvalNode,
      memory: memoryNode,
      wait: waitNode,
      datetime: datetimeNode,
      filter: filterNode,
      merge: mergeNode,
      variables: variablesNode,
      start: new StartNode(),
      end: new EndNode(),
    }
    this.handlers.connector = connectorNode
    this.handlers.agent = agentNode
  }

  /** The reusable "run one node" unit, independent of the walker/checkpoints/leases — `run()` uses it per graph step, and step-level replay (apps/execution-worker/src/replay) calls it directly for one node with a substituted config, bypassing the walker since a replay target's input is already known. */
  async executeNode(
    node: WorkflowNode,
    input: unknown,
    workspaceId: string,
    idempotencyKey?: string,
    signal?: AbortSignal,
    executionId?: string,
    conversationId?: string,
    workflowId?: string,
    chatMessageId?: string,
    leasedBy?: string,
    variables?: Record<string, unknown>,
    workflowVersionId?: string,
    environmentId?: string,
    externalSubjectRecordId?: string,
    countTokens?: NodeExecutionContext["countTokens"]
  ): Promise<{
    output: unknown
    tokensInput?: number
    tokensOutput?: number
  }> {
    const handler = this.handlers[node.type]
    if (!handler) {
      throw new Error(`No handler for node type "${node.type}"`)
    }
    const output = await handler.execute(node.config, input, {
      workspaceId,
      environmentId,
      externalSubjectRecordId,
      idempotencyKey,
      signal,
      executionId,
      nodeId: node.id,
      conversationId,
      workflowId,
      workflowVersionId,
      chatMessageId,
      leasedBy,
      variables,
      countTokens,
    })
    const usage = extractTokenUsage(output)
    return {
      output,
      tokensInput: usage?.tokensInput,
      tokensOutput: usage?.tokensOutput,
    }
  }

  /** Runs one node for a Replay or Regression run: refused node types never reach their handler, and the rest run with `diagnostic` set so they refuse external writes. */
  async executeDiagnosticNode(
    node: WorkflowNode,
    input: unknown,
    context: Omit<NodeExecutionContext, "nodeId" | "diagnostic">
  ): Promise<{
    output: unknown
    tokensInput?: number
    tokensOutput?: number
  }> {
    if (diagnosticDispatch[node.type] === "refused") {
      throw new NonRetryableError(
        `${node.type} nodes don't run in Replay or Regression runs: they would repeat the original action, and no recorded result is available to substitute`
      )
    }
    const handler = this.handlers[node.type]
    if (!handler) {
      throw new Error(`No handler for node type "${node.type}"`)
    }
    const output = await handler.execute(node.config, input, {
      ...context,
      nodeId: node.id,
      diagnostic: true,
    })
    const usage = extractTokenUsage(output)
    return {
      output,
      tokensInput: usage?.tokensInput,
      tokensOutput: usage?.tokensOutput,
    }
  }

  async run(input: RunInput): Promise<RunOutcome> {
    const state = startRunState(input)
    await runReadySteps(
      state.walk,
      input.maxParallelSteps ?? 1,
      (step) => this.runStep(input, state, step),
      () => state.pausedAt !== undefined || state.failed
    )
    return {
      ...(state.pausedAt === undefined
        ? { result: state.walk.result() }
        : { pausedAt: state.pausedAt }),
      totalTokensInput: state.tokensInput,
      totalTokensOutput: state.tokensOutput,
      totalCostMicros: state.costMicros,
      costUnpriced: state.costUnpriced,
      completed: state.completed,
    }
  }

  private async runStep(
    input: RunInput,
    state: RunState,
    step: StepToExecute
  ): Promise<void> {
    const node = input.graph.nodes.find((n) => n.id === step.nodeId)
    if (!node) {
      throw new Error(`Node "${step.nodeId}" not found in graph`)
    }
    const model = resolveNodeModel(node)
    const run: StepRun = {
      node,
      step,
      model,
      provider: model ? resolveProviderId(model) : undefined,
      startedAt: new Date(),
      attempts: 0,
    }
    let result: StepResult | undefined
    try {
      result = await this.completeStep(input, state, run)
    } catch (error) {
      result = await this.failStep(input, state, run, error)
    } finally {
      state.runningTokens.delete(step.nodeId)
    }
    if (result) state.walk.finish(result)
  }

  private async completeStep(
    input: RunInput,
    state: RunState,
    run: StepRun
  ): Promise<StepResult> {
    const { node, step, model } = run
    const { output, tokensInput, tokensOutput } = await this.attemptNode(
      input,
      state,
      run
    )
    const ended = endStep(input, run)
    // Charged before waiting to save, so steps beside this one see the tokens at once.
    const charged =
      tokensInput !== undefined && tokensOutput !== undefined
        ? chargeStep(state, step.nodeId, model, tokensInput, tokensOutput)
        : {}
    await state.record(async () => {
      // Before the write, so the checkpoint includes this step and a resume doesn't replay it.
      state.completed.set(step.nodeId, output)
      setVariables(state, node)
      await this.checkpoints.recordStep({
        ...ended,
        ...charged,
        output,
        tokensInput,
        tokensOutput,
        completed: state.completed,
        variables: state.variables,
      })
    })
    return { nodeId: step.nodeId, output }
  }

  /** Returns nothing when the step paused; throws when this attempt no longer owns the run. */
  private async failStep(
    input: RunInput,
    state: RunState,
    run: StepRun,
    error: unknown
  ): Promise<StepResult | undefined> {
    const { step, model } = run
    // A failure-checkpoint write would be rejected too — propagate instead of attempting it.
    if (error instanceof LeaseLostError) {
      state.loseLease()
      throw error
    }
    // An abort here is a lease loss discovered mid-call, not a genuine node failure.
    if (state.leaseLost()) {
      throw new LeaseLostError(input.executionId)
    }
    // No checkpoint write here: the latest one is already what a later resume should start from.
    if (error instanceof PauseExecutionError) {
      state.pausedAt = error.nodeId
      return undefined
    }
    const message = error instanceof Error ? error.message : String(error)
    // Stacks stay in server logs; step records are returned to workspace members and API keys.
    this.logger.error(
      `Execution ${input.executionId} node ${step.nodeId} failed: ${message}`,
      error instanceof Error ? error.stack : undefined
    )
    state.failed = true
    const usage = getErrorTokenUsage(error)
    const ended = endStep(input, run)
    const charged =
      usage && model
        ? chargeStep(
            state,
            step.nodeId,
            model,
            usage.tokensInput,
            usage.tokensOutput
          )
        : {}
    await state.record(() =>
      this.checkpoints.recordStep({
        ...ended,
        ...charged,
        error: { message },
        tokensInput: usage?.tokensInput,
        tokensOutput: usage?.tokensOutput,
        completed: state.completed,
        variables: state.variables,
      })
    )
    return { nodeId: step.nodeId, error: { message } }
  }

  private async attemptNode(
    input: RunInput,
    state: RunState,
    run: StepRun
  ): ReturnType<InterpreterService["executeNode"]> {
    const { node, step } = run
    const retryPolicy = parseRetryPolicy(node.config.retryPolicy)
    state.signal.throwIfAborted()
    if (overBudget(state)) {
      throw new NonRetryableError(executionBudgetMessage(spentTokens(state)))
    }
    await this.checkpoints.assertOwnsLease(input.executionId, input.leasedBy)
    run.attempts += 1
    try {
      return await this.executeNode(
        node,
        step.input,
        input.workspaceId,
        `${input.executionId}:${step.nodeId}`,
        withAttemptTimeout(state.signal, retryPolicy?.timeoutMs),
        input.executionId,
        input.conversationId,
        input.workflowId,
        input.chatMessageId,
        input.leasedBy,
        state.variables,
        input.workflowVersionId,
        input.environmentId,
        input.externalSubjectRecordId,
        (tokens) => {
          state.runningTokens.set(step.nodeId, tokens)
          return spentTokens(state)
        }
      )
    } catch (attemptError) {
      const isFinal =
        attemptError instanceof NonRetryableError ||
        attemptError instanceof PlatformKeyBudgetError ||
        run.attempts >= (retryPolicy?.maxAttempts ?? 1)
      // Don't spend retry budget on a call that was never ours, or on a run that has failed.
      if (isFinal || state.signal.aborted || state.failed) throw attemptError
      await this.waitToRetry(input, state, retryPolicy, run.attempts)
      // Another branch can fail or spend the budget meanwhile; this error carries the step's usage.
      if (state.failed || overBudget(state)) throw attemptError
    }
    return this.attemptNode(input, state, run)
  }

  private async waitToRetry(
    input: RunInput,
    state: RunState,
    retryPolicy: RetryPolicy | undefined,
    attemptsMade: number
  ): Promise<void> {
    // Recheck before sleep — a retry can outlive the lease that covered attempt 1.
    await this.checkpoints.assertOwnsLease(input.executionId, input.leasedBy)
    if (!retryPolicy) return
    await sleep(
      computeBackoffDelayMs(retryPolicy.backoff, attemptsMade),
      undefined,
      { signal: state.signal }
    )
  }
}
