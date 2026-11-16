import type { ExecutionSummary } from "@/lib/executions-api"

import { ExecutionList } from "./execution-list"

export function WorkflowExecutionsSection({
  label,
  slug,
  workflowId,
  executions,
  errored,
  pending,
}: Readonly<{
  label: string
  slug: string
  workflowId: string
  executions: ExecutionSummary[] | undefined
  errored: boolean
  pending: boolean
}>) {
  if (errored) {
    return (
      <section aria-label={label}>
        <p className="text-sm text-destructive">Could not load executions.</p>
      </section>
    )
  }
  if (pending || !executions) {
    return (
      <section aria-label={label}>
        <p className="text-sm text-muted-foreground">Loading executions…</p>
      </section>
    )
  }
  return (
    <section aria-label={label}>
      <ExecutionList
        executions={executions}
        slug={slug}
        workflowId={workflowId}
      />
    </section>
  )
}
