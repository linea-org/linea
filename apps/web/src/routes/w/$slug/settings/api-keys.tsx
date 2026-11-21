import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { KeySquareIcon } from "lucide-react"

import { Button } from "@linealabs/ui/components/button"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linealabs/ui/components/empty"

import { ApiKeysTable, CreateApiKeyDialog } from "@/components/api-keys"
import { ListSkeleton } from "@/components/workspace/list-skeleton"
import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys"
import { shortcutTarget } from "@/components/shortcuts/shortcut-target"
import { PageToolbar } from "@/components/workspace/page-toolbar"
import { apiKeysQueryOptions } from "@/lib/api-keys-api"

export const Route = createFileRoute("/w/$slug/settings/api-keys")({
  component: ApiKeysPage,
})

function ApiKeysPage() {
  const { slug } = Route.useParams()
  const [createOpen, setCreateOpen] = useState(false)
  const { data: keys, isPending, error } = useQuery(apiKeysQueryOptions(slug))
  let content
  if (isPending) content = <ListSkeleton />
  else if (error)
    content = <p className="text-sm text-destructive">{error.message}</p>
  else if (keys.length === 0) {
    content = (
      <Empty className="w-auto">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <KeySquareIcon />
          </EmptyMedia>
          <EmptyTitle>No API keys yet</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  } else content = <ApiKeysTable slug={slug} keys={keys} />
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4 p-4">
      <PageToolbar>
        <div className="ml-auto">
          <Button
            onClick={() => setCreateOpen(true)}
            {...shortcutTarget("create")}
          >
            Create key
            <ShortcutKeys id="create" onPrimary />
          </Button>
        </div>
      </PageToolbar>
      {content}
      <CreateApiKeyDialog
        slug={slug}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </main>
  )
}
