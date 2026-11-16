import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { ProviderKeysTable } from "@/components/models/provider-keys-table"
import { TaskModelsTable } from "@/components/models/task-models-table"
import {
  getModelSetupFn,
  modelSetupQueryOptions,
} from "@/lib/model-settings-api"

export const Route = createFileRoute("/w/$slug/settings/models")({
  loader: () => getModelSetupFn(),
  component: ModelsPage,
})

function ModelsPage() {
  const { slug } = Route.useParams()
  const initialData = Route.useLoaderData()
  const { data: setup } = useSuspenseQuery({
    ...modelSetupQueryOptions(slug),
    initialData,
  })
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-col gap-4 p-4">
        <ProviderKeysTable slug={slug} setup={setup} />
        <TaskModelsTable slug={slug} setup={setup} />
      </div>
    </main>
  )
}
