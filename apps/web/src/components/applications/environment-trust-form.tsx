import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { z } from "zod"
import { Button } from "@linea/ui/components/button"
import { Field, FieldError, FieldLabel } from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"
import {
  replaceEnvironmentTrustFn,
  type EnvironmentSummary,
} from "@/lib/environments-api"

const schema = z.object({
  browserOrigins: z.string().min(1),
  redirectOrigins: z.string().min(1),
  oidcIssuer: z.url(),
  oidcClientId: z.string().min(1),
  oidcAudience: z.string().min(1),
  oidcJwksUrl: z.url(),
  oidcSubjectClaim: z.string().min(1),
})

const fields = [
  {
    key: "browserOrigins",
    label: "Allowed browser origins",
    placeholder: "https://app.example.com",
  },
  {
    key: "redirectOrigins",
    label: "Allowed redirect origins",
    placeholder: "https://app.example.com",
  },
  {
    key: "oidcIssuer",
    label: "Identity provider issuer",
    placeholder: "https://identity.example.com",
  },
  {
    key: "oidcClientId",
    label: "Identity provider client ID",
    placeholder: "",
  },
  { key: "oidcAudience", label: "Token audience", placeholder: "" },
  {
    key: "oidcJwksUrl",
    label: "Identity provider JWKS URL",
    placeholder: "https://identity.example.com/jwks.json",
  },
  { key: "oidcSubjectClaim", label: "Subject claim", placeholder: "sub" },
] satisfies Array<{
  key: keyof z.infer<typeof schema>
  label: string
  placeholder: string
}>

export function EnvironmentTrustForm({
  environment,
  onSaved,
}: {
  environment: EnvironmentSummary
  onSaved: () => Promise<void>
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      browserOrigins: environment.allowedBrowserOrigins.join(", "),
      redirectOrigins: environment.allowedRedirectOrigins.join(", "),
      oidcIssuer: environment.oidcIssuer ?? "",
      oidcClientId: environment.oidcClientId ?? "",
      oidcAudience: environment.oidcAudience ?? "",
      oidcJwksUrl: environment.oidcJwksUrl ?? "",
      oidcSubjectClaim: environment.oidcSubjectClaim,
    },
  })
  const save = useMutation({
    mutationFn: ({
      browserOrigins,
      redirectOrigins,
      ...trust
    }: z.infer<typeof schema>) =>
      replaceEnvironmentTrustFn({
        data: {
          ...trust,
          environmentId: environment.id,
          allowedBrowserOrigins: browserOrigins
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          allowedRedirectOrigins: redirectOrigins
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: onSaved,
  })
  return (
    <form
      onSubmit={(event) => {
        void handleSubmit((values) => save.mutate(values))(event)
      }}
      className="flex flex-col gap-3"
    >
      <p className="text-sm text-muted-foreground">
        Configure the identity provider for users of your product. Enter
        multiple origins separated by commas. Updating trust revokes existing
        user sessions.
      </p>
      {fields.map((field) => (
        <Field key={field.key}>
          <FieldLabel htmlFor={`${environment.id}-${field.key}`}>
            {field.label}
          </FieldLabel>
          <Input
            id={`${environment.id}-${field.key}`}
            placeholder={field.placeholder}
            {...register(field.key)}
          />
          <FieldError>{errors[field.key]?.message}</FieldError>
        </Field>
      ))}
      {save.error && (
        <p className="text-sm text-destructive">{save.error.message}</p>
      )}
      <Button type="submit" disabled={save.isPending || !environment.enabled}>
        {save.isPending ? "Saving…" : "Save identity trust"}
      </Button>
    </form>
  )
}
