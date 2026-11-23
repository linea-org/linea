import type {
  StepToExecute,
  WorkflowNode,
  WorkflowWalk,
} from "@linealabs/runtime"
import { mayPause } from "./may-pause"

export const MAX_PARALLEL_STEPS = 5

/** Settles only once no step is running: an error stops new steps, waits for the running ones and
 * is then thrown. A step that may pause waits for the others and runs alone. */
export async function runReadySteps(
  walk: WorkflowWalk,
  limit: number,
  runStep: (step: StepToExecute) => Promise<void>,
  isPaused: () => boolean
): Promise<void> {
  const running = new Map<string, Promise<void>>()
  const errors: unknown[] = []

  function nextNode(): WorkflowNode | undefined {
    if (errors.length > 0 || isPaused()) return undefined
    if (running.size >= limit) return undefined
    const [first] = walk.ready()
    if (limit === 1) return first
    const free = walk.ready().find((node) => !mayPause(node))
    return free ?? (running.size === 0 ? first : undefined)
  }

  async function run(node: WorkflowNode): Promise<void> {
    try {
      await runStep(walk.start(node.id))
    } catch (error) {
      errors.push(error)
    }
  }

  for (;;) {
    for (let node = nextNode(); node; node = nextNode()) {
      const { id } = node
      // Cleanup is chained, not inside run(): starting can throw before the step is registered.
      running.set(
        id,
        run(node).then(() => {
          running.delete(id)
        })
      )
    }
    if (running.size === 0) break
    await Promise.race(running.values())
  }
  if (errors.length > 0) throw errors[0]
}
