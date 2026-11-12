import { Input } from "@linea/ui/components/input"
import { githubRepositoryTargetSchema } from "@linea/protocol/resources"
import { Controller, useForm } from "react-hook-form"
import { useMutation } from "@tanstack/react-query"
import { Button } from "@linea/ui/components/button"
import { Field, FieldLabel } from "@linea/ui/components/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linea/ui/components/select"
import type { EnvironmentSummary } from "@/lib/environments-api"
import { replaceConnectorPolicyFn } from "@/lib/shared-connections-api"
type PolicyForm = {
  repositories: string
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
  const defaultValues: PolicyForm = {
    repositories:
      current?.allowedRepositories
        ?.map(({ owner, repository }) => owner + "/" + repository)
        .join(", ") ?? "",
    issues: "none",
    pull_requests: "none",
  }
  for (const permission of permissions) {
    if (current?.maxScopes.includes(permission.name + ":write"))
      defaultValues[permission.name] = "write"
    else if (current?.maxScopes.includes(permission.name + ":read"))
      defaultValues[permission.name] = "read"
  }
  const {
    control,
    register,
    formState: { errors },
    handleSubmit,
  } = useForm<PolicyForm>({ defaultValues })
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
                allowedRepositories: input.repositories
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean)
                  .map((value) => {
                    const [owner, repository] = value.split("/")
                    return githubRepositoryTargetSchema.parse({
                      owner,
                      repository,
                    })
                  }),
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
      <h3 className="font-medium">GitHub repository policy</h3>
      <p className="text-xs text-muted-foreground">
        Choose repositories and maximum permissions for all GitHub Connections
        in this Environment. An empty repository list denies all GitHub
        operations. Writes still require exact-action human approval.
      </p>
      <Field>
        <FieldLabel htmlFor={environment.id + "-repositories"}>
          Allowed repositories (owner/repository, comma separated)
        </FieldLabel>
        <Input
          id={environment.id + "-repositories"}
          {...register("repositories", {
            validate: (value) =>
              value
                .split(",")
                .map((entry) => entry.trim())
                .filter(Boolean)
                .every((entry) => {
                  const parts = entry.split("/")
                  return (
                    parts.length === 2 &&
                    githubRepositoryTargetSchema.safeParse({
                      owner: parts[0],
                      repository: parts[1],
                    }).success
                  )
                }) ||
              "Enter repositories as owner/repository, separated by commas",
          })}
        />
        {errors.repositories && (
          <p className="text-xs text-destructive">
            {errors.repositories.message}
          </p>
        )}
      </Field>
      {permissions.map((permission) => (
        <Field key={permission.name}>
          <FieldLabel htmlFor={environment.id + "-policy-" + permission.name}>
            {permission.label}
          </FieldLabel>
          <Controller
            control={control}
            name={permission.name}
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(value) => {
                  if (value !== "none" && value !== "read" && value !== "write")
                    return
                  field.onChange(value)
                }}
              >
                <SelectTrigger
                  id={environment.id + "-policy-" + permission.name}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="read">Read</SelectItem>
                  <SelectItem value="write">Read and write</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      ))}
      {save.error && (
        <p className="text-xs text-destructive">{save.error.message}</p>
      )}
      <Button
        type="submit"
        size="xs"
        disabled={!environment.enabled || save.isPending}
      >
        Save GitHub policy
      </Button>
    </form>
  )
}
