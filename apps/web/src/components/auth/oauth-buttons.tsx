import { useState } from "react"

import { Button } from "@linea/ui/components/button"
import { Separator } from "@linea/ui/components/separator"

import { authClient } from "@/lib/auth-client"
import { authErrorMessage } from "@/lib/auth-redirect"

type OAuthButtonsProps = {
  invitationId?: string
  onError?: (message: string | null) => void
}

function GoogleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      aria-hidden
      data-icon="inline-start"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="size-4"
      aria-hidden
      data-icon="inline-start"
    >
      <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.73 0 0 .84-.28 2.75 1.05A9.3 9.3 0 0 1 12 6.84c.85 0 1.71.12 2.51.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.42.2 2.47.1 2.73.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.81 0 .27.18.59.69.48A10.27 10.27 0 0 0 22 12.26C22 6.58 17.52 2 12 2z" />
    </svg>
  )
}

export function OAuthButtons({ invitationId, onError }: OAuthButtonsProps) {
  const [pendingProvider, setPendingProvider] = useState<
    "google" | "github" | null
  >(null)

  async function signInWith(provider: "google" | "github") {
    onError?.(null)
    setPendingProvider(provider)

    const origin = window.location.origin
    const callbackURL = invitationId
      ? `${origin}/accept-invitation/${invitationId}`
      : `${origin}/`
    const newUserCallbackURL = invitationId
      ? callbackURL
      : `${origin}/onboarding/workspace`

    const { error } = await authClient.signIn.social({
      provider,
      callbackURL,
      newUserCallbackURL,
      errorCallbackURL: `${origin}/sign-in`,
    })

    if (error) {
      setPendingProvider(null)
      onError?.(authErrorMessage(error, `Could not continue with ${provider}`))
    }
  }

  const busy = pendingProvider !== null

  return (
    <div className="space-y-4">
      <div className="grid gap-2.5">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          disabled={busy}
          onClick={() => {
            void signInWith("google")
          }}
        >
          <GoogleIcon />
          {pendingProvider === "google"
            ? "Redirecting…"
            : "Continue with Google"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          disabled={busy}
          onClick={() => {
            void signInWith("github")
          }}
        >
          <GitHubIcon />
          {pendingProvider === "github"
            ? "Redirecting…"
            : "Continue with GitHub"}
        </Button>
      </div>

      <div className="relative flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="shrink-0 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          or
        </span>
        <Separator className="flex-1" />
      </div>
    </div>
  )
}
