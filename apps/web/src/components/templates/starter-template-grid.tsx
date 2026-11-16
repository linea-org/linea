import { useMemo } from "react"

import { workflowGraphSchema } from "@linea/runtime/browser"

import { createWorkflowFromTemplate } from "@/lib/create-from-template"
import type { WorkflowTemplate } from "@/lib/workflow-templates"
import { TemplateGrid } from "./template-grid"

/** The built-in templates, built on the chosen model. */
export function StarterTemplateGrid({
  slug,
  model,
  templates,
}: Readonly<{
  slug: string
  model: string
  templates: WorkflowTemplate[]
}>) {
  const cards = useMemo(
    () =>
      templates.map((template) => ({
        id: template.id,
        name: template.name,
        graph: workflowGraphSchema.parse(template.build(model)),
      })),
    [templates, model]
  )
  return (
    <TemplateGrid
      slug={slug}
      cards={cards}
      create={createWorkflowFromTemplate}
    />
  )
}
