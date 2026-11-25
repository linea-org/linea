import {
  nodeReferences,
  readPath,
  ReferenceValueError,
  resolveReferences,
  WorkflowGraphError,
  type Reference,
  type WorkflowNode,
} from "@linealabs/runtime"
import { loadSecret } from "./load-secret"
import { NonRetryableError } from "./nodes/non-retryable-error"

export type ResolvedNode = {
  node: WorkflowNode
  /** What was read besides the step's own input, by reference; never a secret. */
  references: Record<string, unknown>
  carriesSecrets: boolean
}

type ReadReference = (reference: Reference) => unknown

async function loadSecrets(
  used: Reference[],
  nodeId: string,
  environmentId: string | undefined
): Promise<Map<string, string>> {
  const names = new Set(
    used
      .filter(({ root }) => root === "secrets")
      .map(({ path: [name] }) => name)
  )
  if (names.size === 0) return new Map()
  if (!environmentId) {
    throw new NonRetryableError(
      `Step "${nodeId}" uses secrets, which need an Environment`
    )
  }
  const loaded = await Promise.all(
    [...names].map(
      async (name) =>
        [
          name,
          await loadSecret(environmentId, name, `Step "${nodeId}"`),
        ] as const
    )
  )
  return new Map(loaded)
}

/** Fills in the references of a node's config. `read` answers all but secrets; undefined is missing. */
export async function resolveNode(
  node: WorkflowNode,
  environmentId: string | undefined,
  read: ReadReference
): Promise<ResolvedNode> {
  try {
    const used = nodeReferences(node)
    const secrets = await loadSecrets(used, node.id, environmentId)
    const references: Record<string, unknown> = {}
    const config = resolveReferences(node, (reference) => {
      if (reference.root === "secrets") return secrets.get(reference.path[0])
      const value = read(reference)
      if (value === undefined) {
        throw new ReferenceValueError(`"{{${reference.text}}}" has no value`)
      }
      if (reference.root !== "input") references[reference.text] = value
      return value
    })
    return {
      node: { ...node, config },
      references,
      carriesSecrets: secrets.size > 0,
    }
  } catch (error) {
    if (
      error instanceof WorkflowGraphError ||
      error instanceof ReferenceValueError
    ) {
      throw new NonRetryableError(error.message, { cause: error })
    }
    throw error
  }
}

/** Reads what a step already read from its record; `fallback` answers what it did not. */
export function readRecorded(
  recorded: unknown,
  input: unknown,
  fallback: ReadReference
): ReadReference {
  return (reference) => {
    if (reference.root === "input") return readPath(input, reference.path)
    const value = readPath(recorded, [reference.text])
    return value === undefined ? fallback(reference) : value
  }
}
