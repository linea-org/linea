import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linea/ui/components/select"
import { listAgentContractsFn } from "@/lib/agent-contracts-api"
import { listAgentsFn } from "@/lib/agents-api"

type Selection = { agentId: string; agentContractRevisionId: string }

export function AgentStepField({
  id,
  applicationId,
  value,
  revisionValue,
  onChange,
}: Readonly<{
  id: string
  applicationId: string
  value: string
  revisionValue: string
  onChange: (selection: Selection) => void
}>) {
  const agents = useQuery({
    queryKey: ["application-agents", applicationId],
    queryFn: () => listAgentsFn({ data: { applicationId } }),
  })
  const contracts = useQuery({
    queryKey: ["agent-contracts", value],
    queryFn: () => listAgentContractsFn({ data: { agentId: value } }),
    enabled: value !== "",
  })
  const revisions = [...(contracts.data ?? [])].sort(
    (a, b) => b.revision - a.revision
  )
  const newest = revisions[0]
  const hasRevision = revisions.some((item) => item.id === revisionValue)
  useEffect(() => {
    if (value && newest && !hasRevision)
      onChange({ agentId: value, agentContractRevisionId: newest.id })
  }, [value, newest, hasRevision, onChange])
  const error = agents.error ?? contracts.error
  if (error)
    return (
      <p role="alert" className="text-xs text-destructive">
        Could not load Agents: {error.message}
      </p>
    )
  const active = (agents.data ?? []).filter((agent) => !agent.archivedAt)
  const items = active.map((agent) => ({ label: agent.name, value: agent.id }))
  const revisionItems = revisions.map((item) => ({
    label: `Revision ${item.revision}`,
    value: item.id,
  }))
  return (
    <>
      <Select
        items={items}
        value={value || null}
        onValueChange={(next) => {
          if (typeof next === "string")
            onChange({ agentId: next, agentContractRevisionId: "" })
        }}
        modal={false}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue
            placeholder={
              agents.isPending ? "Loading Agents…" : "Choose an Agent"
            }
          />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {agents.data && items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          This Application has no active Agents yet. Add one from Applications.
        </p>
      ) : null}
      {value && contracts.data && revisionItems.length === 0 ? (
        <p role="alert" className="text-xs text-destructive">
          This Agent has no Contract yet. Add one first.
        </p>
      ) : null}
      {revisionItems.length > 0 ? (
        <>
          <Select
            items={revisionItems}
            value={revisionValue || null}
            onValueChange={(next) => {
              if (typeof next === "string")
                onChange({ agentId: value, agentContractRevisionId: next })
            }}
            modal={false}
          >
            <SelectTrigger
              id={`${id}-revision`}
              className="w-full"
              aria-label="Contract revision"
            >
              <SelectValue placeholder="Contract revision" />
            </SelectTrigger>
            <SelectContent>
              {revisionItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            The step runs only while the Agent is deployed with this Contract
            revision. Pick the one deployed in your Environments; a different
            deployment fails the step before the Agent runs.
          </p>
        </>
      ) : null}
      <p className="text-xs text-muted-foreground">
        The previous step's output is sent as the Agent's input. The Agent must
        be deployed and enabled in the Environment this Workflow runs in; the
        deployed version is pinned when the step starts.
      </p>
    </>
  )
}
