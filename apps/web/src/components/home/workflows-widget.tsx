import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys"
import { shortcutTarget } from "@/components/shortcuts/shortcut-target"
import { useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { PlusIcon, WorkflowIcon } from "lucide-react"

import { Button } from "@linealabs/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linealabs/ui/components/table"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linealabs/ui/components/empty"
import { PlayfulAvatar } from "@/components/avatar"
import {
  createWorkflowFn,
  workflowsQueryOptions,
  type WorkflowSummary,
} from "@/lib/workflows-api"
import { WorkflowFormDialog, WorkflowStatusBadge } from "../workflows"
import { HomePanel } from "./home-panel"

const HOME_LIMIT = 5

export function WorkflowsWidget({
  slug,
  workflows,
}: {
  slug: string
  workflows: WorkflowSummary[]
}) {
  const recent = workflows.slice(0, HOME_LIMIT)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const createDialog = (
    <WorkflowFormDialog
      workspaceSlug={slug}
      trigger={
        <Button size="sm" {...shortcutTarget("create")}>
          <PlusIcon />
          Create
          <ShortcutKeys id="create" onPrimary />
        </Button>
      }
      title="Create workflow"
      submitLabel="Create workflow"
      onSubmit={(values) => createWorkflowFn({ data: values })}
      onSuccess={(workflow) => {
        void queryClient.invalidateQueries({
          queryKey: workflowsQueryOptions(slug).queryKey,
        })
        return navigate({
          to: "/w/$slug/workflows/$workflowId/builder",
          params: { slug, workflowId: workflow.id },
        })
      }}
    />
  )
  return (
    <HomePanel
      title="Workflows"
      action={
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link to="/w/$slug/workflows" params={{ slug }} />}
          >
            View all
          </Button>
          {createDialog}
        </div>
      }
    >
      {recent.length === 0 ? (
        <Empty className="min-h-40 flex-1 gap-3 rounded-none border-0 bg-transparent p-6 sm:p-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WorkflowIcon />
            </EmptyMedia>
            <EmptyTitle>No workflows yet</EmptyTitle>
            <EmptyDescription>
              Create your first workflow to get started.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4 font-normal text-muted-foreground">
                Workflow
              </TableHead>
              <TableHead className="px-4 font-normal text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="px-4 font-normal text-muted-foreground">
                Updated
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent.map((workflow) => (
              <TableRow key={workflow.id}>
                <TableCell className="px-4">
                  <Link
                    to="/w/$slug/workflows/$workflowId"
                    params={{ slug, workflowId: workflow.id }}
                    className="flex min-w-0 items-center gap-3"
                  >
                    <PlayfulAvatar
                      name={workflow.name}
                      shape="rounded"
                      className="size-6"
                    />
                    <span className="truncate text-sm font-medium">
                      {workflow.name}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="px-4">
                  <WorkflowStatusBadge workflow={workflow} />
                </TableCell>
                <TableCell className="px-4 text-muted-foreground tabular-nums">
                  {new Date(workflow.updatedAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </HomePanel>
  )
}
