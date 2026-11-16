import { createWorkflowWithDraft } from "./create-workflow-with-draft"
import type { TemplateResult } from "./create-from-template"
import { findOrCreateDefaultApplication } from "./default-application"
import { withModel } from "./graph-model"
import { getModelSetupFn, isModelReady } from "./model-settings-api"
import { useTemplateFn } from "./templates-api"

/** Like a starter template, it refuses until a model is ready; the use is counted only once it will build. */
export async function createWorkflowFromSharedTemplate(
  templateId: string
): Promise<TemplateResult> {
  const setup = await getModelSetupFn()
  const model = setup.settings.defaultModel
  if (!model || !isModelReady(setup)) return { kind: "needs-model" }
  const { name, graph } = await useTemplateFn({ data: { id: templateId } })
  const application = await findOrCreateDefaultApplication()
  const workflow = await createWorkflowWithDraft({
    applicationId: application.id,
    name,
    graph: withModel(graph, model),
  })
  return { kind: "created", workflowId: workflow.id }
}
