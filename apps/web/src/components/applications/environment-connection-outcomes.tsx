import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@linea/ui/components/button"
import { listEnvironmentConnectionOutcomesFn } from "@/lib/shared-connections-api"
export function EnvironmentConnectionOutcomes({
  environmentId,
}: {
  environmentId: string
}) {
  const [cursorHistory, setCursorHistory] = useState<(string | undefined)[]>([
    undefined,
  ])
  const cursor = cursorHistory.at(-1)
  const { data, error, isFetching } = useQuery({
    queryKey: ["connection-outcomes", environmentId, cursor],
    queryFn: () =>
      listEnvironmentConnectionOutcomesFn({ data: { environmentId, cursor } }),
    refetchInterval: 15_000,
  })
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-medium">Connection activity and approval outcomes</h3>
      {data?.data.length === 0 && (
        <p className="text-sm text-muted-foreground">No recorded activity.</p>
      )}
      {data?.data.map((event) => (
        <div className="rounded border p-2 text-sm" key={event.id}>
          <p>
            {event.display?.title ?? event.type} · {event.outcome ?? event.type}
          </p>
          <p className="text-xs text-muted-foreground">
            {new Date(event.occurredAt).toLocaleString()} · Connection{" "}
            {event.connectionId}
          </p>
          {event.digest && (
            <p className="font-mono text-xs break-all text-muted-foreground">
              Reviewed digest: {event.digest}
            </p>
          )}
        </div>
      ))}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={cursorHistory.length === 1 || isFetching}
          onClick={() => setCursorHistory([undefined])}
        >
          Latest
        </Button>
        <Button
          variant="outline"
          disabled={cursorHistory.length === 1 || isFetching}
          onClick={() => setCursorHistory((history) => history.slice(0, -1))}
        >
          Newer activity
        </Button>
        <Button
          variant="outline"
          disabled={!data?.nextCursor || isFetching}
          onClick={() => {
            const nextCursor = data?.nextCursor
            if (nextCursor)
              setCursorHistory((history) => [...history, nextCursor])
          }}
        >
          Older activity
        </Button>
      </div>
    </section>
  )
}
