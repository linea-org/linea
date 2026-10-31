import { useId } from "react"
import { Controller, type Control, type UseFormRegister } from "react-hook-form"
import { Field, FieldLabel } from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"
import { Textarea } from "@linea/ui/components/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linea/ui/components/select"
export type InstallationForm = {
  appClientId: string
  installationId: number
  privateKey: string
  issues: "read" | "write"
  pullRequests: "none" | "read" | "write"
}

export function GithubInstallationFields({
  register,
  control,
}: {
  readonly register: UseFormRegister<InstallationForm>
  readonly control: Control<InstallationForm>
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
        <Controller
          control={control}
          name="issues"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(value) => {
                if (value !== "read" && value !== "write") return
                field.onChange(value)
              }}
            >
              <SelectTrigger
                id={environmentId + "-github-issues"}
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="write">Read and write</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={environmentId + "-github-pr"}>
          Pull requests permission
        </FieldLabel>
        <Controller
          control={control}
          name="pullRequests"
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
                id={environmentId + "-github-pr"}
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
    </>
  )
}
