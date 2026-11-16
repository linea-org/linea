import { useState } from "react"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"

import { Alert, AlertDescription } from "@linea/ui/components/alert"
import { Button } from "@linea/ui/components/button"
import { Field, FieldLabel } from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@linea/ui/components/input-otp"

import { AuthShell } from "../components/auth"
import { authClient } from "../lib/auth-client"
import {
  requireGuest,
  resolvePostAuthPath,
  safeRedirectSchema,
} from "../lib/auth-redirect"

const CODE_LENGTH = 6

export const Route = createFileRoute("/two-factor")({
  validateSearch: z.object({
    invitationId: z.string().optional(),
    redirect: safeRedirectSchema,
  }),
  beforeLoad: async () => {
    await requireGuest()
  },
  component: TwoFactorPage,
})

function TwoFactorPage() {
  const navigate = useNavigate()
  const { invitationId, redirect } = Route.useSearch()
  const [backup, setBackup] = useState(false)
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(value: string) {
    setPending(true)
    setError(null)
    const { error: verifyError } = backup
      ? await authClient.twoFactor.verifyBackupCode({ code: value.trim() })
      : await authClient.twoFactor.verifyTotp({ code: value })
    if (verifyError) {
      setPending(false)
      setCode("")
      setError(verifyError.message ?? "That code didn’t work.")
      return
    }
    if (invitationId) {
      await navigate({
        to: "/accept-invitation/$invitationId",
        params: { invitationId },
      })
      return
    }
    await navigate({ to: redirect ?? (await resolvePostAuthPath()) })
  }

  return (
    <AuthShell
      title="Two-factor authentication"
      description={
        backup
          ? "Enter one of your backup codes."
          : "Enter the code from your authenticator app."
      }
      footer={
        <Link
          to="/sign-in"
          search={{ invitationId, redirect }}
          className="font-medium"
        >
          Back to sign in
        </Link>
      }
    >
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault()
          void submit(code)
        }}
      >
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {backup ? (
          <Field>
            <FieldLabel htmlFor="backup-code">Backup code</FieldLabel>
            <Input
              id="backup-code"
              autoFocus
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={pending}
            />
          </Field>
        ) : (
          <InputOTP
            autoFocus
            maxLength={CODE_LENGTH}
            value={code}
            onChange={setCode}
            onComplete={(value: string) => void submit(value)}
            containerClassName="justify-center"
            aria-label="Authenticator code"
            disabled={pending}
          >
            <InputOTPGroup>
              {Array.from({ length: CODE_LENGTH }, (_, index) => (
                <InputOTPSlot key={index} index={index} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        )}
        <Button
          type="submit"
          className="w-full"
          disabled={pending || code.trim().length === 0}
        >
          {pending ? "Checking…" : "Verify"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setBackup(!backup)
            setCode("")
            setError(null)
          }}
        >
          {backup ? "Use authenticator app" : "Use a backup code"}
        </Button>
      </form>
    </AuthShell>
  )
}
