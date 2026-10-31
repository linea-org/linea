import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { z } from "zod"
import { PlusIcon } from "lucide-react"
import { Button } from "@linea/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@linea/ui/components/dialog"
import { Field, FieldError, FieldLabel } from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"
import { Textarea } from "@linea/ui/components/textarea"
import { createAgentInputSchema, type AgentSummary } from "@/lib/agent-schemas"
import { createAgentFn } from "@/lib/agents-api"

export function CreateAgentDialog({
  applicationId,
  onCreated,
}: {
  applicationId: string
  onCreated: (agent: AgentSummary) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof createAgentInputSchema>>({
    resolver: zodResolver(createAgentInputSchema),
    defaultValues: { applicationId, name: "", slug: "", description: "" },
  })
  const create = useMutation({
    mutationFn: (data: z.infer<typeof createAgentInputSchema>) =>
      createAgentFn({ data }),
    onSuccess: async (agent) => {
      await onCreated(agent)
      setOpen(false)
      reset()
    },
  })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <PlusIcon />
        Create Agent
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Agent</DialogTitle>
          <DialogDescription>
            This Agent belongs to this Application. Define its public Contract
            and publish a version before deploying it.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            void handleSubmit((data) => create.mutate(data))(event)
          }}
          className="flex flex-col gap-4"
        >
          <Field>
            <FieldLabel htmlFor="agent-name">Name</FieldLabel>
            <Input id="agent-name" autoFocus {...register("name")} />
            <FieldError>{errors.name?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="agent-slug">Slug</FieldLabel>
            <Input
              id="agent-slug"
              placeholder="github-issue-analyst"
              {...register("slug")}
            />
            <FieldError>{errors.slug?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="agent-description">Description</FieldLabel>
            <Textarea
              id="agent-description"
              rows={3}
              {...register("description")}
            />
            <FieldError>{errors.description?.message}</FieldError>
          </Field>
          {create.error && (
            <p role="alert" className="text-sm text-destructive">
              {create.error.message}
            </p>
          )}
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create Agent"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
