import type { ReactNode } from "react"

import type { WorkflowGraph } from "@linea/runtime/browser"
import { Card } from "@linea/ui/components/card"
import { Spinner } from "@linea/ui/components/spinner"

import { WorkflowPreview } from "@/components/assistant/workflow-preview"
import { NeedsModelDialog } from "@/components/models/needs-model-dialog"
import { useCreateFromTemplate } from "@/components/workflows/use-create-from-template"
import type { TemplateResult } from "@/lib/create-from-template"

export type TemplateCardData = {
  id: string
  name: string
  graph: WorkflowGraph
  footer?: ReactNode
}

/** Each card builds its workflow on the chosen model and opens it in the builder. */
export function TemplateGrid({
  slug,
  cards,
  create,
}: Readonly<{
  slug: string
  cards: TemplateCardData[]
  create: (templateId: string) => Promise<TemplateResult>
}>) {
  const mutation = useCreateFromTemplate(slug, create)
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map(({ id, name, graph, footer }) => (
          <div key={id} className="flex flex-col gap-2">
            <Card
              render={
                <button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate(id)}
                />
              }
              className="pointer-events-auto relative h-32 cursor-pointer gap-0 bg-muted py-0 disabled:opacity-60"
            >
              <span className="pointer-events-none block h-full">
                <WorkflowPreview graph={graph} view="fit" />
              </span>
              {mutation.isPending && mutation.variables === id ? (
                <span className="absolute inset-0 grid place-items-center bg-background/60">
                  <Spinner />
                </span>
              ) : null}
            </Card>
            <span className="text-sm font-medium">{name}</span>
            {footer}
          </div>
        ))}
      </div>
      <NeedsModelDialog slug={slug} mutation={mutation} />
      {mutation.isError ? (
        <p className="mt-3 text-sm text-destructive">
          {mutation.error.message}
        </p>
      ) : null}
    </>
  )
}
