import { useSuspenseQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { WorkflowIcon } from "lucide-react"

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linea/ui/components/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linea/ui/components/table"

import { WorkflowStatusBadge } from "../../../../components/workflows"
import {
  listWorkflowsFn,
  workflowsQueryOptions,
} from "../../../../lib/workflows-api"

export const Route = createFileRoute("/w/$slug/workflows/")({
  loader: () => listWorkflowsFn(),
  component: WorkflowsListPage,
})

function WorkflowsListPage() {
  const { slug } = Route.useParams()
  const initialData = Route.useLoaderData()
  const { data: workflows } = useSuspenseQuery({
    ...workflowsQueryOptions(),
    initialData,
  })

  return (
    <main className="flex flex-1 flex-col px-6 py-8 sm:px-8 sm:py-10">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">
        Workflows
      </h1>

      {workflows.length === 0 ? (
        <Empty className="mt-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WorkflowIcon />
            </EmptyMedia>
            <EmptyTitle>No workflows yet</EmptyTitle>
            <EmptyDescription>
              Workflows created for this workspace will show up here.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent />
        </Empty>
      ) : (
        <Table className="mt-6">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workflows.map((workflow) => (
              <TableRow key={workflow.id}>
                <TableCell>
                  <Link
                    to="/w/$slug/workflows/$workflowId"
                    params={{ slug, workflowId: workflow.id }}
                    className="font-medium text-foreground hover:underline"
                  >
                    {workflow.name}
                  </Link>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {workflow.slug}
                  </span>
                </TableCell>
                <TableCell>
                  <WorkflowStatusBadge workflow={workflow} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(workflow.updatedAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  )
}
