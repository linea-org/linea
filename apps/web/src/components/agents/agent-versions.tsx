import { useMutation } from "@tanstack/react-query"
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
}: {
  agentId: string
  versions: AgentVersion[]
  contracts: AgentContract[]
  archived: boolean
  onLoad: (version: AgentVersion) => void
  onPublished: () => Promise<void>
}) {
  const publish = useMutation({
    mutationFn: (versionId: string) =>
      publishAgentVersionFn({ data: { agentId, versionId } }),
    onSuccess: onPublished,
  })
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-semibold">Definition versions</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Inspect a saved version before publishing it. Publishing makes it
          available for deployment; it does not update any Environment.
        </p>
      </div>
      {versions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No versions yet. Save a definition to review and publish it here.
        </p>
      )}
      {versions.map((version) => (
        <article
          key={version.id}
          className="flex flex-col gap-3 rounded-lg border p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">
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
          <p className="text-sm text-muted-foreground">
            {version.definition.model} · {version.definition.maxIterations}{" "}
            iterations · {version.definition.tools.length} tools
          </p>
          <details>
            <summary className="cursor-pointer text-sm">
              Inspect definition
            </summary>
            <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-surface-canvas p-3 text-xs break-words whitespace-pre-wrap">
              {JSON.stringify(version.definition, null, 2)}
            </pre>
          </details>
          {!archived && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onLoad(version)}
              >
                Use as new version
              </Button>
              {!version.publishedAt && (
                <Button
                  type="button"
                  size="sm"
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
        <p role="alert" className="text-sm text-destructive">
          {publish.error.message}
        </p>
      )}
      {publish.isSuccess && (
        <p role="status" className="text-sm text-muted-foreground">
          Version published. Choose an Environment to deploy it.
        </p>
      )}
    </section>
  )
}
