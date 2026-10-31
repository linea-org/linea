import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"
import { z } from "zod"
import { Button } from "@linea/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@linea/ui/components/dialog"
import { Field, FieldError, FieldLabel } from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"
import {
  applicationsQueryOptions,
  createApplicationFn,
  createApplicationInputSchema,
} from "@/lib/applications-api"
import { slugify } from "@/lib/auth-redirect"

export function CreateApplicationDialog({
  workspaceSlug,
}: {
  workspaceSlug: string
}) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getFieldState,
    formState: { errors },
  } = useForm<z.infer<typeof createApplicationInputSchema>>({
    resolver: zodResolver(createApplicationInputSchema),
    defaultValues: { name: "", slug: "" },
  })
  const create = useMutation({
    mutationFn: (data: z.infer<typeof createApplicationInputSchema>) =>
      createApplicationFn({ data }),
    onSuccess: async (application) => {
      await queryClient.invalidateQueries(
        applicationsQueryOptions(workspaceSlug)
      )
      setOpen(false)
      reset()
      await navigate({
        to: "/w/$slug/applications/$applicationId",
        params: { slug: workspaceSlug, applicationId: application.id },
      })
    },
  })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <PlusIcon />
        Create Application
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Application</DialogTitle>
          <DialogDescription>
            Group the Agents and Workflows for one product. Development and
            Production Environments are created for you.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            void handleSubmit((data) => create.mutate(data))(event)
          }}
          className="flex flex-col gap-4"
        >
          <Field>
            <FieldLabel htmlFor="application-name">Name</FieldLabel>
            <Input
              id="application-name"
              autoFocus
              {...register("name", {
                onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                  if (!getFieldState("slug").isDirty)
                    setValue(
                      "slug",
                      slugify(event.target.value).replace(/-+$/, "")
                    )
                },
              })}
            />
            <FieldError>{errors.name?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="application-slug">Slug</FieldLabel>
            <Input
              id="application-slug"
              placeholder="support-assistant"
              {...register("slug")}
            />
            <FieldError>{errors.slug?.message}</FieldError>
          </Field>
          {create.error && (
            <p role="alert" className="text-xs text-destructive">
              {create.error.message}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create Application"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
