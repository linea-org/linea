import { createFileRoute } from "@tanstack/react-router"

import { AssistantPage } from "@/components/assistant/assistant-page"
import { getModelSetupFn } from "@/lib/model-settings-api"

export const Route = createFileRoute("/w/$slug/assistant")({
  validateSearch: (
    search: Record<string, unknown>
  ): { c?: string; ask?: string; run?: string } => ({
    ...(typeof search.c === "string" ? { c: search.c } : {}),
    ...(typeof search.ask === "string" ? { ask: search.ask } : {}),
    ...(typeof search.run === "string" ? { run: search.run } : {}),
  }),
  loader: () => getModelSetupFn(),
  component: AssistantRoute,
})

function AssistantRoute() {
  const { slug } = Route.useParams()
  const { c, ask, run } = Route.useSearch()
  const setup = Route.useLoaderData()
  return (
    <AssistantPage
      slug={slug}
      initialSetup={setup}
      conversationId={c}
      initialDraft={ask}
      runId={run}
    />
  )
}
