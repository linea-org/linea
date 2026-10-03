import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import {
  environmentKeyScopes,
  environmentKeyScopeSchema,
} from "@linea/protocol/resources"
import { Checkbox } from "@linea/ui/components/checkbox"
import { Button } from "@linea/ui/components/button"
import { Field, FieldError, FieldLabel } from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"
import {
  createEnvironmentKeyFn,
  listEnvironmentKeysFn,
  revokeEnvironmentKeyFn,
  rotateEnvironmentKeyFn,
} from "@/lib/environment-keys-api"

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z
    .array(environmentKeyScopeSchema)
    .min(1, "Select at least one permission"),
})

export function EnvironmentKeys({
  workspaceSlug,
  environmentId,
  enabled,
}: {
  workspaceSlug: string
  environmentId: string
  enabled: boolean
}) {
  const queryClient = useQueryClient()
  const queryKey = ["environment-keys", workspaceSlug, environmentId]
  const { data: keys = [], error: loadError } = useQuery({
    queryKey,
    queryFn: () => listEnvironmentKeysFn({ data: { environmentId } }),
  })
  const [rawKey, setRawKey] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", scopes: [] },
  })
  async function refresh() {
    await queryClient.invalidateQueries({ queryKey })
  }
  const create = useMutation({
    mutationFn: (data: z.infer<typeof schema>) =>
      createEnvironmentKeyFn({ data: { ...data, environmentId } }),
    onSuccess: async (key) => {
      setRawKey(key.rawKey)
      reset()
      await refresh()
    },
  })
  const revoke = useMutation({
    mutationFn: (keyId: string) =>
      revokeEnvironmentKeyFn({ data: { environmentId, keyId } }),
    onSuccess: refresh,
  })
  const rotate = useMutation({
    mutationFn: (keyId: string) =>
      rotateEnvironmentKeyFn({ data: { environmentId, keyId } }),
    onSuccess: async (key) => {
      setRawKey(key.rawKey)
      await refresh()
    },
  })
  const error = loadError ?? create.error ?? revoke.error ?? rotate.error
  return (
    <section className="flex flex-col gap-3 border-t pt-4">
      <h3 className="font-medium">Backend keys</h3>
      <p className="text-sm text-muted-foreground">
        These keys access this Environment. Human approvals require a verified
        user session.
      </p>
      <form
        onSubmit={(event) => {
          void handleSubmit((data) => create.mutate(data))(event)
        }}
        className="flex flex-col gap-3"
      >
        <Field>
          <FieldLabel htmlFor={`${environmentId}-key-name`}>
            Key name
          </FieldLabel>
          <Input id={`${environmentId}-key-name`} {...register("name")} />
          <FieldError>{errors.name?.message}</FieldError>
        </Field>
        <fieldset className="grid gap-2 text-sm sm:grid-cols-2">
          <legend className="mb-2 font-medium">Permissions</legend>
          {environmentKeyScopes.map((scope) => (
            <label key={scope} className="flex items-center gap-2">
              <Controller
                name="scopes"
                control={control}
                render={({ field }) => (
                  <Checkbox
                    checked={field.value.includes(scope)}
                    onCheckedChange={(checked) =>
                      field.onChange(
                        checked
                          ? [...field.value, scope]
                          : field.value.filter((value) => value !== scope)
                      )
                    }
                  />
                )}
              />
              {scope.replace(":", " · ")}
            </label>
          ))}
        </fieldset>
        <FieldError>{errors.scopes?.message}</FieldError>
        <Button type="submit" disabled={!enabled || create.isPending}>
          Create key
        </Button>
      </form>
      {rawKey && (
        <div className="rounded-lg border bg-popover p-3">
          <p className="text-sm">Copy this key now. It is shown once.</p>
          <code className="text-xs break-all">{rawKey}</code>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRawKey(null)
              create.reset()
              rotate.reset()
            }}
          >
            Dismiss
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {keys.map((key) => (
        <div
          key={key.id}
          className="flex flex-wrap items-center gap-2 rounded-lg border p-2"
        >
          <span className="mr-auto text-sm">
            {key.name} · {key.keyPrefix} ·{" "}
            {key.revokedAt ? "Revoked" : "Active"}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={!enabled || !!key.revokedAt || rotate.isPending}
            onClick={() => rotate.mutate(key.id)}
          >
            Rotate
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!!key.revokedAt || revoke.isPending}
            onClick={() => revoke.mutate(key.id)}
          >
            Revoke
          </Button>
        </div>
      ))}
    </section>
  )
}
