import { Link } from "@tanstack/react-router"
import {
  FileTextIcon,
  GlobeIcon,
  LightbulbIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@linea/ui/components/button"
import { Card, CardContent } from "@linea/ui/components/card"

import { ModelSetupForm } from "@/components/models/model-setup-form"
import { StarterTemplateGrid } from "@/components/templates/starter-template-grid"
import type { ModelSetup } from "@/lib/model-settings-api"
import { workflowTemplates } from "@/lib/workflow-templates"
import { AssistantComposer } from "./assistant-composer"
import type { ComposerOptions } from "./use-composer-options"

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

const HERO_TEMPLATES = workflowTemplates.slice(0, 8)

function TemplateCards({
  slug,
  model,
}: Readonly<{ slug: string; model: string }>) {
  return (
    <section className="mt-12">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">Templates</h2>
        <Button
          variant="ghost"
          nativeButton={false}
          render={
            <Link to="/w/$slug/templates" params={{ slug }} search={{}} />
          }
        >
          View all
        </Button>
      </div>
      <div className="mt-3">
        <StarterTemplateGrid
          slug={slug}
          model={model}
          templates={HERO_TEMPLATES}
        />
      </div>
    </section>
  )
}

export function AssistantHero({
  slug,
  setup,
  ready,
  options,
  draft,
  onDraftChange,
  onSend,
  disabled,
}: Readonly<{
  slug: string
  setup: ModelSetup
  ready: boolean
  options: ComposerOptions
  draft: string
  onDraftChange: (value: string) => void
  onSend: (text: string) => void
  disabled: boolean
}>) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12">
      <h1 className="text-center text-xl font-semibold tracking-tight">
        What can I help with?
      </h1>
      <div className="mx-auto mt-8 max-w-3xl">
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
          <Card size="sm" className="mx-auto max-w-md">
            <CardContent>
              <h2 className="mb-4 text-base font-medium">Choose a model</h2>
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
