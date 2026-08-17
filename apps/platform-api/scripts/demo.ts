import '@linea/config/env'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { db, pool, repositories } from '@linea/db'
import {
  assertNoReservedNodeIds,
  hashWorkflowGraph,
  validateGraphStructure,
  workflowGraphSchema,
  type WorkflowGraph,
} from '@linea/runtime'
import {
  createConnection,
  createWorkflowExecutionQueue,
  enqueueWorkflowExecution,
} from '@linea/queue'

const DEMO_ORG_SLUG = 'linea-demo'
const DEMO_ORG_NAME = 'Linea Demo'
const DEMO_WORKFLOW_SLUG = 'pending-todo-demo'
const DEMO_WORKFLOW_NAME = 'Pending To-Do Demo'
const GRAPH_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'examples',
  'pending-todo.workflow.json',
)
const POLL_INTERVAL_MS = 500
const POLL_TIMEOUT_MS = 60_000

// Cheapest model per provider, checked in the same order CONTRIBUTING.md lists the keys.
const MODEL_BY_ENV_KEY: [envKey: string, model: string][] = [
  ['ANTHROPIC_API_KEY', 'claude-haiku-4-5-20251001'],
  ['OPENAI_API_KEY', 'gpt-5-mini'],
  ['GROQ_API_KEY', 'openai/gpt-oss-20b'],
  ['XAI_API_KEY', 'grok-4.5'],
]

function resolveDemoModel(): string {
  for (const [envKey, model] of MODEL_BY_ENV_KEY) {
    if (process.env[envKey]) return model
  }
  throw new Error(
    'No AI provider key set. Set one of ANTHROPIC_API_KEY, OPENAI_API_KEY, ' +
      "GROQ_API_KEY, or XAI_API_KEY in .env — see CONTRIBUTING.md's environment " +
      'variable table.',
  )
}

function loadGraph(): WorkflowGraph {
  const raw: unknown = JSON.parse(readFileSync(GRAPH_PATH, 'utf-8'))
  const graph = workflowGraphSchema.parse(raw)
  validateGraphStructure(graph)
  assertNoReservedNodeIds(graph)

  const aiNode = graph.nodes.find((node) => node.type === 'ai')
  if (aiNode) {
    aiNode.config = { ...aiNode.config, model: resolveDemoModel() }
  }
  return graph
}

// Written to organizations.metadata on the demo org — nothing else in this codebase reads or writes that column, so unlike a name it can't coincidentally appear on an unrelated organization. Provenance, not just a label.
const DEMO_ORG_MARKER = 'created-by-linea-demo-script'

/** Atomic find-or-create (safe if two `pnpm demo` invocations race); a slug match alone isn't proof the row is ours, so only reuse it if it carries the marker this script stamps on creation, otherwise fail loudly rather than silently publishing into someone else's org. */
async function findOrCreateDemoOrg() {
  const org = await repositories.organization.findOrCreateOrganizationBySlug(
    db,
    {
      name: DEMO_ORG_NAME,
      slug: DEMO_ORG_SLUG,
      createdAt: new Date(),
      metadata: DEMO_ORG_MARKER,
    },
  )
  if (org.metadata !== DEMO_ORG_MARKER) {
    throw new Error(
      `An organization already exists at slug "${DEMO_ORG_SLUG}" that ` +
        "wasn't created by this script. Change DEMO_ORG_SLUG in demo.ts to " +
        'avoid colliding with it.',
    )
  }
  return org
}

// No separate provenance check needed — scoped to findOrCreateDemoOrg's already-verified org, which nothing outside this script touches, so there's no "unrelated workflow" to defend against.
async function findOrCreateDemoWorkflow(workspaceId: string) {
  return repositories.workflow.findOrCreateWorkflowBySlug(db, {
    workspaceId,
    name: DEMO_WORKFLOW_NAME,
    slug: DEMO_WORKFLOW_SLUG,
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function pollUntilTerminal(executionId: string) {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    const result = await repositories.execution.getExecutionWithSteps(
      db,
      executionId,
    )
    if (!result) throw new Error(`Execution ${executionId} disappeared`)
    if (
      result.execution.status === 'succeeded' ||
      result.execution.status === 'failed' ||
      result.execution.status === 'cancelled'
    ) {
      return result
    }
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error(
    `Execution ${executionId} did not reach a terminal status within ` +
      `${POLL_TIMEOUT_MS}ms. Is "pnpm dev" running (execution-worker needs to be ` +
      'up to pick this off the queue)?',
  )
}

function formatCost(costMicros: bigint): string {
  return (Number(costMicros) / 1_000_000).toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
  })
}

function printSummary(
  execution: { status: string; costMicros: bigint },
  steps: {
    name: string
    status: string
    startedAt: Date
    endedAt: Date | null
  }[],
) {
  console.log(`\nExecution ${execution.status}\n`)
  for (const step of steps) {
    const ms = step.endedAt
      ? step.endedAt.getTime() - step.startedAt.getTime()
      : null
    console.log(
      `  ${step.name.padEnd(24)} ${step.status.padEnd(10)} ${ms !== null ? `${ms}ms` : '—'}`,
    )
  }
  console.log(
    `\nTotal cost: ${formatCost(execution.costMicros)} ` +
      '(reads as $0.00 — no per-token pricing table exists yet, see packages/ai/MODULE.md ' +
      '— even though a real, billed API call was made)',
  )
}

async function main() {
  const graph = loadGraph()
  const org = await findOrCreateDemoOrg()
  const workflow = await findOrCreateDemoWorkflow(org.id)
  await repositories.workflow.ensurePublishedVersion(db, workflow.id, {
    graph,
    contentHash: hashWorkflowGraph(graph),
  })

  const trigger = await repositories.execution.triggerWorkflowExecution(
    db,
    org.id,
    { by: 'id', value: workflow.id },
    { trigger: 'manual' },
  )
  if (trigger.outcome !== 'created') {
    throw new Error(`Could not trigger execution: ${trigger.outcome}`)
  }

  const connection = createConnection()
  const queue = createWorkflowExecutionQueue(connection)
  try {
    await enqueueWorkflowExecution(queue, {
      executionId: trigger.execution.id,
    })
    console.log(`Triggered execution ${trigger.execution.id}, waiting...`)

    const { execution, steps } = await pollUntilTerminal(trigger.execution.id)
    printSummary(execution, steps)
    if (execution.status !== 'succeeded') {
      throw new Error(`Execution ended with status "${execution.status}"`)
    }
  } finally {
    await queue.close()
    await connection.quit()
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
