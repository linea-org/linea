import { Badge } from "@linea/ui/components/badge"
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

export function environmentName(
  environment: EnvironmentSummary["environment"]
) {
  switch (environment) {
    case "dev":
      return "Development"
    case "production":
      return "Production"
    default: {
      const unreachable: never = environment
      return unreachable
    }
  }
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
  const name = environmentName(environment.environment)
  return (
    <section aria-label={`${name} Environment`} className="flex flex-col">
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
      {sections.map((section) => (
        <section
          key={section.label}
          className="flex flex-col gap-4 border-b px-4 py-4"
        >
          <div>
            <h3 className="text-sm font-medium">{section.label}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {section.description}
            </p>
          </div>
          {section.content(props)}
        </section>
      ))}
    </section>
  )
}
