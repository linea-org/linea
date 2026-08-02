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

import { AuthShell, OAuthButtons } from "../components/auth"
import { authClient } from "../lib/auth-client"
import {
  authErrorMessage,
  requireGuest,
  resolvePostAuthPath,
} from "../lib/auth-redirect"

const signInSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
})

export const Route = createFileRoute("/sign-in")({
  validateSearch: z.object({
    invitationId: z.string().optional(),
    email: z.string().optional(),
  }),
  beforeLoad: async () => {
    await requireGuest()
  },
  component: SignInPage,
})

function SignInPage() {
  const navigate = useNavigate()
  const { invitationId, email: emailFromInvite } = Route.useSearch()
  const [email, setEmail] = useState(emailFromInvite ?? "")
  const [password, setPassword] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setFieldErrors({})

    const parsed = signInSchema.safeParse({ email, password })
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
    const { error: signInError } = await authClient.signIn.email({
      email: parsed.data.email,
      password: parsed.data.password,
    })
    setPending(false)

    if (signInError) {
      setError(authErrorMessage(signInError, "Could not sign in"))
      return
    }

    if (invitationId) {
      await navigate({
        to: "/accept-invitation/$invitationId",
        params: { invitationId },
      })
      return
    }

    await navigate({ to: await resolvePostAuthPath() })
  }

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to continue to your workspace."
      footer={
        <>
          Don’t have an account?{" "}
          <Link
            to="/sign-up"
            search={invitationId ? { invitationId, email } : undefined}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign up
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <OAuthButtons
          invitationId={invitationId}
          onError={(message) => setError(message)}
        />
        <form
          onSubmit={(event) => {
            void onSubmit(event)
          }}
          className="space-y-5"
        >
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
          <Field data-invalid={!!fieldErrors.password || undefined}>
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Link
                to="/forgot-password"
                className="text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
            />
            <FieldError>{fieldErrors.password}</FieldError>
          </Field>
        </FieldGroup>
        <Button type="submit" className="w-full" disabled={pending} size="lg">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
        </form>
      </div>
    </AuthShell>
  )
}
