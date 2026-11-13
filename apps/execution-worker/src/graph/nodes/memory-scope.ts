import type { repositories } from "@linea/db"
import { getPath } from "./dot-path"
import type { NodeExecutionContext } from "./node-handler.interface"

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

/** A run for a verified End User is scoped to that record; subjectPath only names the subject on operator runs (manual, webhook, draft), where the workspace is the trusted caller. */
export function resolveMemoryScope(
  context: NodeExecutionContext,
  input: unknown,
  config: {
    subjectPath: unknown
    namespace: unknown
    subjectOverride?: string
  },
  errorPrefix: string
): repositories.memory.MemoryScope {
  if (!context.environmentId) {
    throw new Error(`${errorPrefix} requires an Environment`)
  }
  const namespace = resolveNamespace(
    config.namespace,
    context.workflowId,
    errorPrefix
  )
  if (context.externalSubjectRecordId) {
    return {
      workspaceId: context.workspaceId,
      environmentId: context.environmentId,
      externalSubjectRecordId: context.externalSubjectRecordId,
      externalSubjectId: context.externalSubjectRecordId,
      namespace,
    }
  }
  return {
    workspaceId: context.workspaceId,
    environmentId: context.environmentId,
    externalSubjectId:
      config.subjectOverride ??
      resolveSubjectId(input, config.subjectPath, errorPrefix),
    namespace,
  }
}
