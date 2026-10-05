import {
  GithubInstallationFields,
  type InstallationForm,
} from "./github-installation-fields"
import { useForm } from "react-hook-form"
import { useState } from "react"
import { Button } from "@linea/ui/components/button"
import { createGithubInstallationFn } from "@/lib/shared-connections-api"
export function GithubInstallationForm({
  environmentId,
  enabled,
  onSaved,
}: {
  readonly environmentId: string
  readonly enabled: boolean
  readonly onSaved: () => Promise<void>
}) {
  const {
    register,
    handleSubmit,
    resetField,
    formState: { errors },
  } = useForm<InstallationForm>({
    defaultValues: {
      appClientId: "",
      privateKey: "",
      issues: "read",
      pullRequests: "none",
    },
  })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  async function submit(data: InstallationForm) {
    setPending(true)
    setError(undefined)
    try {
      await createGithubInstallationFn({
        data: {
          environmentId,
          appClientId: data.appClientId,
          installationId: data.installationId,
          privateKey: data.privateKey,
          permissions: {
            metadata: "read",
            issues: data.issues,
            ...(data.pullRequests === "none"
              ? {}
              : { pull_requests: data.pullRequests }),
          },
        },
      })
      await onSaved()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not connect the GitHub installation"
      )
    } finally {
      resetField("privateKey")
      setPending(false)
    }
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        void handleSubmit(submit)(event)
      }}
    >
      <h3 className="font-medium">Connect a company GitHub App</h3>
      <p className="text-sm text-muted-foreground">
        Install your GitHub App on the company account first. Match its
        permissions to the Environment policy below.
      </p>
      <GithubInstallationFields register={register} />
      {Object.keys(errors).length > 0 && (
        <p className="text-sm text-destructive">
          Enter an App ID, installation ID and PEM private key.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button disabled={!enabled || pending} type="submit">
        Connect installation
      </Button>
    </form>
  )
}
