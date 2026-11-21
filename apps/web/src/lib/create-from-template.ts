import { createWorkflowWithDraft } from "./create-workflow-with-draft"
import { findOrCreateDefaultApplication } from "./default-application"
import { getModelSetupFn, isModelReady } from "./model-settings-api"
import { findTemplate } from "./workflow-templates"

export type TemplateResult =
  { kind: "needs-model" } | { kind: "created"; workflowId: string }

/** Refuses to build anything until the workspace has chosen a model and added its key. */
export async function createWorkflowFromTemplate(
  templateId: string
): Promise<TemplateResult> {
  const setup = await getModelSetupFn()
  const model = setup.settings.defaultModel
  if (!model || !isModelReady(setup)) return { kind: "needs-model" }
  const template = findTemplate(templateId)
  const application = await findOrCreateDefaultApplication()
  const workflow = await createWorkflowWithDraft({
    applicationId: application.id,
    name: template.name,
    description: template.description,
    graph: template.build(model),
  })
  return { kind: "created", workflowId: workflow.id }
}
