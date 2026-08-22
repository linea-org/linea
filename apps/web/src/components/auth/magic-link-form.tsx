import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
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
import { Separator } from "@linea/ui/components/separator"

import { authClient } from "@/lib/auth-client"
import { authErrorMessage } from "@/lib/auth-redirect"

const schema = z.object({
  email: z.email("Enter a valid email"),
})
type FormValues = z.infer<typeof schema>

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
  invitationId?: string
  defaultEmail?: string
  onError?: (message: string | null) => void
}

export function MagicLinkForm({
  invitationId,
  defaultEmail,
  onError,
}: MagicLinkFormProps) {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: defaultEmail ?? "" },
  })
  async function onSubmit(values: FormValues) {
    onError?.(null)
    const origin = window.location.origin
    const callbackURL = invitationId
      ? `${origin}/accept-invitation/${invitationId}`
      : `${origin}/`
    const newUserCallbackURL = invitationId
      ? callbackURL
      : `${origin}/onboarding/workspace`
    const errorCallbackURL = invitationId
      ? `${origin}/sign-in?invitationId=${encodeURIComponent(invitationId)}`
      : `${origin}/sign-in`
    const { error } = await authClient.signIn.magicLink({
      email: values.email,
      callbackURL,
      newUserCallbackURL,
      errorCallbackURL,
    })
    if (error) {
      onError?.(authErrorMessage(error, "Could not send sign-in link"))
      return
    }
    setSentTo(values.email)
  }
  return (
    <div className="space-y-4">
      <div className="relative flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="shrink-0 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          or
        </span>
        <Separator className="flex-1" />
      </div>
      {sentTo ? (
        <Alert>
          <AlertDescription>
            We sent a sign-in link to {sentTo}. Open it to continue — it expires
            in a few minutes.
          </AlertDescription>
        </Alert>
      ) : (
        <form
          onSubmit={(event) => {
            void handleSubmit(onSubmit)(event)
          }}
          className="space-y-5"
        >
          <FieldGroup>
            <Field data-invalid={!!errors.email || undefined}>
              <FieldLabel htmlFor="magic-link-email">Email</FieldLabel>
              <Input
                id="magic-link-email"
                type="email"
                autoComplete="email"
                disabled={isSubmitting}
                {...register("email")}
              />
              <FieldError>{errors.email?.message}</FieldError>
            </Field>
          </FieldGroup>
          <Button
            type="submit"
            variant="outline"
            className="w-full"
            disabled={isSubmitting}
            size="lg"
          >
            {isSubmitting ? "Sending…" : "Email me a sign-in link"}
          </Button>
        </form>
      )}
    </div>
  )
}
