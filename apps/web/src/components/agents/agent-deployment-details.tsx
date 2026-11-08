import type { ReactNode } from "react"
import { RocketIcon } from "lucide-react"
import { Badge } from "@linea/ui/components/badge"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@linea/ui/components/accordion"
import type {
  AgentBinding,
  AgentContract,
  AgentVersion,
} from "@/lib/agent-schemas"
import type { EnvironmentSummary } from "@/lib/environments-api"
import { environmentName } from "@/components/applications/environment-settings"
import { formatDate } from "@/lib/format"

export function AgentDeploymentDetails({
  environment,
  binding,
  version,
  contract,
  archived,
  children,
}: Readonly<{
  environment: EnvironmentSummary
  binding: AgentBinding | undefined
  version: AgentVersion | undefined
  contract: AgentContract | undefined
  archived: boolean
  children: ReactNode
}>) {
  const status = !environment.enabled
    ? "Environment disabled"
    : binding
      ? binding.enabled
        ? "Enabled"
        : "Disabled"
      : "Not deployed"
  const details = [
    { label: "Environment", value: environmentName(environment.environment) },
    {
      label: "API Contract",
      value: contract ? `Revision ${contract.revision}` : "—",
    },
    { label: "Model", value: version?.definition.model ?? "—" },
    {
      label: "Tools",
      value: version ? `${version.definition.tools.length} allowed` : "—",
    },
    {
      label: "Iteration limit",
      value: version?.definition.maxIterations ?? "—",
    },
    {
      label: "Version published",
      value: version?.publishedAt ? formatDate(version.publishedAt) : "—",
    },
  ]
  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
        <h3 className="text-sm font-medium">Deployment details</h3>
        <Badge
          variant={
            binding?.enabled && environment.enabled ? "secondary" : "outline"
          }
        >
          {status}
        </Badge>
      </div>
      <div className="grid gap-6 p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-8 sm:p-6">
        <div className="flex flex-col items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted">
            <RocketIcon className="size-5 text-muted-foreground" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Deployed version</p>
            <p className="text-xl font-medium">
              {version
                ? `Version ${version.version}`
                : binding
                  ? "Version unavailable"
                  : "No version deployed"}
            </p>
            <p className="max-w-64 text-xs leading-relaxed text-muted-foreground">
              {binding
                ? binding.enabled && environment.enabled
                  ? "This version is pinned to the Environment."
                  : "This deployment is not accepting new requests."
                : "Publish a version, then select it in Deployment settings."}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-1 content-start gap-x-6 gap-y-5 min-[400px]:grid-cols-2">
          {details.map(({ label, value }) => (
            <div key={label} className="flex min-w-0 flex-col gap-1">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {archived && (
        <p
          role="note"
          className="border-t border-border px-5 py-3 text-xs leading-relaxed text-muted-foreground"
        >
          {binding?.enabled
            ? "This Agent is archived. Its version cannot be changed, but you can disable this deployment below."
            : "This Agent is archived. This deployment is read-only."}
        </p>
      )}
      {!environment.enabled && (
        <p
          role="note"
          className="border-t border-border px-5 py-3 text-xs text-muted-foreground"
        >
          This Environment is disabled. Deployment settings are read-only.
        </p>
      )}
      <Accordion
        defaultValue={
          !binding && !archived && environment.enabled ? ["settings"] : []
        }
        className="border-t border-border"
      >
        <AccordionItem value="settings" className="border-0">
          <AccordionTrigger className="rounded-none px-5 py-4">
            Deployment settings
          </AccordionTrigger>
          <AccordionContent keepMounted className="px-5 pb-5">
            <p className="mb-4 text-xs text-muted-foreground">
              {archived
                ? "Archived Agents cannot be moved to another version or enabled again."
                : "Select a published version and choose whether new requests can use it in this Environment."}
            </p>
            {children}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </article>
  )
}
