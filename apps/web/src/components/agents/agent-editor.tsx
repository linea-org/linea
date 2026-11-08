import { useState } from "react"
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { Badge } from "@linea/ui/components/badge"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@linea/ui/components/tabs"
import { PageToolbar } from "@/components/workspace/page-toolbar"
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
    <>
      <Tabs value={tab} onValueChange={setTab} className="min-w-0 gap-0">
        <PageToolbar className="border-b border-border/70">
          {archived ? <Badge variant="outline">Archived</Badge> : null}
          <TabsList className="h-8!">
            <TabsTrigger value="definition">Definition</TabsTrigger>
            <TabsTrigger value="contracts">
              Contracts ({contracts.length})
            </TabsTrigger>
            <TabsTrigger value="versions">
              Versions ({versions.length})
            </TabsTrigger>
            <TabsTrigger value="deployments">Deployments</TabsTrigger>
          </TabsList>
        </PageToolbar>
        <div className="flex min-w-0 flex-col gap-4 px-4 py-4">
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
          <TabsContent value="contracts" keepMounted>
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
          <TabsContent value="deployments" keepMounted>
            <AgentEnvironmentDeployment
              workspaceSlug={workspaceSlug}
              agentId={agent.id}
              environments={environments}
              versions={versions}
              contracts={contracts}
              archived={archived}
            />
          </TabsContent>
        </div>
      </Tabs>
      <p className="px-4 pb-4 text-xs text-muted-foreground">
        Agent execution and trace inspection are not available yet.
      </p>
      <AgentVersionReplacement
        version={pendingVersion}
        onCancel={() => setPendingVersion(null)}
        onConfirm={loadVersion}
      />
    </>
  )
}
