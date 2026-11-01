import { Link, createFileRoute } from "@tanstack/react-router"
import { KeyIcon } from "lucide-react"

import { buttonVariants } from "@linea/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linea/ui/components/empty"

import { PageToolbar } from "@/components/workspace/page-toolbar"

export const Route = createFileRoute("/w/$slug/settings/secrets")({
  component: SecretsPage,
})

function SecretsPage() {
  const { slug } = Route.useParams()
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <PageToolbar className="border-b border-border/70">
        <div className="ml-auto">
          <Link
            to="/w/$slug/applications"
            params={{ slug }}
            className={buttonVariants({ size: "xs" })}
          >
            Open Applications
          </Link>
        </div>
      </PageToolbar>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <KeyIcon />
          </EmptyMedia>
          <EmptyTitle>Environment secrets</EmptyTitle>
          <EmptyDescription>
            Manage provider keys inside an Application’s Development or
            Production environment.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  )
}
