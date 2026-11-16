import { createFileRoute } from "@tanstack/react-router"

import {
  TemplatesPage,
  type TemplatesSearch,
} from "@/components/templates/templates-page"
import { getModelSetupFn } from "@/lib/model-settings-api"

const TABS = ["starter", "workspace", "public"] as const
const SORTS = ["stars", "used", "new"] as const

function oneOf<T extends string>(
  options: readonly T[],
  value: unknown,
  fallback: T
) {
  return options.find((option) => option === value) ?? fallback
}

export const Route = createFileRoute("/w/$slug/templates")({
  validateSearch: (
    search: Record<string, unknown>
  ): Partial<TemplatesSearch> => {
    const page = Number(search.page)
    return {
      ...(oneOf(TABS, search.tab, "starter") !== "starter"
        ? { tab: oneOf(TABS, search.tab, "starter") }
        : {}),
      ...(typeof search.q === "string" && search.q ? { q: search.q } : {}),
      ...(oneOf(SORTS, search.sort, "stars") !== "stars"
        ? { sort: oneOf(SORTS, search.sort, "stars") }
        : {}),
      ...(Number.isInteger(page) && page > 1 ? { page } : {}),
    }
  },
  loader: () => getModelSetupFn(),
  component: TemplatesRoute,
})

function TemplatesRoute() {
  const { slug } = Route.useParams()
  const {
    tab = "starter",
    q = "",
    sort = "stars",
    page = 1,
  } = Route.useSearch()
  const setup = Route.useLoaderData()
  return (
    <TemplatesPage
      slug={slug}
      initialSetup={setup}
      search={{ tab, q, sort, page }}
    />
  )
}
