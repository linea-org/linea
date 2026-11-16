import { useMemo } from "react"
import {
  FileTextIcon,
  GlobeIcon,
  LightbulbIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react"

import { workflowGraphSchema } from "@linea/runtime/browser"
import { Button } from "@linea/ui/components/button"
import { Card, CardContent } from "@linea/ui/components/card"
import { Spinner } from "@linea/ui/components/spinner"

import { ModelSetupForm } from "@/components/models/model-setup-form"
import { useCreateFromTemplate } from "@/components/workflows/use-create-from-template"
import type { ModelSetup } from "@/lib/model-settings-api"
import { workflowTemplates } from "@/lib/workflow-templates"
import { AssistantComposer } from "./assistant-composer"
import type { ComposerOptions } from "./use-composer-options"
import { WorkflowPreview } from "./workflow-preview"

type Idea = {
  label: string
  prompt: string
  web?: boolean
  Icon: LucideIcon
}

const IDEAS: Idea[] = [
  {
    label: "Summarize a web page",
    prompt: "Fetch https://news.ycombinator.com and summarize the top stories",
    web: true,
    Icon: GlobeIcon,
  },
  {
    label: "Build a support flow",
    prompt:
      "Build a workflow that takes an incoming support ticket, extracts its category and urgency, and routes it",
    Icon: WorkflowIcon,
  },
  {
    label: "Draft an update",
    prompt: "Draft a short weekly status update for my team",
    Icon: FileTextIcon,
  },
  {
    label: "Explain a node",
    prompt: "Explain how branch and merge nodes work, with an example",
    Icon: LightbulbIcon,
  },
]

function TemplateCards({ slug, model }: { slug: string; model: string }) {
  const create = useCreateFromTemplate(slug)
  const cards = useMemo(
    () =>
      workflowTemplates.map((template) => ({
        template,
        graph: workflowGraphSchema.parse(template.build(model)),
      })),
    [model]
  )
  return (
    <section className="mt-12">
      <h2 className="text-sm font-medium">Templates</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ template, graph }) => (
          <div key={template.id} className="flex flex-col gap-2">
            <Card
              render={
                <button
                  type="button"
                  disabled={create.isPending}
                  onClick={() => create.mutate(template.id)}
                />
              }
              className="pointer-events-auto relative h-40 cursor-pointer gap-0 bg-muted py-0 transition-shadow hover:ring-primary disabled:opacity-60"
            >
              <span className="pointer-events-none block h-full">
                <WorkflowPreview graph={graph} view="fit" />
              </span>
              {create.isPending && create.variables === template.id ? (
                <span className="absolute inset-0 grid place-items-center bg-background/60">
                  <Spinner />
                </span>
              ) : null}
            </Card>
            <span className="text-xs font-medium">{template.name}</span>
          </div>
        ))}
      </div>
      {create.isError ? (
        <p className="mt-3 text-xs text-destructive">{create.error.message}</p>
      ) : null}
    </section>
  )
}

export function WeaverHero({
  slug,
  setup,
  ready,
  options,
  draft,
  onDraftChange,
  onSend,
  disabled,
}: {
  slug: string
  setup: ModelSetup
  ready: boolean
  options: ComposerOptions
  draft: string
  onDraftChange: (value: string) => void
  onSend: (text: string) => void
  disabled: boolean
}) {
  return (
    <div className="mx-auto w-full max-w-[880px] px-4 py-12">
      <h1 className="text-center text-xl font-semibold tracking-tight">
        What can I help with?
      </h1>
      <div className="mt-8">
        {ready ? (
          <>
            <AssistantComposer
              hero
              value={draft}
              onChange={onDraftChange}
              onSend={onSend}
              disabled={disabled}
              placeholder="Ask anything, or describe what to build…"
              options={options}
            />
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {IDEAS.map(({ label, prompt, web, Icon }) => (
                <Button
                  key={label}
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={() => {
                    onDraftChange(prompt)
                    if (web) options.onWebChange(true)
                  }}
                >
                  <Icon />
                  {label}
                </Button>
              ))}
            </div>
          </>
        ) : (
          <Card size="sm" className="mx-auto max-w-[420px]">
            <CardContent>
              <h2 className="mb-4 text-sm font-medium">Choose a model</h2>
              <ModelSetupForm slug={slug} setup={setup} />
            </CardContent>
          </Card>
        )}
      </div>
      {ready && options.model ? (
        <TemplateCards slug={slug} model={options.model.value} />
      ) : null}
    </div>
  )
}
