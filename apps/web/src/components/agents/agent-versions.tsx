import { useMutation } from "@tanstack/react-query"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@linea/ui/components/accordion"
import { Button } from "@linea/ui/components/button"
import { Badge } from "@linea/ui/components/badge"
import { publishAgentVersionFn } from "@/lib/agents-api"
import type { AgentContract, AgentVersion } from "@/lib/agent-schemas"

export function AgentVersions({
  agentId,
  versions,
  contracts,
  archived,
  onLoad,
  onPublished,
}: Readonly<{
  agentId: string
  versions: AgentVersion[]
  contracts: AgentContract[]
  archived: boolean
  onLoad: (version: AgentVersion) => void
  onPublished: () => Promise<void>
}>) {
  const publish = useMutation({
    mutationFn: (versionId: string) =>
      publishAgentVersionFn({ data: { agentId, versionId } }),
    onSuccess: onPublished,
  })
  return (
    <section className="flex flex-col gap-4">
      {versions.length === 0 ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">
            No versions yet.
          </p>
        </div>
      ) : null}
      {versions.map((version) => (
        <article
          key={version.id}
          className="flex flex-col gap-3 rounded-lg border p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-medium">
              Version {version.version} · Contract revision{" "}
              {
                contracts.find(
                  (contract) => contract.id === version.agentContractRevisionId
                )?.revision
              }
            </h3>
            <Badge variant={version.publishedAt ? "secondary" : "outline"}>
              {version.publishedAt ? "Published" : "Unpublished"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {version.definition.model} · {version.definition.maxIterations}{" "}
            iterations · {version.definition.tools.length} tools
          </p>
          <Accordion>
            <AccordionItem value="definition">
              <AccordionTrigger>Inspect definition</AccordionTrigger>
              <AccordionContent>
                <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-surface-canvas p-3 text-xs break-words whitespace-pre-wrap">
                  {JSON.stringify(version.definition, null, 2)}
                </pre>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          {!archived && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => onLoad(version)}
              >
                Use as new version
              </Button>
              {!version.publishedAt && (
                <Button
                  type="button"
                  size="xs"
                  disabled={publish.isPending}
                  onClick={() => publish.mutate(version.id)}
                >
                  {publish.isPending && publish.variables === version.id
                    ? "Publishing…"
                    : `Publish version ${version.version}`}
                </Button>
              )}
            </div>
          )}
        </article>
      ))}
      {publish.error && (
        <p role="alert" className="text-xs text-destructive">
          {publish.error.message}
        </p>
      )}
      {publish.isSuccess && (
        <output className="block text-xs text-muted-foreground">
          Version published. Choose an Environment to deploy it.
        </output>
      )}
    </section>
  )
}
