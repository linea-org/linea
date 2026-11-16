import type { ReactNode } from "react"

import type { WorkflowGraph } from "@linea/runtime/browser"
import { Card } from "@linea/ui/components/card"
import { Spinner } from "@linea/ui/components/spinner"

import { WorkflowPreview } from "@/components/assistant/workflow-preview"
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
}: {
  slug: string
  cards: TemplateCardData[]
  create: (templateId: string) => Promise<TemplateResult>
}) {
  const mutation = useCreateFromTemplate(slug, create)
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
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
              className="pointer-events-auto relative h-40 cursor-pointer gap-0 bg-muted py-0 transition-shadow hover:ring-primary disabled:opacity-60"
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
            <span className="text-xs font-medium">{name}</span>
            {footer}
          </div>
        ))}
      </div>
      {mutation.isError ? (
        <p className="mt-3 text-xs text-destructive">
          {mutation.error.message}
        </p>
      ) : null}
    </>
  )
}
