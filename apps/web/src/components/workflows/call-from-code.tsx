import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { CircleCheckIcon, CircleIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"
import { Card } from "@linea/ui/components/card"
import { Tabs, TabsList, TabsTrigger } from "@linea/ui/components/tabs"

import { CreateApiKeyDialog } from "@/components/api-keys"
import { CopyButton } from "@/components/copy-button"
import type { WorkflowSummary } from "@/lib/workflows-api"
import {
  callSnippet,
  snippetLanguages,
  type SnippetLanguage,
} from "./call-from-code-snippets"
import { useCallReadiness } from "./use-call-readiness"

function Step({
  done,
  label,
  action,
}: Readonly<{ done: boolean; label: string; action: React.ReactNode }>) {
  return (
    <li className="flex min-h-8 items-center gap-2 text-sm">
      {done ? (
        <CircleCheckIcon className="size-4 text-primary" />
      ) : (
        <CircleIcon className="size-4 text-muted-foreground" />
      )}
      <span className="mr-auto">{label}</span>
      {done ? null : action}
    </li>
  )
}

export function CallFromCode({
  slug,
  workflow,
}: Readonly<{ slug: string; workflow: WorkflowSummary }>) {
  const [language, setLanguage] = useState<SnippetLanguage>("curl")
  const [keyOpen, setKeyOpen] = useState(false)
  const { pending, published, deployed } = useCallReadiness(slug, workflow)
  const ready = published && deployed
  const snippet = callSnippet(language, workflow.id)
  let content: React.ReactNode = null
  if (!pending && ready) {
    content = (
      <Card size="sm" className="py-0">
        <pre className="overflow-x-auto p-3 font-mono text-sm">{snippet}</pre>
      </Card>
    )
  } else if (!pending) {
    content = (
      <Card size="sm" className="px-(--card-spacing)">
        <ol className="flex flex-col">
          <Step
            done={published}
            label="Publish a version"
            action={
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={
                  <Link
                    to="/w/$slug/workflows/$workflowId/builder"
                    params={{ slug, workflowId: workflow.id }}
                  />
                }
              >
                Open builder
              </Button>
            }
          />
          <Step
            done={deployed}
            label="Deploy to Dev with backend starts"
            action={
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={
                  <Link
                    to="/w/$slug/applications/$applicationId"
                    params={{ slug, applicationId: workflow.applicationId }}
                    search={{ view: "environments", environment: "dev" }}
                  />
                }
              >
                Open Dev
              </Button>
            }
          />
        </ol>
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-8 items-center justify-between gap-2 pl-1">
        <p className="text-base font-medium text-foreground">Call from code</p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setKeyOpen(true)}>
            Create API key
          </Button>
          {ready ? <CopyButton text={snippet} label="snippet" /> : null}
          {ready ? (
            <Tabs
              value={language}
              onValueChange={(value: SnippetLanguage) => setLanguage(value)}
            >
              <TabsList className="h-8!">
                {snippetLanguages.map((option) => (
                  <TabsTrigger key={option.value} value={option.value}>
                    {option.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : null}
        </div>
      </div>
      {content}
      <CreateApiKeyDialog
        slug={slug}
        open={keyOpen}
        onOpenChange={setKeyOpen}
        defaultAccess="run"
      />
    </div>
  )
}
