import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@linea/ui/components/accordion"
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
        {contracts.length === 0 ? (
          <div className="overflow-hidden rounded-xl border bg-card">
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              No contracts yet.
            </p>
          </div>
        ) : (
          <Accordion multiple>
            {contracts.map((contract) => (
              <AccordionItem key={contract.id} value={contract.id}>
                <AccordionTrigger>
                  Revision {contract.revision}
                </AccordionTrigger>
                <AccordionContent>
                  <div className="mt-3 grid min-w-0 gap-4 sm:grid-cols-2">
                    {(
                      ["inputSchema", "outputSchema"] satisfies (
                        | "inputSchema"
                        | "outputSchema"
                      )[]
                    ).map((name) => (
                      <div key={name} className="min-w-0">
                        <h3 className="mb-2 text-xs text-muted-foreground">
                          {name === "inputSchema" ? "Input" : "Output"}
                        </h3>
                        <pre className="overflow-auto rounded-md bg-surface-canvas p-3 text-xs">
                          {JSON.stringify(contract[name], null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </section>
      {!archived && <AgentContractForm agentId={agentId} onSaved={onSaved} />}
    </div>
  )
}
