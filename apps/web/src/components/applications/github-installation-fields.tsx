import { useId } from "react"
import type { UseFormRegister } from "react-hook-form"
import { Field, FieldLabel } from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"
import { Textarea } from "@linea/ui/components/textarea"
import {
  NativeSelect,
  NativeSelectOption,
} from "@linea/ui/components/native-select"
export type InstallationForm = {
  appClientId: string
  installationId: number
  privateKey: string
  issues: "read" | "write"
  pullRequests: "none" | "read" | "write"
}

export function GithubInstallationFields({
  register,
}: {
  register: UseFormRegister<InstallationForm>
}) {
  const environmentId = useId()
  return (
    <>
      <Field>
        <FieldLabel htmlFor={environmentId + "-github-app"}>
          App or client ID
        </FieldLabel>
        <Input
          id={environmentId + "-github-app"}
          {...register("appClientId", { required: true })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={environmentId + "-github-installation"}>
          Installation ID
        </FieldLabel>
        <Input
          id={environmentId + "-github-installation"}
          type="number"
          {...register("installationId", {
            required: true,
            valueAsNumber: true,
            min: 1,
          })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={environmentId + "-github-key"}>
          App private key
        </FieldLabel>
        <Textarea
          id={environmentId + "-github-key"}
          autoComplete="off"
          {...register("privateKey", { required: true })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={environmentId + "-github-issues"}>
          Issues permission
        </FieldLabel>
        <NativeSelect
          id={environmentId + "-github-issues"}
          {...register("issues")}
        >
          <NativeSelectOption value="read">Read</NativeSelectOption>
          <NativeSelectOption value="write">Read and write</NativeSelectOption>
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor={environmentId + "-github-pr"}>
          Pull requests permission
        </FieldLabel>
        <NativeSelect
          id={environmentId + "-github-pr"}
          {...register("pullRequests")}
        >
          <NativeSelectOption value="none">None</NativeSelectOption>
          <NativeSelectOption value="read">Read</NativeSelectOption>
          <NativeSelectOption value="write">Read and write</NativeSelectOption>
        </NativeSelect>
      </Field>
    </>
  )
}
