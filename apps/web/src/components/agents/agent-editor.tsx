import { useState } from "react"
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@linea/ui/components/tabs"
import { listAgentContractsFn } from "@/lib/agent-contracts-api"
import { listAgentVersionsFn } from "@/lib/agents-api"
import type {
  AgentCatalog,
  AgentContract,
  AgentSummary,
  AgentVersion,
} from "@/lib/agent-schemas"
import type { EnvironmentSummary } from "@/lib/environments-api"
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
}: {
  workspaceSlug: string
  agent: AgentSummary
  catalog: AgentCatalog
  initialVersions: AgentVersion[]
  initialContracts: AgentContract[]
  environments: EnvironmentSummary[]
}) {
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
  const [tab, setTab] = useState<string>("definition")
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
    setTab("definition")
  }
  return (
    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Tabs value={tab} onValueChange={setTab} className="min-w-0 gap-4">
        <TabsList>
          <TabsTrigger value="definition">Definition</TabsTrigger>
          <TabsTrigger value="contracts">
            Contracts ({contracts.length})
          </TabsTrigger>
          <TabsTrigger value="versions">
            Versions ({versions.length})
          </TabsTrigger>
        </TabsList>
        <div className="min-w-0 rounded-xl border bg-card p-5">
          <TabsContent value="definition" keepMounted>
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
                  setTab("versions")
                }}
              />
            </fieldset>
          </TabsContent>
          <TabsContent value="contracts">
            <AgentContracts
              agentId={agent.id}
              contracts={contracts}
              archived={archived}
              onSaved={async () => {
                await queryClient.invalidateQueries({ queryKey: contractsKey })
              }}
            />
          </TabsContent>
          <TabsContent value="versions">
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
          </TabsContent>
        </div>
      </Tabs>
      <aside className="flex min-w-0 flex-col gap-4">
        <div>
          <h2 className="font-semibold">Environment deployments</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Each Environment pins a published version and its Contract revision
            independently.
          </p>
        </div>
        {environments.map((environment) => (
          <AgentEnvironmentDeployment
            key={environment.id}
            workspaceSlug={workspaceSlug}
            agentId={agent.id}
            environment={environment}
            versions={versions}
            contracts={contracts}
            archived={archived}
          />
        ))}
      </aside>
      <AgentVersionReplacement
        version={pendingVersion}
        onCancel={() => setPendingVersion(null)}
        onConfirm={loadVersion}
      />
    </div>
  )
}
