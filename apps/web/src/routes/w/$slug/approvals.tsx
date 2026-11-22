import { Card } from "@linealabs/ui/components/card"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { CircleCheckIcon, XIcon } from "lucide-react"
import { z } from "zod"

import { Button } from "@linealabs/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linealabs/ui/components/empty"
import { Field, FieldLabel } from "@linealabs/ui/components/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linealabs/ui/components/select"
import { Textarea } from "@linealabs/ui/components/textarea"

import {
  pendingApprovalsQueryOptions,
  respondToApprovalFn,
} from "@/lib/approvals-api"
import { FilterPopover } from "@/components/workspace/filter-popover"
import { ListSkeleton } from "@/components/workspace/list-skeleton"
import { PageToolbar } from "@/components/workspace/page-toolbar"

export const Route = createFileRoute("/w/$slug/approvals")({
  validateSearch: z.object({ executionId: z.uuid().optional() }),
  component: ApprovalsPage,
})

function ApprovalsPage() {
  const { slug } = Route.useParams()
  const { executionId } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [comments, setComments] = useState<Record<string, string>>({})
  const approvalsQuery = useQuery(pendingApprovalsQueryOptions(slug))
  const pending = approvalsQuery.data ?? []
  const approvals = pending.filter(
    (approval) => !executionId || approval.executionId === executionId
  )
  const executionIds = [
    ...new Set(pending.map((approval) => approval.executionId)),
  ]
  const filterByExecution = (next: string | undefined) =>
    void navigate({
      to: "/w/$slug/approvals",
      params: { slug },
      search: next ? { executionId: next } : {},
    })

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
    <main className="flex flex-1 flex-col p-4">
      {pending.length > 0 ? (
        <PageToolbar>
          <FilterPopover
            label="Filter approvals"
            active={executionId !== undefined}
            onReset={() => filterByExecution(undefined)}
          >
            <Field orientation="horizontal">
              <FieldLabel>Execution</FieldLabel>
              <Select
                value={executionId ?? "all"}
                onValueChange={(value) =>
                  filterByExecution(executionIds.find((id) => id === value))
                }
              >
                <SelectTrigger
                  aria-label="Filter by execution"
                  className="w-40"
                >
                  <SelectValue>
                    {(value: string) =>
                      value === "all" ? "All executions" : value
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All executions</SelectItem>
                  {executionIds.map((id) => (
                    <SelectItem key={id} value={id}>
                      {id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FilterPopover>
        </PageToolbar>
      ) : null}
      {approvalsQuery.isError ? (
        <p className="text-sm text-destructive">Could not load approvals.</p>
      ) : approvalsQuery.isPending ? (
        <ListSkeleton />
      ) : approvals.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CircleCheckIcon />
            </EmptyMedia>
            <EmptyTitle>
              {executionId
                ? "No approvals awaiting you for this execution"
                : "Nothing pending"}
            </EmptyTitle>
            <EmptyDescription>
              Approval nodes that pause a run will show up here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-4">
          {approvals.map((approval) => (
            <Card
              render={<li />}
              size="sm"
              className="gap-0 px-(--card-spacing)"
              key={approval.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {approval.message ?? "Approval requested"}
                  </p>
                  <Link
                    to="/w/$slug/executions/$executionId"
                    params={{ slug, executionId: approval.executionId }}
                    className="mt-0.5 block truncate font-mono text-sm text-muted-foreground hover:underline"
                  >
                    {approval.executionId}
                  </Link>
                  <p className="mt-0.5 text-sm text-muted-foreground">
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
                  onClick={() =>
                    respond.mutate({ id: approval.id, approved: false })
                  }
                  disabled={respond.isPending}
                >
                  <XIcon />
                  Reject
                </Button>
              </div>
            </Card>
          ))}
        </ul>
      )}
      {respond.isError && (
        <p className="mt-3 text-sm text-destructive">{respond.error.message}</p>
      )}
    </main>
  )
}
