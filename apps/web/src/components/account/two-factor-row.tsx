import { useState } from "react"
import { useQuery } from "@tanstack/react-query"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@linea/ui/components/alert-dialog"
import { Badge } from "@linea/ui/components/badge"
import { Button } from "@linea/ui/components/button"

import { PasswordInput } from "@/components/auth"
import { authClient } from "@/lib/auth-client"

import { TwoFactorSetupDialog } from "./two-factor-setup-dialog"

function useHasPassword() {
  const accounts = useQuery({
    queryKey: ["auth-accounts"],
    queryFn: async () => {
      const { data, error } = await authClient.listAccounts()
      if (error) throw new Error(error.message ?? "Could not load accounts")
      return data
    },
  })
  return (
    accounts.data?.some((account) => account.providerId === "credential") ??
    false
  )
}

function TurnOffDialog({
  open,
  hasPassword,
  onOpenChange,
}: Readonly<{
  open: boolean
  hasPassword: boolean
  onOpenChange: (open: boolean) => void
}>) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  async function turnOff() {
    setPending(true)
    setError(null)
    const { error: disableError } = await authClient.twoFactor.disable({
      password: password || undefined,
    })
    setPending(false)
    if (disableError) {
      setError(disableError.message ?? "Could not turn it off.")
      return
    }
    setPassword("")
    onOpenChange(false)
  }
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Turn off two-factor authentication?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Sensitive actions will ask you to sign in again instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {hasPassword ? (
          <PasswordInput
            aria-label="Password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending || (hasPassword && password.length === 0)}
            onClick={() => void turnOff()}
          >
            Turn off
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function TwoFactorRow() {
  const { data: session } = authClient.useSession()
  const hasPassword = useHasPassword()
  const [setupOpen, setSetupOpen] = useState(false)
  const [turnOffOpen, setTurnOffOpen] = useState(false)
  const enabled = session?.user.twoFactorEnabled === true
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium">Two-factor authentication</p>
        {enabled ? (
          <Badge variant="success">On</Badge>
        ) : (
          <Badge variant="warning">Off</Badge>
        )}
      </div>
      {enabled ? (
        <Button variant="outline" onClick={() => setTurnOffOpen(true)}>
          Turn off
        </Button>
      ) : (
        <Button variant="outline" onClick={() => setSetupOpen(true)}>
          Set up
        </Button>
      )}
      <TwoFactorSetupDialog
        open={setupOpen}
        hasPassword={hasPassword}
        onOpenChange={setSetupOpen}
      />
      <TurnOffDialog
        open={turnOffOpen}
        hasPassword={hasPassword}
        onOpenChange={setTurnOffOpen}
      />
    </div>
  )
}
