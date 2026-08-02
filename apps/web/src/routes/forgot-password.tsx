import { useState } from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
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
import { authErrorMessage, requireGuest } from "../lib/auth-redirect"

const schema = z.object({
  email: z.email("Enter a valid email"),
})

export const Route = createFileRoute("/forgot-password")({
  beforeLoad: async () => {
    await requireGuest()
  },
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setFieldErrors({})

    const parsed = schema.safeParse({ email })
    if (!parsed.success) {
      setFieldErrors({
        email: parsed.error.issues[0]?.message ?? "Invalid email",
      })
      return
    }

    setPending(true)
    const { error: resetError } = await authClient.requestPasswordReset({
      email: parsed.data.email,
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setPending(false)

    if (resetError) {
      setError(authErrorMessage(resetError, "Could not send reset email"))
      return
    }
    setSent(true)
  }

  return (
    <AuthShell
      title="Reset your password"
      description="Enter your email and we’ll send a reset link if an account exists."
      footer={
        <>
          Remembered it?{" "}
          <Link
            to="/sign-in"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      {sent ? (
        <Alert>
          <AlertDescription>
            If an account exists for that email, a reset link is on its way.
          </AlertDescription>
        </Alert>
      ) : (
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
          <FieldGroup>
            <Field data-invalid={!!fieldErrors.email || undefined}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={pending}
              />
              <FieldError>{fieldErrors.email}</FieldError>
            </Field>
          </FieldGroup>
          <Button type="submit" className="w-full" disabled={pending} size="lg">
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
