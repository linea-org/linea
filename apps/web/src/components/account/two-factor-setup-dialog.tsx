import { useState } from "react"
import QRCode from "react-qr-code"

import { Button } from "@linealabs/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@linealabs/ui/components/dialog"
import { Field, FieldLabel } from "@linealabs/ui/components/field"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@linealabs/ui/components/input-otp"

import { PasswordInput } from "@/components/auth"
import { authClient } from "@/lib/auth-client"

const CODE_LENGTH = 6

type Enrollment = { totpURI: string; backupCodes: string[] }

function StartStep({
  hasPassword,
  onEnrolled,
}: Readonly<{
  hasPassword: boolean
  onEnrolled: (enrollment: Enrollment) => void
}>) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  async function submit() {
    setPending(true)
    setError(null)
    const { data, error: enableError } = await authClient.twoFactor.enable({
      method: "totp",
      password: password || undefined,
    })
    setPending(false)
    if (enableError) {
      setError(enableError.message ?? "Could not start setup.")
      return
    }
    if (data.method !== "totp") {
      throw new Error(
        `Expected an authenticator enrollment, got ${data.method}`
      )
    }
    onEnrolled(data)
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      {hasPassword ? (
        <Field>
          <FieldLabel htmlFor="two-factor-password">Password</FieldLabel>
          <PasswordInput
            id="two-factor-password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button
          type="submit"
          disabled={pending || (hasPassword && password.length === 0)}
        >
          {pending ? "Checking…" : "Continue"}
        </Button>
      </DialogFooter>
    </form>
  )
}

function ScanStep({
  totpURI,
  onVerified,
}: Readonly<{
  totpURI: string
  onVerified: () => void
}>) {
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const secret = new URL(totpURI).searchParams.get("secret")
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
    onVerified()
  }
  return (
    <form
      className="flex flex-col items-center gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void submit(code)
      }}
    >
      <div className="rounded-lg bg-qr-surface p-3 ring-1 ring-border">
        <QRCode value={totpURI} size={160} />
      </div>
      {secret ? (
        <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs break-all">
          {secret}
        </code>
      ) : null}
      <InputOTP
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
      <DialogFooter className="w-full">
        <Button type="submit" disabled={pending || code.length < CODE_LENGTH}>
          {pending ? "Checking…" : "Turn on"}
        </Button>
      </DialogFooter>
    </form>
  )
}

function BackupCodesStep({
  codes,
  onDone,
}: Readonly<{
  codes: string[]
  onDone: () => void
}>) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-3 font-mono text-sm">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(codes.join("\n"))
            setCopied(true)
          }}
        >
          {copied ? "Copied" : "Copy codes"}
        </Button>
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </DialogFooter>
    </div>
  )
}

const STEP_TITLES = {
  start: "Set up two-factor authentication",
  scan: "Scan with your authenticator app",
  codes: "Save your backup codes",
} as const

const STEP_HINTS = {
  start: "You’ll scan a QR code with an authenticator app.",
  scan: "Google Authenticator, 1Password, Authy or similar. Then enter the 6-digit code.",
  codes: "Each code signs you in once if you lose your authenticator.",
} as const

export function TwoFactorSetupDialog({
  open,
  hasPassword,
  onOpenChange,
}: Readonly<{
  open: boolean
  hasPassword: boolean
  onOpenChange: (open: boolean) => void
}>) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [verified, setVerified] = useState(false)
  let step: "start" | "scan" | "codes" = "start"
  if (verified) step = "codes"
  else if (enrollment) step = "scan"

  function close() {
    onOpenChange(false)
    setEnrollment(null)
    setVerified(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{STEP_TITLES[step]}</DialogTitle>
          <DialogDescription>{STEP_HINTS[step]}</DialogDescription>
        </DialogHeader>
        {step === "start" ? (
          <StartStep hasPassword={hasPassword} onEnrolled={setEnrollment} />
        ) : null}
        {step === "scan" && enrollment ? (
          <ScanStep
            totpURI={enrollment.totpURI}
            onVerified={() => setVerified(true)}
          />
        ) : null}
        {step === "codes" && enrollment ? (
          <BackupCodesStep codes={enrollment.backupCodes} onDone={close} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
