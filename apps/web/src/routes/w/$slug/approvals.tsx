import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { CircleCheckIcon, XIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linea/ui/components/empty"
import { Textarea } from "@linea/ui/components/textarea"

import {
  pendingApprovalsQueryOptions,
  respondToApprovalFn,
} from "../../../lib/approvals-api"

export const Route = createFileRoute("/w/$slug/approvals")({
  component: ApprovalsPage,
})

function ApprovalsPage() {
  const { slug } = Route.useParams()
  const queryClient = useQueryClient()
  const [comments, setComments] = useState<Record<string, string>>({})
  const approvalsQuery = useQuery(pendingApprovalsQueryOptions(slug))
  const approvals = approvalsQuery.data ?? []

  const respond = useMutation({
    mutationFn: (input: { id: string; approved: boolean }) =>
      respondToApprovalFn({
        data: {
          id: input.id,
          approved: input.approved,
          comment: comments[input.id]?.trim() || undefined,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["approvals", slug] })
    },
  })

  return (
    <main className="flex flex-1 flex-col px-6 py-6 sm:px-8">
      <h1 className="text-lg font-medium text-foreground">Pending approvals</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Workflow executions waiting on a decision before they continue.
      </p>

      {approvalsQuery.isError ? (
        <p className="mt-6 text-sm text-destructive">
          Could not load approvals.
        </p>
      ) : approvalsQuery.isPending ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      ) : approvals.length === 0 ? (
        <Empty className="mt-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CircleCheckIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing pending</EmptyTitle>
            <EmptyDescription>
              Approval nodes that pause a run will show up here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {approvals.map((approval) => (
            <li
              key={approval.id}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {approval.message ?? "Approval requested"}
                  </p>
                  <Link
                    to="/w/$slug/executions/$executionId"
                    params={{ slug, executionId: approval.executionId }}
                    className="mt-0.5 block truncate font-mono text-xs text-muted-foreground hover:underline"
                  >
                    {approval.executionId}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Requested {new Date(approval.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
              <Textarea
                placeholder="Optional comment…"
                rows={2}
                className="mt-3"
                value={comments[approval.id] ?? ""}
                onChange={(event) =>
                  setComments((current) => ({
                    ...current,
                    [approval.id]: event.target.value,
                  }))
                }
              />
              <div className="mt-3 flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    respond.mutate({ id: approval.id, approved: true })
                  }
                  disabled={respond.isPending}
                >
                  <CircleCheckIcon />
                  Approve
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    respond.mutate({ id: approval.id, approved: false })
                  }
                  disabled={respond.isPending}
                >
                  <XIcon />
                  Reject
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {respond.isError && (
        <p className="mt-3 text-sm text-destructive">{respond.error.message}</p>
      )}
    </main>
  )
}
