import { useState } from "react"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"

import { Alert, AlertDescription } from "@linea/ui/components/alert"
import { Button } from "@linea/ui/components/button"

import { AuthShell, magicLinkVerifyErrorMessage } from "../components/auth"
import { authClient } from "../lib/auth-client"
import { authErrorMessage, resolvePostAuthPath } from "../lib/auth-redirect"

export const Route = createFileRoute("/magic-link")({
  validateSearch: z.object({
    token: z.string(),
    invitationId: z.string().optional(),
  }),
  component: MagicLinkPage,
})

function MagicLinkPage() {
  const navigate = useNavigate()
  const { token, invitationId } = Route.useSearch()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  async function continueSignIn() {
    setPending(true)
    setError(null)
    const { error: verifyError } = await authClient.magicLink.verify({
      query: { token },
    })
    if (verifyError) {
      setPending(false)
      const code =
        typeof verifyError === "object" &&
        "code" in verifyError &&
        typeof verifyError.code === "string"
          ? verifyError.code
          : ""
      setError(
        code
          ? magicLinkVerifyErrorMessage(code)
          : authErrorMessage(
              verifyError,
              "Could not complete sign-in from that link"
            )
      )
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
      title="Finish signing in"
      description="Confirm this sign-in link from your email to continue."
      footer={
        <>
          Wrong link?{" "}
          <Link
            to="/sign-in"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Back to sign in
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
        <Button
          type="button"
          className="w-full"
          size="lg"
          disabled={pending}
          onClick={() => {
            void continueSignIn()
          }}
        >
          {pending ? "Signing in…" : "Continue"}
        </Button>
      </div>
    </AuthShell>
  )
}
