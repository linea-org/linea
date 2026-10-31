import { useState } from "react"
import { Button } from "@linea/ui/components/button"
import { Field, FieldLabel } from "@linea/ui/components/field"
import {
  NativeSelect,
  NativeSelectOption,
} from "@linea/ui/components/native-select"
import { Badge } from "@linea/ui/components/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@linea/ui/components/sheet"
import type { EnvironmentSummary } from "@/lib/environments-api"
import type { WorkflowSummary } from "@/lib/workflows-api"
import { EnvironmentDeployments } from "./environment-deployments"
import { EnvironmentSecrets } from "./environment-secrets"
import { EnvironmentConnections } from "./environment-connections"
import { EnvironmentKeys } from "./environment-keys"
import { EnvironmentTrustForm } from "./environment-trust-form"
import { EnvironmentPreferences } from "./environment-preferences"

type EnvironmentSettingsProps = {
  workspaceSlug: string
  environment: EnvironmentSummary
  workflows: WorkflowSummary[]
  onSaved: () => Promise<void>
}

const sections = [
  {
    label: "Deployments",
    description: "Choose the published Workflow versions to use.",
    content: ({
      workspaceSlug,
      environment,
      workflows,
    }: EnvironmentSettingsProps) => (
      <EnvironmentDeployments
        workspaceSlug={workspaceSlug}
        environmentId={environment.id}
        workflows={workflows}
        enabled={environment.enabled}
      />
    ),
  },
  {
    label: "Connections",
    description: "Connect integrations and manage access.",
    content: ({ environment, onSaved }: EnvironmentSettingsProps) => (
      <EnvironmentConnections environment={environment} onSaved={onSaved} />
    ),
  },
  {
    label: "Secrets",
    description: "Manage AI provider keys and integration credentials.",
    content: ({ workspaceSlug, environment }: EnvironmentSettingsProps) => (
      <EnvironmentSecrets
        workspaceSlug={workspaceSlug}
        environmentId={environment.id}
      />
    ),
  },
  {
    label: "Backend keys",
    description: "Allow your server to access this Environment.",
    content: ({ workspaceSlug, environment }: EnvironmentSettingsProps) => (
      <EnvironmentKeys
        workspaceSlug={workspaceSlug}
        environmentId={environment.id}
        enabled={environment.enabled}
      />
    ),
  },
  {
    label: "User identity",
    description: "Configure sign-in and allowed origins for your users.",
    content: ({ environment, onSaved }: EnvironmentSettingsProps) => (
      <EnvironmentTrustForm environment={environment} onSaved={onSaved} />
    ),
  },
  {
    label: "Settings",
    description: "Manage retention and Environment status.",
    content: ({ environment, onSaved }: EnvironmentSettingsProps) => (
      <EnvironmentPreferences environment={environment} onSaved={onSaved} />
    ),
  },
]

export function EnvironmentSettings(props: EnvironmentSettingsProps) {
  const { environment } = props
  const name = environment.environment === "dev" ? "Development" : "Production"
  const [active, setActive] = useState(sections[0])
  return (
    <section
      aria-label={`${name} Environment`}
      className="overflow-hidden rounded-xl border bg-card"
    >
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-medium">{name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {environment.environment === "dev"
              ? "Build and test changes."
              : "Serve your users."}
          </p>
        </div>
        <Badge variant="outline">
          {environment.enabled ? "Enabled" : "Disabled"}
        </Badge>
      </div>
      <dl className="grid grid-cols-2 gap-4 px-4 py-4 text-xs">
        <div>
          <dt className="text-muted-foreground">User identity</dt>
          <dd className="mt-1">
            {environment.oidcIssuer ? "Configured" : "Not configured"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Content retention</dt>
          <dd className="mt-1">{environment.contentRetentionDays} days</dd>
        </div>
      </dl>
      <Sheet>
        <div className="border-t px-4 py-3">
          <SheetTrigger render={<Button variant="outline" size="sm" />}>
            Manage {name}
          </SheetTrigger>
        </div>
        <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
          <SheetHeader className="border-b pr-12">
            <SheetTitle>{name} Environment</SheetTitle>
            <SheetDescription>
              Manage deployments and configuration for this Environment.
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-w-0 flex-col gap-4 px-4 pb-6">
            <Field>
              <FieldLabel htmlFor={`${environment.id}-section`}>
                Section
              </FieldLabel>
              <NativeSelect
                id={`${environment.id}-section`}
                className="w-full"
                value={active.label}
                onChange={(event) => {
                  const section = sections.find(
                    (section) => section.label === event.target.value
                  )
                  if (section) setActive(section)
                }}
              >
                {sections.map((section) => (
                  <NativeSelectOption key={section.label} value={section.label}>
                    {section.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <div>
              <h3 className="text-sm font-medium">{active.label}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {active.description}
              </p>
            </div>
            <div key={active.label}>{active.content(props)}</div>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  )
}
