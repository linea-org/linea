import { Link } from "@tanstack/react-router"

import { Badge } from "@linealabs/ui/components/badge"
import { Spinner } from "@linealabs/ui/components/spinner"

import { executionStatusDefinition } from "@/lib/execution-status"
import type { ExecutionDetailResponse } from "@/lib/executions-api"
import { previewJson, summarizeRun } from "@/lib/run-summary"

export function ProposalRunResult({
  slug,
  executionId,
  detail,
}: Readonly<{
  slug: string
  executionId: string
  detail: ExecutionDetailResponse | undefined
}>) {
  if (!detail) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-3.5" />
        Starting…
      </p>
    )
  }
  const summary = summarizeRun(detail)
  const status = executionStatusDefinition[detail.execution.status]
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center gap-2">
        <Badge variant={status.variant}>{status.label}</Badge>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {summary.outcome}
        </span>
        <Link
          to="/w/$slug/executions/$executionId"
          params={{ slug, executionId }}
          className="shrink-0 text-primary hover:underline"
        >
          View run
        </Link>
      </div>
      {summary.attention ? (
        <p className="text-destructive">{summary.attention}</p>
      ) : null}
      {summary.result !== null ? (
        <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 whitespace-pre-wrap text-muted-foreground">
          {previewJson(summary.result)}
        </pre>
      ) : null}
    </div>
  )
}
