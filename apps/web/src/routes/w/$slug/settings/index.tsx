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
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@linea/ui/components/alert-dialog"
import { Button } from "@linea/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@linea/ui/components/card"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"

import { authClient } from "../../../../lib/auth-client"
import {
  deleteOrganization,
  updateOrganization,
} from "../../../../lib/auth-queries"

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
    <main className="flex flex-1 flex-col px-6 py-8 sm:px-8 sm:py-10">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">
        Workspace settings
      </h1>
      <p className="mt-2 max-w-lg text-sm text-muted-foreground">
        Manage this workspace&apos;s name and slug.
      </p>

      <Card className="mt-8 max-w-lg">
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              void handleSubmit((values) => save.mutate(values))(e)
            }}
          >
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
            {save.isError && (
              <p className="mt-3 text-sm text-destructive">
                {save.error.message}
              </p>
            )}
            <Button type="submit" className="mt-4" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {isOwner && (
        <Card className="mt-6 max-w-lg border-destructive/40">
          <CardHeader>
            <CardTitle>Danger zone</CardTitle>
            <CardDescription>
              Deleting a workspace removes all its workflows and execution
              history. This can&apos;t be undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              Delete workspace
            </Button>
          </CardContent>
        </Card>
      )}

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
