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
import { FieldError, FieldLabel } from "@linea/ui/components/field"
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
    <main className="flex min-w-0 flex-1 flex-col">
      <div className="flex w-full flex-col gap-6 p-4">
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">General</h2>
          <form
            className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
            onSubmit={(event) => {
              void handleSubmit((values) => save.mutate(values))(event)
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="workspace-name">Name</FieldLabel>
                <Input
                  id="workspace-name"
                  className="h-8"
                  {...register("name")}
                />
                <FieldError>{errors.name?.message}</FieldError>
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="workspace-slug">Slug</FieldLabel>
                <Input
                  id="workspace-slug"
                  className="h-8"
                  {...register("slug")}
                />
                <FieldError>{errors.slug?.message}</FieldError>
              </div>
            </div>
            {save.isError ? (
              <p className="text-xs text-destructive">{save.error.message}</p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" size="xs" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </section>
        {isOwner ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">Danger zone</h2>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-card p-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-xs font-medium text-foreground">
                  Delete workspace
                </p>
                <p className="text-xs text-muted-foreground">
                  Permanently removes the workspace and its history.
                </p>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="xs"
                onClick={() => setDeleteOpen(true)}
              >
                Delete
              </Button>
            </div>
          </section>
        ) : null}
      </div>
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
