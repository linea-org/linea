import { useForm } from "react-hook-form"
import { useMutation } from "@tanstack/react-query"
import { Button } from "@linea/ui/components/button"
import { Field, FieldLabel } from "@linea/ui/components/field"
import {
  NativeSelect,
  NativeSelectOption,
} from "@linea/ui/components/native-select"
import type { EnvironmentSummary } from "@/lib/environments-api"
import { replaceConnectorPolicyFn } from "@/lib/shared-connections-api"
type PolicyForm = {
  issues: "none" | "read" | "write"
  pull_requests: "none" | "read" | "write"
}
const permissions = [
  { name: "issues", label: "Issues" },
  { name: "pull_requests", label: "Pull requests" },
] as const
export function EnvironmentConnectorPolicy({
  environment,
  onSaved,
}: {
  readonly environment: EnvironmentSummary
  readonly onSaved: () => Promise<void>
}) {
  const current = environment.connectorAccessPolicy.providers.find(
    (provider) => provider.provider === "github"
  )
  const defaultValues: PolicyForm = { issues: "none", pull_requests: "none" }
  for (const permission of permissions) {
    if (current?.maxScopes.includes(permission.name + ":write"))
      defaultValues[permission.name] = "write"
    else if (current?.maxScopes.includes(permission.name + ":read"))
      defaultValues[permission.name] = "read"
  }
  const { register, handleSubmit } = useForm<PolicyForm>({ defaultValues })
  const save = useMutation({
    mutationFn: (input: PolicyForm) => {
      const selected = permissions.filter(
        (permission) => input[permission.name] !== "none"
      )
      const installationScopes = [
        "metadata:read",
        ...selected.flatMap((permission) =>
          input[permission.name] === "write"
            ? [permission.name + ":read", permission.name + ":write"]
            : [permission.name + ":read"]
        ),
      ]
      const oldScopes =
        current?.maxScopes.filter(
          (scope) =>
            !scope.startsWith("issues:") &&
            !scope.startsWith("pull_requests:") &&
            scope !== "metadata:read"
        ) ?? []
      return replaceConnectorPolicyFn({
        data: {
          environmentId: environment.id,
          policy: {
            providers: [
              ...environment.connectorAccessPolicy.providers.filter(
                (provider) => provider.provider !== "github"
              ),
              {
                provider: "github",
                actionFamilies: [
                  ...new Set([
                    ...(current?.actionFamilies.filter(
                      (family) =>
                        family !== "issues" && family !== "pull_requests"
                    ) ?? []),
                    "repositories",
                    ...selected.map((permission) => permission.name),
                  ]),
                ],
                maxScopes: [...new Set([...oldScopes, ...installationScopes])],
              },
            ],
          },
        },
      })
    },
    onSuccess: onSaved,
  })
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        void handleSubmit((data) => save.mutate(data))(event)
      }}
    >
      <h3 className="font-medium">GitHub installation policy</h3>
      <p className="text-sm text-muted-foreground">
        Choose the maximum installation permissions allowed in this Environment.
        Writes still require exact-action human approval.
      </p>
      {permissions.map((permission) => (
        <Field key={permission.name}>
          <FieldLabel htmlFor={environment.id + "-policy-" + permission.name}>
            {permission.label}
          </FieldLabel>
          <NativeSelect
            id={environment.id + "-policy-" + permission.name}
            {...register(permission.name)}
          >
            <NativeSelectOption value="none">None</NativeSelectOption>
            <NativeSelectOption value="read">Read</NativeSelectOption>
            <NativeSelectOption value="write">
              Read and write
            </NativeSelectOption>
          </NativeSelect>
        </Field>
      ))}
      {save.error && (
        <p className="text-sm text-destructive">{save.error.message}</p>
      )}
      <Button type="submit" disabled={!environment.enabled || save.isPending}>
        Save GitHub policy
      </Button>
    </form>
  )
}
