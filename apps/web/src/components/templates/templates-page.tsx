import { useState, type MouseEvent } from "react"
import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { SearchIcon } from "lucide-react"

import { Card, CardContent } from "@linea/ui/components/card"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@linea/ui/components/input-group"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@linea/ui/components/pagination"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linea/ui/components/select"
import { Tabs, TabsList, TabsTrigger } from "@linea/ui/components/tabs"

import { useComposerOptions } from "@/components/assistant/use-composer-options"
import { ModelSetupForm } from "@/components/models/model-setup-form"
import {
  modelSetupQueryOptions,
  type ModelSetup,
} from "@/lib/model-settings-api"
import { paginate } from "@/lib/paginate"
import {
  sharedTemplatesQueryOptions,
  type SharedTemplateSort,
} from "@/lib/templates-api"
import { workflowTemplates } from "@/lib/workflow-templates"
import { SharedTemplateGrid } from "./shared-template-grid"
import { StarterTemplateGrid } from "./starter-template-grid"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@linea/ui/components/empty"
import { ListSkeleton } from "@/components/workspace/list-skeleton"

export type TemplateTab = "starter" | "workspace" | "public"

export type TemplatesSearch = {
  tab: TemplateTab
  q: string
  sort: SharedTemplateSort
  page: number
}

const PAGE_SIZE = 9

const SORT_LABELS: Record<SharedTemplateSort, string> = {
  stars: "Most starred",
  used: "Most used",
  new: "Newest",
}

function matchesStarter(query: string) {
  const needle = query.trim().toLowerCase()
  return workflowTemplates.filter(
    (template) =>
      template.name.toLowerCase().includes(needle) ||
      template.description.toLowerCase().includes(needle)
  )
}

/** Only what differs from the defaults goes in the address. */
function toSearch(next: TemplatesSearch) {
  return {
    ...(next.tab !== "starter" ? { tab: next.tab } : {}),
    ...(next.q ? { q: next.q } : {}),
    ...(next.sort !== "stars" ? { sort: next.sort } : {}),
    ...(next.page > 1 ? { page: next.page } : {}),
  }
}

function Pager({
  slug,
  search,
  page,
  pageCount,
  onGo,
}: Readonly<{
  slug: string
  search: TemplatesSearch
  page: number
  pageCount: number
  onGo: (page: number) => void
}>) {
  if (pageCount <= 1) return null
  // A real address so the link opens in a new tab; a plain click navigates in place.
  const link = (target: number) => {
    const disabled = target < 1 || target > pageCount
    const params = new URLSearchParams(
      toSearch({ ...search, page: target }) as Record<string, string>
    )
    return {
      href: disabled ? undefined : `/w/${slug}/templates?${params}`,
      "aria-disabled": disabled,
      onClick: (event: MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault()
        if (!disabled) onGo(target)
      },
    }
  }
  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious {...link(page - 1)} />
        </PaginationItem>
        <PaginationItem className="px-2 text-sm text-muted-foreground tabular-nums">
          {page} / {pageCount}
        </PaginationItem>
        <PaginationItem>
          <PaginationNext {...link(page + 1)} />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}

function SharedTab({
  slug,
  search,
  text,
  onGo,
}: Readonly<{
  slug: string
  search: TemplatesSearch & { tab: "workspace" | "public" }
  text: string
  onGo: (page: number) => void
}>) {
  const { data, error } = useQuery(
    sharedTemplatesQueryOptions(slug, {
      scope: search.tab,
      q: text,
      sort: search.sort,
      page: search.page,
    })
  )
  if (error) return <p className="text-sm text-destructive">{error.message}</p>
  if (!data) return <ListSkeleton />
  return (
    <>
      {data.items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>
              {text ? `No templates match “${text}”` : "Nothing published yet"}
            </EmptyTitle>
            {!text && search.tab === "workspace" ? (
              <EmptyDescription>
                Open a workflow and share it as a template.
              </EmptyDescription>
            ) : null}
          </EmptyHeader>
        </Empty>
      ) : (
        <SharedTemplateGrid slug={slug} templates={data.items} />
      )}
      <Pager
        slug={slug}
        search={search}
        page={search.page}
        pageCount={Math.max(1, Math.ceil(data.total / data.pageSize))}
        onGo={onGo}
      />
    </>
  )
}

function StarterTab({
  slug,
  setup,
  search,
  text,
  onGo,
}: Readonly<{
  slug: string
  setup: ModelSetup
  search: TemplatesSearch
  text: string
  onGo: (page: number) => void
}>) {
  const { model } = useComposerOptions(setup)
  const current = paginate(matchesStarter(text), search.page, PAGE_SIZE)
  if (!model) {
    return (
      <Card size="sm" className="max-w-md">
        <CardContent>
          <h2 className="mb-4 text-base font-medium">Choose a model</h2>
          <ModelSetupForm slug={slug} setup={setup} />
        </CardContent>
      </Card>
    )
  }
  return (
    <>
      {current.items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{`No templates match “${text}”`}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <StarterTemplateGrid
          slug={slug}
          model={model.value}
          templates={current.items}
        />
      )}
      <Pager
        slug={slug}
        search={search}
        page={current.page}
        pageCount={current.pageCount}
        onGo={onGo}
      />
    </>
  )
}

export function TemplatesPage({
  slug,
  initialSetup,
  search,
}: Readonly<{
  slug: string
  initialSetup: ModelSetup
  search: TemplatesSearch
}>) {
  const navigate = useNavigate()
  const { data: setup } = useSuspenseQuery({
    ...modelSetupQueryOptions(slug),
    initialData: initialSetup,
  })
  // Typing stays instant; the address follows so a search can be shared.
  const [text, setText] = useState(search.q)
  const go = (next: Partial<TemplatesSearch>, replace = false) =>
    void navigate({
      to: "/w/$slug/templates",
      params: { slug },
      search: toSearch({ ...search, q: text, page: 1, ...next }),
      replace,
    })
  return (
    <main className="flex w-full flex-col gap-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={search.tab}
          onValueChange={(tab) => go({ tab: tab as TemplateTab })}
        >
          <TabsList>
            <TabsTrigger value="starter">Starter</TabsTrigger>
            <TabsTrigger value="workspace">Yours</TabsTrigger>
            <TabsTrigger value="public">Community</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          {search.tab === "starter" ? null : (
            <Select
              value={search.sort}
              onValueChange={(sort) => go({ sort: sort as SharedTemplateSort })}
            >
              <SelectTrigger className="w-36" aria-label="Sort templates">
                <SelectValue>
                  {(value: SharedTemplateSort) => SORT_LABELS[value]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SORT_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <InputGroup className="w-56">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Search templates"
              placeholder="Search"
              value={text}
              onChange={(event) => {
                setText(event.target.value)
                go({ q: event.target.value }, true)
              }}
            />
          </InputGroup>
        </div>
      </div>
      {search.tab === "starter" ? (
        <StarterTab
          slug={slug}
          setup={setup}
          search={search}
          text={text}
          onGo={(page) => go({ page })}
        />
      ) : (
        <SharedTab
          slug={slug}
          search={{ ...search, tab: search.tab }}
          text={text}
          onGo={(page) => go({ page })}
        />
      )}
    </main>
  )
}
