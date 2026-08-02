import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { z } from "zod"

import { Alert, AlertDescription } from "@linea/ui/components/alert"
import { Button } from "@linea/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"

import {
  createOrganization,
  setActiveOrganization,
} from "../../lib/auth-queries"
import { authErrorMessage, slugify } from "../../lib/auth-redirect"

const schema = z.object({
  name: z.string().min(2, "Workspace name is required"),
  slug: z
    .string()
    .min(2, "Slug is required")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and hyphens"
    ),
})

export type CreatedWorkspace = {
  id: string
  name: string
  slug: string
}

type CreateWorkspaceFormProps = {
  onSuccess: (org: CreatedWorkspace) => void | Promise<void>
  setActive?: boolean
  submitLabel?: string
}

export function CreateWorkspaceForm({
  onSuccess,
  setActive = false,
  submitLabel = "Create workspace",
}: CreateWorkspaceFormProps) {
  const [name, setName] = useState("")
  const [slugDraft, setSlugDraft] = useState("")
  const [slugTouched, setSlugTouched] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const slug = slugTouched ? slugDraft : slugify(name)

  const createMutation = useMutation({
    mutationFn: async (input: { name: string; slug: string }) => {
      const data = await createOrganization(input)
      if (!data?.id) {
        throw new Error("Could not create workspace")
      }
      if (setActive) {
        await setActiveOrganization(data.id)
      }
      return {
        id: data.id,
        name: data.name ?? input.name,
        slug: data.slug ?? input.slug,
      } satisfies CreatedWorkspace
    },
    onSuccess: async (org) => {
      await onSuccess(org)
    },
  })

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFieldErrors({})
    createMutation.reset()

    const parsed = schema.safeParse({ name, slug })
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form")
        if (!next[key]) next[key] = issue.message
      }
      setFieldErrors(next)
      return
    }

    createMutation.mutate(parsed.data)
  }

  const error = createMutation.error
    ? authErrorMessage(createMutation.error, "Could not create workspace")
    : null

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup>
        <Field data-invalid={!!fieldErrors.name || undefined}>
          <FieldLabel htmlFor="workspace-name">Workspace name</FieldLabel>
          <Input
            id="workspace-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Studio"
            disabled={createMutation.isPending}
            autoFocus
          />
          <FieldError>{fieldErrors.name}</FieldError>
        </Field>
        <Field data-invalid={!!fieldErrors.slug || undefined}>
          <FieldLabel htmlFor="workspace-slug">Slug</FieldLabel>
          <Input
            id="workspace-slug"
            name="slug"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true)
              setSlugDraft(slugify(e.target.value))
            }}
            placeholder="acme-studio"
            disabled={createMutation.isPending}
          />
          <FieldDescription>
            Used in URLs. Lowercase letters, numbers, and hyphens only.
          </FieldDescription>
          <FieldError>{fieldErrors.slug}</FieldError>
        </Field>
      </FieldGroup>
      <Button
        type="submit"
        className="w-full"
        disabled={createMutation.isPending}
        size="lg"
      >
        {createMutation.isPending ? "Creating…" : submitLabel}
      </Button>
    </form>
  )
}
