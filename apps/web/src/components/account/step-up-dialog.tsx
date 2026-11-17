import { useState } from "react"
import { Link, useParams } from "@tanstack/react-router"
import { ShieldAlertIcon } from "lucide-react"

import { Alert, AlertDescription } from "@linealabs/ui/components/alert"
import { Button } from "@linealabs/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@linealabs/ui/components/dialog"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@linealabs/ui/components/input-otp"

import { authClient } from "@/lib/auth-client"
import { getAppOrigin } from "@/lib/workspace-host"

import { dismissStepUp, useStepUpOpen } from "./step-up-store"

const CODE_LENGTH = 6

function CodeForm() {
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  async function submit(value: string) {
    setPending(true)
    setError(null)
    const { error: verifyError } = await authClient.twoFactor.verifyTotp({
      code: value,
    })
    setPending(false)
    if (verifyError) {
      setCode("")
      setError(verifyError.message ?? "That code didn’t work.")
      return
    }
    dismissStepUp()
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void submit(code)
      }}
    >
      <InputOTP
        autoFocus
        maxLength={CODE_LENGTH}
        value={code}
        onChange={setCode}
        onComplete={(value: string) => void submit(value)}
        aria-label="Authenticator code"
      >
        <InputOTPGroup>
          {Array.from({ length: CODE_LENGTH }, (_, index) => (
            <InputOTPSlot key={index} index={index} />
          ))}
        </InputOTPGroup>
      </InputOTP>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button type="submit" disabled={pending || code.length < CODE_LENGTH}>
          {pending ? "Checking…" : "Confirm"}
        </Button>
      </DialogFooter>
    </form>
  )
}

async function signInAgain() {
  const redirect = window.location.pathname + window.location.search
  await authClient.signOut()
  window.location.href = `${getAppOrigin()}/sign-in?redirect=${encodeURIComponent(redirect)}`
}

function SignInAgain() {
  const { slug } = useParams({ strict: false })
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Sign in again to continue.
      </p>
      <Alert>
        <ShieldAlertIcon />
        <AlertDescription>
          Turn on two-factor authentication to confirm with a code instead.
        </AlertDescription>
      </Alert>
      <DialogFooter>
        {slug ? (
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to="/w/$slug/account" params={{ slug }} />}
            onClick={dismissStepUp}
          >
            Set up 2FA
          </Button>
        ) : null}
        <Button type="button" onClick={() => void signInAgain()}>
          Sign in again
        </Button>
      </DialogFooter>
    </div>
  )
}

/** Opens when a sensitive action needs a fresh sign-in or an authenticator code. */
export function StepUpDialog() {
  const open = useStepUpOpen()
  const { data: session } = authClient.useSession()
  const usesCode = session?.user.twoFactorEnabled === true
  return (
    <Dialog open={open} onOpenChange={(next) => !next && dismissStepUp()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm it’s you</DialogTitle>
          {usesCode ? (
            <DialogDescription>
              Enter the code from your authenticator app.
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {usesCode ? <CodeForm /> : <SignInAgain />}
      </DialogContent>
    </Dialog>
  )
}
