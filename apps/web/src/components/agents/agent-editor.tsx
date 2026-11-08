import { useState } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { listAgentContractsFn } from "@/lib/agent-contracts-api"
import { listAgentVersionsFn } from "@/lib/agents-api"
import type {
  AgentCatalog,
  AgentContract,
  AgentSummary,
  AgentVersion,
} from "@/lib/agent-schemas"
import type { EnvironmentSummary } from "@/lib/environments-api"
import { AgentPageHeader } from "./agent-page-header"
import { type AgentSection } from "./agent-sections"
import { AgentDefinitionForm } from "./agent-definition-form"
import { AgentContracts } from "./agent-contracts"
import { AgentVersions } from "./agent-versions"
import { AgentEnvironmentDeployment } from "./agent-environment-deployment"
import { AgentVersionReplacement } from "./agent-version-replacement"

export function AgentEditor({
  workspaceSlug,
  agent,
  catalog,
  initialVersions,
  initialContracts,
  environments,
}: Readonly<{
  workspaceSlug: string
  agent: AgentSummary
  catalog: AgentCatalog
  initialVersions: AgentVersion[]
  initialContracts: AgentContract[]
  environments: EnvironmentSummary[]
}>) {
  const queryClient = useQueryClient()
  const versionsKey = ["agent-versions", workspaceSlug, agent.id]
  const contractsKey = ["agent-contracts", workspaceSlug, agent.id]
  const { data: versions } = useSuspenseQuery({
    queryKey: versionsKey,
    queryFn: () => listAgentVersionsFn({ data: { agentId: agent.id } }),
    initialData: initialVersions,
  })
  const { data: contracts } = useSuspenseQuery({
    queryKey: contractsKey,
    queryFn: () => listAgentContractsFn({ data: { agentId: agent.id } }),
    initialData: initialContracts,
  })
  const [sourceVersion, setSourceVersion] = useState<AgentVersion | null>(
    versions[0] ?? null
  )
  const { section = "configuration" } = useSearch({
    from: "/w/$slug/agents/$agentId",
  })
  const navigate = useNavigate({ from: "/w/$slug/agents/$agentId" })
  function setSection(next: AgentSection) {
    void navigate({ search: { section: next } })
  }
  const [editorRevision, setEditorRevision] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [pendingVersion, setPendingVersion] = useState<AgentVersion | null>(
    null
  )
  const archived = agent.archivedAt !== null
  function loadVersion(version: AgentVersion) {
    setSourceVersion(version)
    setEditorRevision((revision) => revision + 1)
    setPendingVersion(null)
    setSection("configuration")
  }
  return (
    <div className="min-w-0">
      <AgentPageHeader
        workspaceSlug={workspaceSlug}
        agent={agent}
        section={section}
        environments={environments}
      />
      <div className="flex min-w-0 flex-col gap-4 p-4">
        <section
          aria-label="Configuration"
          hidden={section !== "configuration"}
        >
          <fieldset disabled={archived}>
            <AgentDefinitionForm
              key={`${sourceVersion?.id}-${editorRevision}`}
              agentId={agent.id}
              catalog={catalog}
              contracts={contracts}
              sourceVersion={sourceVersion}
              onDirtyChange={setDirty}
              onSaved={async (version) => {
                await queryClient.invalidateQueries({ queryKey: versionsKey })
                setSourceVersion(version)
                setSection("versions")
              }}
            />
          </fieldset>
        </section>
        <section aria-label="API Contract" hidden={section !== "contracts"}>
          <AgentContracts
            agentId={agent.id}
            contracts={contracts}
            archived={archived}
            onSaved={async () => {
              await queryClient.invalidateQueries({ queryKey: contractsKey })
            }}
          />
        </section>
        <section aria-label="Versions" hidden={section !== "versions"}>
          <AgentVersions
            agentId={agent.id}
            versions={versions}
            contracts={contracts}
            archived={archived}
            onPublished={async () => {
              await queryClient.invalidateQueries({ queryKey: versionsKey })
            }}
            onLoad={(version) => {
              if (dirty) setPendingVersion(version)
              else loadVersion(version)
            }}
          />
        </section>
        <section aria-label="Deployments" hidden={section !== "deployments"}>
          <AgentEnvironmentDeployment
            workspaceSlug={workspaceSlug}
            agentId={agent.id}
            environments={environments}
            versions={versions}
            contracts={contracts}
            archived={archived}
          />
        </section>
      </div>
      <AgentVersionReplacement
        version={pendingVersion}
        onCancel={() => setPendingVersion(null)}
        onConfirm={loadVersion}
      />
    </div>
  )
}
