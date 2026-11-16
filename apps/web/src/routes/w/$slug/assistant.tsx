import { createFileRoute } from "@tanstack/react-router"

import { AssistantPage } from "@/components/assistant/assistant-page"
import { getModelSetupFn } from "@/lib/model-settings-api"

export const Route = createFileRoute("/w/$slug/assistant")({
  validateSearch: (search: Record<string, unknown>) =>
    typeof search.c === "string" ? { c: search.c } : {},
  loader: () => getModelSetupFn(),
  component: AssistantRoute,
})

function AssistantRoute() {
  const { slug } = Route.useParams()
  const { c } = Route.useSearch()
  const setup = Route.useLoaderData()
  return <AssistantPage slug={slug} initialSetup={setup} conversationId={c} />
}
