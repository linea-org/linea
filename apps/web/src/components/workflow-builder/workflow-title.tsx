import { useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { PencilIcon } from "lucide-react"
import { Button } from "@linea/ui/components/button"
import { Input } from "@linea/ui/components/input"
import {
  updateWorkflowFn,
  workflowQueryOptions,
  workflowsQueryOptions,
  type WorkflowSummary,
} from "@/lib/workflows-api"

export function WorkflowTitle({
  slug,
  workflow,
}: Readonly<{
  slug: string
  workflow: WorkflowSummary
}>) {
  const queryClient = useQueryClient()
  // An Escape-triggered blur must not save the cancelled name.
  const skipCommit = useRef(false)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(workflow.name)
  const rename = useMutation({
    mutationFn: (nextName: string) =>
      updateWorkflowFn({
        data: { id: workflow.id, name: nextName, slug: workflow.slug },
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(
        workflowQueryOptions(slug, workflow.id).queryKey,
        updated
      )
      await queryClient.invalidateQueries({
        queryKey: workflowsQueryOptions(slug).queryKey,
      })
      await queryClient.invalidateQueries({
        queryKey: ["application-workflows", slug, workflow.applicationId],
      })
      setEditing(false)
    },
  })
  function cancel() {
    skipCommit.current = true
    setName(workflow.name)
    setEditing(false)
  }
  function commit() {
    if (skipCommit.current) {
      skipCommit.current = false
      return
    }
    if (rename.isPending) return
    const nextName = name.trim()
    if (!nextName || nextName === workflow.name) {
      setName(workflow.name)
      setEditing(false)
      return
    }
    rename.mutate(nextName)
  }
  if (editing) {
    return (
      <form
        className="hidden items-center gap-2 lg:flex"
        onSubmit={(event) => {
          event.preventDefault()
          commit()
        }}
        onBlur={(event) => {
          const next = event.relatedTarget
          if (next instanceof Node && event.currentTarget.contains(next)) return
          commit()
        }}
      >
        <Input
          autoFocus
          aria-label="Workflow name"
          aria-invalid={rename.isError || undefined}
          value={name}
          maxLength={200}
          disabled={rename.isPending}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return
            event.preventDefault()
            cancel()
          }}
          className="h-8 w-48"
        />
        {rename.error ? (
          <span className="max-w-48 truncate text-xs text-destructive">
            {rename.error.message}
          </span>
        ) : null}
      </form>
    )
  }
  return (
    <div className="hidden items-center lg:flex">
      <span className="max-w-48 truncate px-2 text-xs font-medium">
        {workflow.name}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Edit workflow name"
        onClick={() => {
          skipCommit.current = false
          setName(workflow.name)
          setEditing(true)
        }}
      >
        <PencilIcon />
      </Button>
    </div>
  )
}
