import { createFileRoute } from "@tanstack/react-router"
import {
  ConversationAnalysisError,
  ConversationAnalysisView,
} from "@/components/conversation-analysis/conversation-analysis-view"
import { getConversationAnalysisFn } from "@/lib/conversation-analyses-api"

export const Route = createFileRoute(
  "/w/$slug/workflows/$workflowId/conversations/$conversationId"
)({
  validateSearch: (search: Record<string, unknown>) => ({
    findingId:
      typeof search.findingId === "string" ? search.findingId : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) =>
    getConversationAnalysisFn({
      data: {
        workflowId: params.workflowId,
        conversationId: params.conversationId,
        findingId: deps.findingId,
      },
    }),
  errorComponent: ConversationAnalysisError,
  component: ConversationAnalysisPage,
})

function ConversationAnalysisPage() {
  const analysis = Route.useLoaderData()
  return (
    <main className="flex flex-1 flex-col px-4 py-4">
      <ConversationAnalysisView analysis={analysis} />
    </main>
  )
}
