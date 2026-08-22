import { useState } from "react"
import {
  Link,
  createFileRoute,
  redirect,
  useNavigate,
} from "@tanstack/react-router"
import { z } from "zod"

import { Alert, AlertDescription } from "@linea/ui/components/alert"
import { Button } from "@linea/ui/components/button"

import { AuthShell } from "../components/auth"
import { authClient } from "../lib/auth-client"
import {
  authErrorMessage,
  fetchSession,
  resolvePostAuthPath,
} from "../lib/auth-redirect"

export const Route = createFileRoute("/verify-email")({
  validateSearch: z.object({
    email: z.string().optional(),
    token: z.string().optional(),
    invitationId: z.string().optional(),
  }),
  beforeLoad: async () => {
    const session = await fetchSession()
    if (session?.user.emailVerified) {
      throw redirect({ to: await resolvePostAuthPath(session) })
    }
  },
  component: VerifyEmailPage,
})

function VerifyEmailPage() {
  const navigate = useNavigate()
  const { email: emailFromSearch, token, invitationId } = Route.useSearch()
  const { data: session } = authClient.useSession()
  const email = session?.user.email ?? emailFromSearch
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function resend() {
    if (!email) {
      setError("Enter your email on the sign-up page first.")
      return
    }
    setPending(true)
    setError(null)
    setMessage(null)
    const { error: resendError } = await authClient.sendVerificationEmail({
      email,
      callbackURL: `${window.location.origin}/onboarding/workspace`,
    })
    setPending(false)
    if (resendError) {
      setError(authErrorMessage(resendError, "Could not resend email"))
      return
    }
    setMessage("Verification email sent. Check your inbox.")
  }
  async function activate() {
    if (!token) return
    setPending(true)
    setError(null)
    const { error: verifyError } = await authClient.verifyEmail({
      query: { token },
    })
    if (verifyError) {
      setPending(false)
      setError(authErrorMessage(verifyError, "Could not verify email"))
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
      title={token ? "Confirm your email" : "Check your email"}
      description={
        token
          ? "Confirm this verification link from your email to activate your account."
          : email
            ? `We sent a verification link to ${email}. Open it to activate your account.`
            : "We sent a verification link to your inbox. Open it to activate your account."
      }
      footer={
        <>
          Wrong account?{" "}
          <Link
            to="/sign-in"
            className="font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => {
              void authClient.signOut()
            }}
          >
            Sign in with another email
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {message ? (
          <Alert>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        {token ? (
          <Button
            type="button"
            className="w-full"
            size="lg"
            disabled={pending}
            onClick={() => {
              void activate()
            }}
          >
            {pending ? "Verifying…" : "Confirm email"}
          </Button>
        ) : (
          <Button
            type="button"
            className="w-full"
            size="lg"
            disabled={pending || !email}
            onClick={() => {
              void resend()
            }}
          >
            {pending ? "Sending…" : "Resend verification email"}
          </Button>
        )}
        <p className="text-center text-xs text-muted-foreground">
          After verifying, you’ll continue to workspace setup automatically.
        </p>
      </div>
    </AuthShell>
  )
}
