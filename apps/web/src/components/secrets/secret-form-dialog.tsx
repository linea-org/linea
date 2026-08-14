import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { z } from "zod"

import { Button } from "@linea/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@linea/ui/components/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"
import { Textarea } from "@linea/ui/components/textarea"

const schema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100)
    .regex(
      /^[A-Za-z][A-Za-z0-9_-]*$/,
      "Use letters, numbers, hyphens, and underscores"
    ),
  secret: z.string().min(1, "Secret is required").max(10_000),
})
type FormValues = z.infer<typeof schema>

export function SecretFormDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  nameField,
  initialName,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  submitLabel: string
  nameField: "open" | "locked" | "none"
  initialName: string
  onSubmit: (input: { name: string; secret: string }) => Promise<unknown>
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: initialName, secret: "" },
  })
  useEffect(() => {
    if (open) {
      reset({ name: initialName, secret: "" })
    }
  }, [open, initialName, reset])
  const mutation = useMutation({
    mutationFn: onSubmit,
    onSuccess: () => {
      onOpenChange(false)
      reset({ name: "", secret: "" })
    },
  })
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) mutation.reset()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Encrypted at rest. You won&apos;t be able to read it back after
            saving.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            void handleSubmit((values) => mutation.mutate(values))(event)
          }}
        >
          <FieldGroup>
            {nameField === "none" ? (
              <input type="hidden" {...register("name")} />
            ) : (
              <Field data-invalid={!!errors.name || undefined}>
                <FieldLabel htmlFor="secret-name">Name</FieldLabel>
                <Input
                  id="secret-name"
                  placeholder="Stripe"
                  autoFocus={nameField === "open"}
                  readOnly={nameField === "locked"}
                  {...register("name")}
                />
                <FieldError>{errors.name?.message}</FieldError>
              </Field>
            )}
            <Field data-invalid={!!errors.secret || undefined}>
              <FieldLabel htmlFor="secret-body">Secret</FieldLabel>
              <Textarea
                id="secret-body"
                placeholder="Paste the secret"
                rows={3}
                autoFocus={nameField !== "open"}
                {...register("secret")}
              />
              <FieldDescription>
                Shown only while you type it in.
              </FieldDescription>
              <FieldError>{errors.secret?.message}</FieldError>
            </Field>
          </FieldGroup>
          {mutation.isError ? (
            <p className="mt-3 text-sm text-destructive">
              {mutation.error.message}
            </p>
          ) : null}
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
