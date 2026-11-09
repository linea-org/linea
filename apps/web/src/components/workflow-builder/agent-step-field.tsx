import { useState } from "react"
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

export function AgentStepField({
  id,
  applicationId,
  value,
  onChange,
}: Readonly<{
  id: string
  applicationId: string
  value: string
  onChange: (selection: {
    agentId: string
    agentContractRevisionId: string
  }) => void
}>) {
  const [selectionError, setSelectionError] = useState<string>()
  async function select(agentId: string) {
    setSelectionError(undefined)
    try {
      const contracts = await listAgentContractsFn({ data: { agentId } })
      const latest = contracts.reduce<(typeof contracts)[number] | undefined>(
        (best, contract) =>
          !best || contract.revision > best.revision ? contract : best,
        undefined
      )
      if (!latest) {
        setSelectionError("This Agent has no Contract yet. Add one first.")
        return
      }
      onChange({ agentId, agentContractRevisionId: latest.id })
    } catch (cause) {
      setSelectionError(
        cause instanceof Error ? cause.message : "Could not load the Contract"
      )
    }
  }
  const agents = useQuery({
    queryKey: ["application-agents", applicationId],
    queryFn: () => listAgentsFn({ data: { applicationId } }),
  })
  if (agents.error)
    return (
      <p role="alert" className="text-xs text-destructive">
        Could not load Agents: {agents.error.message}
      </p>
    )
  const active = (agents.data ?? []).filter((agent) => !agent.archivedAt)
  const items = active.map((agent) => ({ label: agent.name, value: agent.id }))
  return (
    <>
      <Select
        items={items}
        value={value || null}
        onValueChange={(next) => {
          if (typeof next === "string") void select(next)
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
      {selectionError ? (
        <p role="alert" className="text-xs text-destructive">
          {selectionError}
        </p>
      ) : null}
      {agents.data && items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          This Application has no active Agents yet. Add one from Applications.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        The previous step's output is sent as the Agent's input. The Agent must
        be deployed and enabled in the Environment this Workflow runs in; the
        deployed version is pinned when the step starts.
      </p>
    </>
  )
}
