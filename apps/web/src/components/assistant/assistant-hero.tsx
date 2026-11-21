import { Link, useNavigate } from "@tanstack/react-router"
import {
  FileTextIcon,
  GlobeIcon,
  HistoryIcon,
  LightbulbIcon,
  WorkflowIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@linealabs/ui/components/badge"
import { Button } from "@linealabs/ui/components/button"

import { StarterTemplateGrid } from "@/components/templates/starter-template-grid"
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
    <section className="pb-12">
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

function RunContext({
  slug,
  runId,
}: Readonly<{ slug: string; runId: string }>) {
  const navigate = useNavigate({ from: "/w/$slug/assistant" })
  return (
    <Badge variant="secondary" className="mb-2 gap-1 pr-1">
      <Link
        to="/w/$slug/executions/$executionId"
        params={{ slug, executionId: runId }}
        className="inline-flex items-center gap-1"
      >
        <HistoryIcon className="size-3" />
        Run {runId.slice(0, 8)}
      </Link>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Remove run context"
        className="size-4 rounded-full"
        onClick={() =>
          void navigate({
            search: (prev) => ({ ...prev, run: undefined }),
            replace: true,
          })
        }
      >
        <XIcon className="size-3" />
      </Button>
    </Badge>
  )
}

export function AssistantHero({
  slug,
  options,
  draft,
  onDraftChange,
  onSend,
  disabled,
  runId,
}: Readonly<{
  slug: string
  options: ComposerOptions
  draft: string
  onDraftChange: (value: string) => void
  onSend: (text: string) => void
  disabled: boolean
  runId: string | undefined
}>) {
  return (
    <div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-6xl flex-col px-4">
      <div className="my-auto flex flex-col py-12 pb-24">
        <h1 className="text-center text-xl font-semibold tracking-tight">
          What can I help with?
        </h1>
        <div className="mx-auto mt-8 w-full max-w-3xl">
          {runId ? <RunContext slug={slug} runId={runId} /> : null}
          <AssistantComposer
            hero
            value={draft}
            onChange={onDraftChange}
            onSend={onSend}
            disabled={disabled}
            placeholder="Ask anything, or describe what to build…"
            options={options}
          />
          <div className="mt-4 flex flex-wrap justify-center gap-1">
            {IDEAS.map(({ label, prompt, web, Icon }) => (
              <Button
                key={label}
                type="button"
                variant="ghost"
                className="text-muted-foreground"
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
        </div>
      </div>
      {options.model ? (
        <TemplateCards slug={slug} model={options.model.value} />
      ) : null}
    </div>
  )
}
