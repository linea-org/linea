import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@linea/ui/components/alert-dialog"
import { Button } from "@linea/ui/components/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"

import { authClient } from "@/lib/auth-client"
import { deleteOrganization, updateOrganization } from "@/lib/auth-queries"

export const Route = createFileRoute("/w/$slug/settings/")({
  component: WorkspaceSettingsPage,
})

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and hyphens"
    ),
})
type FormValues = z.infer<typeof schema>

function WorkspaceSettingsPage() {
  const navigate = useNavigate()
  const { data: session } = authClient.useSession()
  const { data: activeOrg, refetch } = authClient.useActiveOrganization()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const self = activeOrg?.members.find(
    (member) => member.userId === session?.user.id
  )
  const isOwner = self?.role === "owner"
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: activeOrg
      ? { name: activeOrg.name, slug: activeOrg.slug }
      : undefined,
  })
  const save = useMutation({
    mutationFn: (values: FormValues) => {
      if (!activeOrg) throw new Error("Workspace not loaded yet")
      return updateOrganization(activeOrg.id, values)
    },
    onSuccess: async (_data, values) => {
      await refetch()
      if (values.slug !== activeOrg?.slug) {
        await navigate({
          to: "/w/$slug/settings",
          params: { slug: values.slug },
        })
      }
    },
  })
  const remove = useMutation({
    mutationFn: () => {
      if (!activeOrg) throw new Error("Workspace not loaded yet")
      return deleteOrganization(activeOrg.id)
    },
    onSuccess: () => {
      void navigate({ to: "/workspaces" })
    },
  })
  return (
    <main className="flex flex-1 flex-col px-6 py-6 sm:px-8">
      <p className="text-sm font-medium text-foreground">General</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Name and URL for this workspace.
      </p>
      <form
        className="mt-4 overflow-hidden rounded-xl border border-border bg-card"
        onSubmit={(event) => {
          void handleSubmit((values) => save.mutate(values))(event)
        }}
      >
        <div className="p-4">
          <FieldGroup>
            <Field data-invalid={!!errors.name || undefined}>
              <FieldLabel htmlFor="workspace-name">Name</FieldLabel>
              <Input id="workspace-name" {...register("name")} />
              <FieldError>{errors.name?.message}</FieldError>
            </Field>
            <Field data-invalid={!!errors.slug || undefined}>
              <FieldLabel htmlFor="workspace-slug">Slug</FieldLabel>
              <Input id="workspace-slug" {...register("slug")} />
              <FieldError>{errors.slug?.message}</FieldError>
            </Field>
          </FieldGroup>
          {save.isError ? (
            <p className="mt-3 text-sm text-destructive">
              {save.error.message}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end border-t border-border px-4 py-3">
          <Button type="submit" size="sm" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
      {isOwner ? (
        <>
          <p className="mt-8 text-sm font-medium text-foreground">
            Delete workspace
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Removes every workflow and run in this workspace. This can&apos;t be
            undone.
          </p>
          <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Only the owner can do this.
              </p>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setDeleteOpen(true)}
              >
                Delete
              </Button>
            </div>
          </div>
        </>
      ) : null}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {activeOrg?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the workspace, its workflows, and all
              execution history. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
