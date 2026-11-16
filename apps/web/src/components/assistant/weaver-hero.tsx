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

const HERO_TEMPLATES = workflowTemplates.slice(0, 6)

function TemplateCards({ slug, model }: { slug: string; model: string }) {
  return (
    <section className="mt-12">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Templates</h2>
        <Button
          variant="ghost"
          size="xs"
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
