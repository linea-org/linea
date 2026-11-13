import { getPath } from "./dot-path"

/** Resolves an arbitrary caller-supplied subject id via a dot-path into a node's own input — not a Linea user, no identity table backing it. Shared by any handler that scopes memory reads/writes, so the resolution rules (and error wording) stay identical everywhere. */
export function resolveSubjectId(
  input: unknown,
  subjectPath: unknown,
  errorPrefix: string
): string {
  if (typeof subjectPath !== "string" || subjectPath.trim() === "") {
    throw new Error(`${errorPrefix} requires a "subjectPath"`)
  }
  const resolved = getPath(input, subjectPath)
  if (resolved === null || resolved === undefined) {
    throw new Error(
      `${errorPrefix}: no value found at subjectPath "${subjectPath}"`
    )
  }
  if (typeof resolved === "string") return resolved
  if (typeof resolved === "number" || typeof resolved === "boolean") {
    return String(resolved)
  }
  throw new Error(
    `${errorPrefix}: value at subjectPath "${subjectPath}" must be a string, number, or boolean`
  )
}

/** Defaults to the workflow id (isolated per workflow) unless explicitly configured to share across workflows. */
export function resolveNamespace(
  namespace: unknown,
  workflowId: string | undefined,
  errorPrefix: string
): string {
  if (typeof namespace === "string" && namespace.trim() !== "") {
    return namespace
  }
  if (workflowId) return workflowId
  throw new Error(
    `${errorPrefix} has no namespace and no workflowId in context`
  )
}
