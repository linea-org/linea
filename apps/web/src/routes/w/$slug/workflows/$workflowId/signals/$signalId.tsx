import { createFileRoute } from "@tanstack/react-router"

import {
  loadSignalDetail,
  SignalDetailView,
} from "../../../../../../components/signals"

export const Route = createFileRoute(
  "/w/$slug/workflows/$workflowId/signals/$signalId"
)({
  loader: ({ params }) => loadSignalDetail(params.signalId, params.workflowId),
  component: WorkflowSignalDetailPage,
})

function WorkflowSignalDetailPage() {
  const { slug, workflowId, signalId } = Route.useParams()
  const initialData = Route.useLoaderData()
  return (
    <SignalDetailView
      slug={slug}
      workflowId={workflowId}
      signalId={signalId}
      initialData={initialData}
    />
  )
}
