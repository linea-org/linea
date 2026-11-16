import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { DefaultModelCard } from "@/components/models/default-model-card"
import { ProviderKeysCard } from "@/components/models/provider-keys-card"
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
      <div className="flex w-full flex-col gap-6 p-4">
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Provider keys</h2>
          <ProviderKeysCard slug={slug} setup={setup} />
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Default model</h2>
          <DefaultModelCard
            key={setup.settings.defaultModel ?? "none"}
            slug={slug}
            setup={setup}
          />
        </section>
      </div>
    </main>
  )
}
