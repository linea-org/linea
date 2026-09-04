import { createFileRoute } from "@tanstack/react-router"

import { EvalRunDetailView, loadEvalRunDetail } from "@/components/evals"

export const Route = createFileRoute(
  "/w/$slug/workflows/$workflowId/eval-runs/$runId"
)({
  loader: ({ params }) => loadEvalRunDetail(params.workflowId, params.runId),
  component: WorkflowEvalRunDetailPage,
})

function WorkflowEvalRunDetailPage() {
  const { slug, workflowId, runId } = Route.useParams()
  const initialData = Route.useLoaderData()
  return (
    <EvalRunDetailView
      slug={slug}
      workflowId={workflowId}
      runId={runId}
      initialData={initialData}
    />
  )
}
