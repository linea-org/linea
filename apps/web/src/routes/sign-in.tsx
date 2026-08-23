import { useState } from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { Alert, AlertDescription } from "@linea/ui/components/alert"

import {
  AuthShell,
  MagicLinkForm,
  OAuthButtons,
  magicLinkVerifyErrorMessage,
} from "../components/auth"
import { requireGuest } from "../lib/auth-redirect"

export const Route = createFileRoute("/sign-in")({
  validateSearch: z.object({
    invitationId: z.string().optional(),
    email: z.string().optional(),
    error: z.string().optional(),
  }),
  beforeLoad: async () => {
    await requireGuest()
  },
  component: SignInPage,
})

function SignInPage() {
  const {
    invitationId,
    email: emailFromInvite,
    error: errorFromLink,
  } = Route.useSearch()
  const [error, setError] = useState<string | null>(
    errorFromLink ? magicLinkVerifyErrorMessage(errorFromLink) : null
  )
  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to continue to your workspace."
      footer={
        <>
          Don’t have an account?{" "}
          <Link
            to="/sign-up"
            search={
              invitationId
                ? { invitationId, email: emailFromInvite }
                : undefined
            }
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
        <MagicLinkForm
          invitationId={invitationId}
          defaultEmail={emailFromInvite}
          onError={(message) => setError(message)}
        />
      </div>
    </AuthShell>
  )
}
