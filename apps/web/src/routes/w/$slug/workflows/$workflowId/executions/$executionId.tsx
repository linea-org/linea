import { createFileRoute } from "@tanstack/react-router"

import {
  ExecutionDetailView,
  loadExecutionDetail,
} from "@/components/executions"

export const Route = createFileRoute(
  "/w/$slug/workflows/$workflowId/executions/$executionId"
)({
  loader: ({ params }) =>
    loadExecutionDetail(params.executionId, params.workflowId),
  component: WorkflowExecutionDetailPage,
})

function WorkflowExecutionDetailPage() {
  const { slug, executionId } = Route.useParams()
  const initialData = Route.useLoaderData()
  return (
    <ExecutionDetailView
      slug={slug}
      executionId={executionId}
      initialData={initialData}
    />
  )
}
