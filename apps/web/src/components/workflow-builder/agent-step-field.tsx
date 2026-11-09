import { useQuery } from "@tanstack/react-query"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linea/ui/components/select"
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
  onChange: (agentId: string) => void
}>) {
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
          if (typeof next === "string") onChange(next)
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
      <p className="text-xs text-muted-foreground">
        The previous step's output is sent as the Agent's input. The Agent must
        be deployed and enabled in the Environment this Workflow runs in; the
        deployed version is pinned when the step starts.
      </p>
    </>
  )
}
