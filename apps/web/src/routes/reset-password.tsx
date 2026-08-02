import { useState } from "react"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"

import { Alert, AlertDescription } from "@linea/ui/components/alert"
import { Button } from "@linea/ui/components/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"

import { AuthShell } from "../components/auth"
import { authClient } from "../lib/auth-client"
import { authErrorMessage } from "../lib/auth-redirect"

const schema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirm: z.string().min(1, "Confirm your password"),
  })
  .refine((value) => value.password === value.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  })

export const Route = createFileRoute("/reset-password")({
  validateSearch: z.object({
    token: z.string().optional(),
  }),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const navigate = useNavigate()
  const { token } = Route.useSearch()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setFieldErrors({})

    if (!token) {
      setError("This reset link is missing a token. Request a new one.")
      return
    }

    const parsed = schema.safeParse({ password, confirm })
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form")
        if (!next[key]) next[key] = issue.message
      }
      setFieldErrors(next)
      return
    }

    setPending(true)
    const { error: resetError } = await authClient.resetPassword({
      newPassword: parsed.data.password,
      token,
    })
    setPending(false)

    if (resetError) {
      setError(authErrorMessage(resetError, "Could not reset password"))
      return
    }

    await navigate({ to: "/sign-in" })
  }

  return (
    <AuthShell
      title="Choose a new password"
      description="Pick something strong you haven’t used elsewhere."
      footer={
        <>
          Back to{" "}
          <Link
            to="/sign-in"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            sign in
          </Link>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          void onSubmit(event)
        }}
        className="space-y-5"
      >
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {!token ? (
          <Alert variant="destructive">
            <AlertDescription>
              Invalid or expired reset link.{" "}
              <Link
                to="/forgot-password"
                className="underline underline-offset-4"
              >
                Request a new one
              </Link>
              .
            </AlertDescription>
          </Alert>
        ) : null}
        <FieldGroup>
          <Field data-invalid={!!fieldErrors.password || undefined}>
            <FieldLabel htmlFor="password">New password</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending || !token}
            />
            <FieldError>{fieldErrors.password}</FieldError>
          </Field>
          <Field data-invalid={!!fieldErrors.confirm || undefined}>
            <FieldLabel htmlFor="confirm">Confirm password</FieldLabel>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={pending || !token}
            />
            <FieldError>{fieldErrors.confirm}</FieldError>
          </Field>
        </FieldGroup>
        <Button
          type="submit"
          className="w-full"
          disabled={pending || !token}
          size="lg"
        >
          {pending ? "Saving…" : "Update password"}
        </Button>
      </form>
    </AuthShell>
  )
}
