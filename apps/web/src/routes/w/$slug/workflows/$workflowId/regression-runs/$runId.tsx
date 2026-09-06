import { createFileRoute } from "@tanstack/react-router"

import {
  RegressionRunDetailView,
  loadRegressionRunDetail,
} from "@/components/regressions"

export const Route = createFileRoute(
  "/w/$slug/workflows/$workflowId/regression-runs/$runId"
)({
  loader: ({ params }) =>
    loadRegressionRunDetail(params.workflowId, params.runId),
  component: WorkflowRegressionRunDetailPage,
})

function WorkflowRegressionRunDetailPage() {
  const { slug, workflowId, runId } = Route.useParams()
  const initialData = Route.useLoaderData()
  return (
    <RegressionRunDetailView
      slug={slug}
      workflowId={workflowId}
      runId={runId}
      initialData={initialData}
    />
  )
}
