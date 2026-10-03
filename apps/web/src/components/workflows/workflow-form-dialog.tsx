import { useState, type ReactElement } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery } from "@tanstack/react-query"
import { z } from "zod"

import { Button } from "@linea/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@linea/ui/components/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"
import { Textarea } from "@linea/ui/components/textarea"

import { slugify } from "@/lib/auth-redirect"
import { type WorkflowSummary } from "@/lib/workflows-api"

import { applicationsQueryOptions } from "@/lib/applications-api"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linea/ui/components/select"

const schema = z.object({
  applicationId: z.uuid("Select an Application"),
  name: z.string().min(1, "Name is required"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and hyphens"
    ),
  description: z.string().max(2000).optional(),
})
type FormValues = z.infer<typeof schema>

type WorkflowFormDialogProps = {
  workspaceSlug: string
  // Omit trigger for a fully externally-controlled dialog (open/onOpenChange) — e.g. opened from a context menu item, where nesting a DialogTrigger inside a menu item's own click-to-close behavior is unreliable.
  trigger?: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title: string
  submitLabel: string
  defaultValues?: FormValues
  onSubmit: (values: FormValues) => Promise<WorkflowSummary>
  onSuccess: (workflow: WorkflowSummary) => void | Promise<void>
}

export function WorkflowFormDialog({
  workspaceSlug,
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  title,
  submitLabel,
  defaultValues,
  onSubmit,
  onSuccess,
}: WorkflowFormDialogProps) {
  const { data: applications = [], error: applicationsError } = useQuery(
    applicationsQueryOptions(workspaceSlug)
  )
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = setControlledOpen ?? setUncontrolledOpen
  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues ?? {
      applicationId: "",
      name: "",
      slug: "",
      description: "",
    },
  })
  const name = watch("name")
  const mutation = useMutation({
    mutationFn: onSubmit,
    onSuccess: async (workflow) => {
      setOpen(false)
      reset()
      await onSuccess(workflow)
    },
  })
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          reset(defaultValues ?? { name: "", slug: "", description: "" })
          mutation.reset()
        }
      }}
    >
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            void handleSubmit((values) => mutation.mutate(values))(e)
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel>Application</FieldLabel>
              <Controller
                name="applicationId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={!!defaultValues}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select an Application" />
                    </SelectTrigger>
                    <SelectContent>
                      {applications.map((application) => (
                        <SelectItem key={application.id} value={application.id}>
                          {application.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError>
                {errors.applicationId?.message ?? applicationsError?.message}
              </FieldError>
              {applications.length === 0 && !applicationsError && (
                <p className="text-sm text-muted-foreground">
                  Create an Application before adding a Workflow.
                </p>
              )}
            </Field>
            <Field data-invalid={!!errors.name || undefined}>
              <FieldLabel htmlFor="workflow-name">Name</FieldLabel>
              <Input
                id="workflow-name"
                placeholder="Order fulfillment"
                autoFocus
                {...register("name", {
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                    setValue("slug", slugify(e.target.value)),
                })}
              />
              <FieldError>{errors.name?.message}</FieldError>
            </Field>
            <Field data-invalid={!!errors.slug || undefined}>
              <FieldLabel htmlFor="workflow-slug">Slug</FieldLabel>
              <Input
                id="workflow-slug"
                placeholder={slugify(name) || "order-fulfillment"}
                {...register("slug")}
              />
              <FieldError>{errors.slug?.message}</FieldError>
            </Field>
            <Field data-invalid={!!errors.description || undefined}>
              <FieldLabel htmlFor="workflow-description">
                Description
              </FieldLabel>
              <Textarea
                id="workflow-description"
                placeholder="What does this workflow do?"
                rows={3}
                {...register("description")}
              />
              <FieldError>{errors.description?.message}</FieldError>
            </Field>
          </FieldGroup>
          {mutation.isError && (
            <p className="mt-3 text-xs text-destructive">
              {mutation.error.message}
            </p>
          )}
          <DialogFooter className="mt-6">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
