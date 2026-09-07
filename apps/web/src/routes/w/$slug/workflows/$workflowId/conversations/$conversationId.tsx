import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"
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
  const { slug, workflowId } = Route.useParams()
  const analysis = Route.useLoaderData()
  return (
    <main className="flex flex-1 flex-col px-4 py-4">
      <Link
        to="/w/$slug/workflows/$workflowId"
        params={{ slug, workflowId }}
        className="inline-flex w-fit items-center gap-1.5 pl-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" />
        Back to workflow
      </Link>
      <div className="mt-4">
        <ConversationAnalysisView analysis={analysis} />
      </div>
    </main>
  )
}
