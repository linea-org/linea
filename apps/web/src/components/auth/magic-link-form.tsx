import { useState } from "react"
import { z } from "zod"

import { Alert, AlertDescription } from "@linea/ui/components/alert"
import { Button } from "@linea/ui/components/button"

import { authClient } from "@/lib/auth-client"
import { authErrorMessage } from "@/lib/auth-redirect"

const schema = z.object({
  email: z.email("Enter a valid email"),
})

const MAGIC_LINK_VERIFY_ERRORS: Record<string, string> = {
  INVALID_TOKEN:
    "That sign-in link is invalid or has already been used. Request a new one.",
  failed_to_create_user: "Could not create your account. Try again.",
  new_user_signup_disabled: "No account exists for that email.",
  failed_to_create_session: "Could not start a session. Try again.",
}

export function magicLinkVerifyErrorMessage(code: string) {
  return (
    MAGIC_LINK_VERIFY_ERRORS[code] ??
    "Could not complete sign-in from that link. Request a new one."
  )
}

type MagicLinkFormProps = {
  // Shares the sign-in page's single email field rather than owning its own — sign-in offers two
  // ways to use one email (a password or a link), not two separate forms each asking for it.
  email: string
  invitationId?: string
  onError?: (message: string | null) => void
}

export function MagicLinkForm({
  email,
  invitationId,
  onError,
}: MagicLinkFormProps) {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function onSubmit() {
    onError?.(null)
    setFieldError(null)
    const parsed = schema.safeParse({ email })
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Enter a valid email")
      return
    }
    setIsSubmitting(true)
    const origin = window.location.origin
    const callbackURL = invitationId
      ? `${origin}/accept-invitation/${invitationId}`
      : `${origin}/`
    const newUserCallbackURL = invitationId
      ? callbackURL
      : `${origin}/onboarding/workspace`
    // magicLink=1 lets the sign-in page tell this flow's error codes (INVALID_TOKEN, etc.) apart
    // from an OAuth failure landing on the same page via its own errorCallbackURL — both share the
    // `error` query param, but the two flows have entirely different error vocabularies.
    const errorCallbackURL = invitationId
      ? `${origin}/sign-in?invitationId=${encodeURIComponent(invitationId)}&magicLink=1`
      : `${origin}/sign-in?magicLink=1`
    const { error } = await authClient.signIn.magicLink({
      email: parsed.data.email,
      callbackURL,
      newUserCallbackURL,
      errorCallbackURL,
    })
    setIsSubmitting(false)
    if (error) {
      onError?.(authErrorMessage(error, "Could not send sign-in link"))
      return
    }
    setSentTo(parsed.data.email)
  }

  if (sentTo) {
    return (
      <Alert>
        <AlertDescription>
          We sent a sign-in link to {sentTo}. Open it to continue — it expires
          in a few minutes.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-2">
      {fieldError ? (
        <p className="text-xs text-destructive">{fieldError}</p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={isSubmitting}
        size="lg"
        onClick={() => {
          void onSubmit()
        }}
      >
        {isSubmitting ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </div>
  )
}
