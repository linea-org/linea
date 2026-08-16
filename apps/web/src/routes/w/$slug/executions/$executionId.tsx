import { createFileRoute } from "@tanstack/react-router"

import {
  ExecutionDetailView,
  loadExecutionDetail,
} from "@/components/executions"

export const Route = createFileRoute("/w/$slug/executions/$executionId")({
  loader: ({ params }) => loadExecutionDetail(params.executionId),
  component: WorkspaceExecutionDetailPage,
})

function WorkspaceExecutionDetailPage() {
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
