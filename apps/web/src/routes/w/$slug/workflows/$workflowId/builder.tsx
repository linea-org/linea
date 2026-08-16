import { createFileRoute } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"

import {
  WorkflowBuilderCanvas,
  type WorkflowBuilderGraph,
} from "@/components/workflow-builder"
import {
  getWorkflowFn,
  getWorkflowVersionFn,
  workflowQueryOptions,
} from "@/lib/workflows-api"

const BLANK_GRAPH: WorkflowBuilderGraph = { nodes: [], edges: [] }

export const Route = createFileRoute("/w/$slug/workflows/$workflowId/builder")({
  loader: async ({ params }) => {
    const workflow = await getWorkflowFn({ data: { id: params.workflowId } })

    if (workflow.draftGraph) {
      return { workflow, graph: workflow.draftGraph as WorkflowBuilderGraph }
    }
    if (workflow.publishedVersionId) {
      const version = await getWorkflowVersionFn({
        data: { id: params.workflowId, versionId: workflow.publishedVersionId },
      })
      return { workflow, graph: version.graph as WorkflowBuilderGraph }
    }
    return { workflow, graph: BLANK_GRAPH }
  },
  component: WorkflowBuilderPage,
})

function WorkflowBuilderPage() {
  const { slug, workflowId } = Route.useParams()
  const initialData = Route.useLoaderData()
  useSuspenseQuery({
    ...workflowQueryOptions(slug, workflowId),
    initialData: initialData.workflow,
  })

  return (
    <div className="absolute inset-0 flex animate-in flex-col overflow-hidden duration-500 fade-in-0 fill-mode-both slide-in-from-bottom-2">
      {/* key=workflowId: remount on a real workflow switch, not on a background refetch of `workflow`. */}
      <WorkflowBuilderCanvas
        key={workflowId}
        workflowId={workflowId}
        slug={slug}
        initialGraph={initialData.graph}
      />
    </div>
  )
}
