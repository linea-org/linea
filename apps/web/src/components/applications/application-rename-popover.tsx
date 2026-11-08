import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { MoreHorizontalIcon, PencilIcon } from "lucide-react"
import { z } from "zod"
import { Button, buttonVariants } from "@linea/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@linea/ui/components/dialog"
import { Field, FieldError, FieldLabel } from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@linea/ui/components/popover"
import { cn } from "@linea/ui/lib/utils"
import {
  applicationsQueryOptions,
  createApplicationInputSchema,
  updateApplicationFn,
  type ApplicationSummary,
} from "@/lib/applications-api"

export function ApplicationCardMenu({
  workspaceSlug,
  application,
}: Readonly<{
  workspaceSlug: string
  application: ApplicationSummary
}>) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof createApplicationInputSchema>>({
    resolver: zodResolver(createApplicationInputSchema),
    defaultValues: { name: application.name, slug: application.slug },
  })
  const update = useMutation({
    mutationFn: (data: z.infer<typeof createApplicationInputSchema>) =>
      updateApplicationFn({
        data: { ...data, applicationId: application.id },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries(
        applicationsQueryOptions(workspaceSlug)
      )
      setDialogOpen(false)
    },
  })
  const nameId = `application-name-${application.id}`
  const slugId = `application-slug-${application.id}`
  function openEdit() {
    setMenuOpen(false)
    update.reset()
    reset({ name: application.name, slug: application.slug })
    setDialogOpen(true)
  }
  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-xs" }),
            "rounded-md"
          )}
          aria-label={`Options for ${application.name}`}
        >
          <MoreHorizontalIcon />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-40 gap-0 p-1">
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/40"
            onClick={openEdit}
          >
            <PencilIcon className="size-3.5" />
            Edit
          </button>
        </PopoverContent>
      </Popover>
      <Dialog
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next)
          if (!next) return
          update.reset()
          reset({ name: application.name, slug: application.slug })
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit application</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              void handleSubmit((data) => update.mutate(data))(event)
            }}
            className="flex flex-col gap-4"
          >
            <Field>
              <FieldLabel htmlFor={nameId}>Name</FieldLabel>
              <Input
                id={nameId}
                className="h-9"
                autoFocus
                {...register("name")}
              />
              <FieldError>{errors.name?.message}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor={slugId}>Slug</FieldLabel>
              <Input id={slugId} className="h-9" {...register("slug")} />
              <FieldError>{errors.slug?.message}</FieldError>
            </Field>
            {update.error ? (
              <p className="text-xs text-destructive">{update.error.message}</p>
            ) : null}
            <Button type="submit" size="xs" disabled={update.isPending}>
              Save
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
