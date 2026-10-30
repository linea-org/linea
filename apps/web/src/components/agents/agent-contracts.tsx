import type { AgentContract } from "@/lib/agent-schemas"
import { AgentContractForm } from "./agent-contract-form"

export function AgentContracts({
  agentId,
  contracts,
  archived,
  onSaved,
}: {
  agentId: string
  contracts: AgentContract[]
  archived: boolean
  onSaved: () => Promise<void>
}) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Public Contracts</h2>
        {contracts.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No Contract revisions yet. Create one to save your first definition
            version.
          </p>
        )}
        {contracts.map((contract) => (
          <details key={contract.id} className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Revision {contract.revision}
            </summary>
            <div className="mt-3 grid min-w-0 gap-4 sm:grid-cols-2">
              {(
                ["inputSchema", "outputSchema"] satisfies (
                  | "inputSchema"
                  | "outputSchema"
                )[]
              ).map((name) => (
                <div key={name} className="min-w-0">
                  <h3 className="mb-2 text-sm text-muted-foreground">
                    {name === "inputSchema" ? "Input" : "Output"}
                  </h3>
                  <pre className="overflow-auto rounded-md bg-surface-canvas p-3 text-xs">
                    {JSON.stringify(contract[name], null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </details>
        ))}
      </section>
      {!archived && <AgentContractForm agentId={agentId} onSaved={onSaved} />}
    </div>
  )
}
