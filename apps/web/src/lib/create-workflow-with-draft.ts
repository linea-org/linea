import { slugify } from "./auth-redirect"
import { uniqueSlug } from "./starter-workflow"
import type { JsonValue } from "./executions-api"
import {
  createWorkflowFn,
  listApplicationWorkflowsFn,
  saveWorkflowDraftFn,
} from "./workflows-api"

export async function createWorkflowWithDraft(input: {
  applicationId: string
  name: string
  slug?: string
  description?: string
  graph: Record<string, JsonValue>
}) {
  const existing = await listApplicationWorkflowsFn({
    data: { applicationId: input.applicationId },
  })
  const workflow = await createWorkflowFn({
    data: {
      applicationId: input.applicationId,
      name: input.name,
      description: input.description,
      slug: uniqueSlug(
        input.slug ?? (slugify(input.name) || "workflow"),
        existing.map((item) => item.slug)
      ),
    },
  })
  await saveWorkflowDraftFn({ data: { id: workflow.id, graph: input.graph } })
  return workflow
}
