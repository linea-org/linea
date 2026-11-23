import type {
  StepToExecute,
  WorkflowNode,
  WorkflowWalk,
} from "@linealabs/runtime"
import { needsConsent } from "./needs-consent"

export const MAX_PARALLEL_STEPS = 5
export const RETRY_PARKED_MS = 10_000

type ReadySteps = {
  walk: WorkflowWalk
  limit: number
  runStep: (step: StepToExecute) => Promise<"finished" | "parked">
  isStopped: () => boolean
  // A step that already asked for a decision before this pass; no other may ask before it.
  consentHeldBy?: string
}

/** Waits for every running step, then returns the parked ones or throws the first error; see ADR 0031. */
export async function runReadySteps(input: ReadySteps): Promise<string[]> {
  const { walk, limit, runStep, isStopped } = input
  const running = new Map<string, Promise<void>>()
  const parked = new Map<string, WorkflowNode>()
  const retry = new Set<string>()
  const errors: unknown[] = []
  let consentHeldBy = input.consentHeldBy

  function mayAsk(node: WorkflowNode): boolean {
    return (
      !needsConsent(node) ||
      consentHeldBy === undefined ||
      consentHeldBy === node.id
    )
  }

  function nextNode(): WorkflowNode | undefined {
    if (errors.length > 0 || isStopped() || running.size >= limit)
      return undefined
    if (limit === 1)
      return parked.size === 0 ? walk.ready().find(mayAsk) : undefined
    const startable = [
      ...walk.ready(),
      ...[...parked.values()].filter(({ id }) => retry.has(id)),
    ]
    const free = startable.find((node) => !needsConsent(node))
    if (free || running.size > 0) return free
    return startable.find(mayAsk)
  }

  function retryParked(): void {
    for (const id of parked.keys()) retry.add(id)
  }

  async function run(node: WorkflowNode): Promise<void> {
    try {
      if ((await runStep(walk.start(node.id))) === "parked") {
        parked.set(node.id, node)
        return
      }
      if (consentHeldBy === node.id) consentHeldBy = undefined
      // Only a finished step retries the others: parking again must not set them off in turn.
      retryParked()
    } catch (error) {
      errors.push(error)
    }
  }

  for (;;) {
    for (let node = nextNode(); node; node = nextNode()) {
      const { id } = node
      parked.delete(id)
      retry.delete(id)
      if (needsConsent(node)) consentHeldBy = id
      // Cleanup is chained, not inside run(): starting can throw before the step is registered.
      running.set(
        id,
        run(node).then(() => {
          running.delete(id)
        })
      )
    }
    if (running.size === 0) break
    await nextChange(running, parked.size > 0, retryParked)
  }
  if (errors.length > 0) throw errors[0]
  return [...parked.keys()]
}

/** Resolves when a step ends, or after a while so parked steps can be tried beside a long one. */
async function nextChange(
  running: ReadonlyMap<string, Promise<void>>,
  hasParked: boolean,
  retryParked: () => void
): Promise<void> {
  let timer: NodeJS.Timeout | undefined
  const retryLater = new Promise<void>((resolve) => {
    if (!hasParked) return
    timer = setTimeout(() => {
      retryParked()
      resolve()
    }, RETRY_PARKED_MS)
  })
  await Promise.race([...running.values(), retryLater])
  clearTimeout(timer)
}
