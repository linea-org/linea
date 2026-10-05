import { useConnectionManagement } from "./connection-management-context"
import { useForm } from "react-hook-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@linea/ui/components/button"
import { Input } from "@linea/ui/components/input"
import { Field, FieldLabel } from "@linea/ui/components/field"
import {
  NativeSelect,
  NativeSelectOption,
} from "@linea/ui/components/native-select"
import { assignConnectionAuthorityFn } from "@/lib/shared-connections-api"
import { connectionAuthorityRoles as roles } from "./connection-authority-roles"
type AuthorityForm = {
  kind: "requester" | "reviewer"
  externalSubjectId: string
}

export function ConnectionAuthorityForm() {
  const { environmentId, connectionId, enabled } = useConnectionManagement()
  const queryClient = useQueryClient()
  const owner = { environmentId, connectionId }
  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["connection-authorities", environmentId, connectionId],
    })
  }
  const {
    register,
    handleSubmit,
    resetField,
    formState: { errors },
  } = useForm<AuthorityForm>({
    defaultValues: { kind: "requester", externalSubjectId: "" },
  })
  const assign = useMutation({
    mutationFn: (input: AuthorityForm) =>
      assignConnectionAuthorityFn({ data: { ...owner, ...input } }),
    onSuccess: async () => {
      resetField("externalSubjectId")
      await refresh()
    },
  })
  return (
    <>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          void handleSubmit((input) => assign.mutate(input))(event)
        }}
      >
        <Field>
          <FieldLabel htmlFor={connectionId + "-role"}>Assign role</FieldLabel>
          <NativeSelect id={connectionId + "-role"} {...register("kind")}>
            {roles.map((role) => (
              <NativeSelectOption key={role.kind} value={role.kind}>
                {role.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={connectionId + "-subject"}>
            Customer user Subject ID
          </FieldLabel>
          <Input
            id={connectionId + "-subject"}
            {...register("externalSubjectId", {
              required: true,
              pattern:
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
            })}
          />
          <p className="text-xs text-muted-foreground">
            Use the Subject ID provisioned for this customer user in this
            Environment. Assignment does not sign them in.
          </p>
          {errors.externalSubjectId && (
            <p className="text-sm text-destructive">
              Enter a valid Subject ID.
            </p>
          )}
        </Field>
        <Button disabled={!enabled || assign.isPending} type="submit">
          Assign access
        </Button>
      </form>
      {assign.error && (
        <p className="text-sm text-destructive">{assign.error.message}</p>
      )}
    </>
  )
}
