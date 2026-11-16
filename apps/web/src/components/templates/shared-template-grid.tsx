import { Suspense } from "react"

import { workflowGraphSchema } from "@linea/runtime/browser"
import { Badge } from "@linea/ui/components/badge"

import { createWorkflowFromSharedTemplate } from "@/lib/create-from-shared-template"
import type { SharedTemplate } from "@/lib/templates-api"
import { AppealTemplateDialog } from "./appeal-template-dialog"
import { TemplateGrid } from "./template-grid"
import { TemplateRemoveButton } from "./template-remove-button"
import { TemplateStarButton } from "./template-star-button"

const APPEAL_STATUS = {
  open: "Appeal sent",
  upheld: "Appeal upheld",
  rejected: "Appeal rejected",
} as const

function SharedTemplateFooter({
  slug,
  template,
}: {
  slug: string
  template: SharedTemplate
}) {
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <TemplateStarButton slug={slug} template={template} />
      <span className="tabular-nums">{template.useCount} uses</span>
      <span className="flex-1" />
      {template.moderation.status === "hidden" ? (
        <Badge variant="warning" title={template.moderation.note ?? undefined}>
          Hidden
        </Badge>
      ) : null}
      {template.appeal ? (
        <Badge
          variant="outline"
          title={template.appeal.decisionNote ?? undefined}
        >
          {APPEAL_STATUS[template.appeal.status]}
        </Badge>
      ) : null}
      {template.canAppeal ? (
        <Suspense fallback={null}>
          <AppealTemplateDialog slug={slug} template={template} />
        </Suspense>
      ) : null}
      {template.mine ? (
        <Badge variant="secondary">
          {template.visibility === "public" ? "Public" : "Workspace"}
        </Badge>
      ) : (
        <span className="truncate">{template.workspaceName}</span>
      )}
      {template.canRemove ? (
        <TemplateRemoveButton slug={slug} template={template} />
      ) : null}
    </div>
  )
}

/** Templates people published, built on the chosen model. */
export function SharedTemplateGrid({
  slug,
  templates,
}: {
  slug: string
  templates: SharedTemplate[]
}) {
  const cards = templates.map((template) => ({
    id: template.id,
    name: template.name,
    graph: workflowGraphSchema.parse(template.graph),
    footer: <SharedTemplateFooter slug={slug} template={template} />,
  }))
  return (
    <TemplateGrid
      slug={slug}
      cards={cards}
      create={createWorkflowFromSharedTemplate}
    />
  )
}
