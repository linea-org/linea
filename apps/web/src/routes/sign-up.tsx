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
import { authErrorMessage, requireGuest } from "../lib/auth-redirect"

const signUpSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

export const Route = createFileRoute("/sign-up")({
  validateSearch: z.object({
    invitationId: z.string().optional(),
    email: z.string().optional(),
  }),
  beforeLoad: async () => {
    await requireGuest()
  },
  component: SignUpPage,
})

function SignUpPage() {
  const navigate = useNavigate()
  const { invitationId, email: emailFromInvite } = Route.useSearch()
  const [name, setName] = useState("")
  const [email, setEmail] = useState(emailFromInvite ?? "")
  const [password, setPassword] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setFieldErrors({})

    const parsed = signUpSchema.safeParse({ name, email, password })
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
    const callbackURL = invitationId
      ? `${window.location.origin}/accept-invitation/${invitationId}`
      : `${window.location.origin}/onboarding/workspace`

    const { error: signUpError } = await authClient.signUp.email({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      callbackURL,
    })
    setPending(false)

    if (signUpError) {
      setError(authErrorMessage(signUpError, "Could not create account"))
      return
    }

    await navigate({
      to: "/verify-email",
      search: { email: parsed.data.email },
    })
  }

  return (
    <AuthShell
      title="Create your account"
      description="Start with your email. We’ll send a verification link next."
      footer={
        <>
          Already have an account?{" "}
          <Link
            to="/sign-in"
            search={invitationId ? { invitationId, email } : undefined}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign in
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
            <Field data-invalid={!!fieldErrors.name || undefined}>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input
                id="name"
                name="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={pending}
              />
              <FieldError>{fieldErrors.name}</FieldError>
            </Field>
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
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={pending}
              />
              <FieldError>{fieldErrors.password}</FieldError>
            </Field>
          </FieldGroup>
          <Button type="submit" className="w-full" disabled={pending} size="lg">
            {pending ? "Creating account…" : "Create account"}
          </Button>
        </form>
      </div>
    </AuthShell>
  )
}
