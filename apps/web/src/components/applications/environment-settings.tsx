import { Card } from "@linea/ui/components/card"
import type { EnvironmentSummary } from "@/lib/environments-api"
import type { WorkflowSummary } from "@/lib/workflows-api"
import { InfoTip } from "./info-tip"
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
    description: "Published workflow versions this environment runs.",
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
    description:
      "Company integrations belong to this Environment. Assign requester access and reviewer authority separately; each reviewer signs in as a real customer user.",
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
    description:
      "Allow your server to access this Environment. Human approvals require a verified user session.",
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
    description:
      "Configure sign-in and allowed origins, separated by commas. Updating trust revokes existing user sessions.",
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

export function EnvironmentSettings(props: Readonly<EnvironmentSettingsProps>) {
  const { environment } = props
  const name = environmentName(environment.environment)
  return (
    <section aria-label={`${name} Environment`} className="flex flex-col gap-4">
      {sections.map((section) => (
        <section key={section.label} className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 pl-1">
            <h3 className="text-base font-medium">{section.label}</h3>
            <InfoTip label={section.label} text={section.description} />
          </div>
          <Card size="sm" className="flex flex-col gap-4 px-(--card-spacing)">
            {section.content(props)}
          </Card>
        </section>
      ))}
    </section>
  )
}
