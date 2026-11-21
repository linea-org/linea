import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { Button } from "@linealabs/ui/components/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@linealabs/ui/components/field"
import { Input } from "@linealabs/ui/components/input"
import { Spinner } from "@linealabs/ui/components/spinner"

import type { ModelSetup } from "@/lib/model-settings-api"

import { ModelPickerField } from "./model-picker-field"
import {
  buildModelSetupSchema,
  modelHasKey,
  type ModelSetupValues,
} from "./model-setup-schema"
import { useSaveModelSetup } from "./use-save-model-setup"

export function ModelSetupForm({
  slug,
  setup,
  onSaved,
}: Readonly<{
  slug: string
  setup: ModelSetup
  onSaved?: (values: ModelSetupValues) => void
}>) {
  const { models } = setup.settings
  const schema = useMemo(() => buildModelSetupSchema(setup), [setup])
  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<ModelSetupValues>({
    resolver: zodResolver(schema),
    defaultValues: { model: setup.settings.defaultModel ?? "", apiKey: "" },
  })
  const selected = models.find((item) => item.value === watch("model"))
  const save = useSaveModelSetup(slug, setup, (values) => {
    reset({ model: values.model, apiKey: "" })
    onSaved?.(values)
  })
  return (
    <form
      onSubmit={(event) => {
        void handleSubmit((values) => save.mutate(values))(event)
      }}
    >
      <FieldGroup>
        <ModelPickerField
          control={control}
          models={models}
          error={errors.model?.message}
        />
        {selected ? (
          <Field data-invalid={!!errors.apiKey || undefined}>
            <FieldLabel htmlFor="model-setup-key">
              {selected.providerLabel} API key
            </FieldLabel>
            <Input
              id="model-setup-key"
              type="password"
              autoComplete="off"
              placeholder={
                modelHasKey(setup, selected)
                  ? "Key saved. Paste a new one to replace it"
                  : ""
              }
              {...register("apiKey")}
            />
            <FieldError>{errors.apiKey?.message}</FieldError>
          </Field>
        ) : null}
        {save.isError ? (
          <p className="text-sm text-destructive">{save.error.message}</p>
        ) : null}
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Spinner /> : null}
          {save.isSuccess ? "Saved" : "Save model"}
        </Button>
      </FieldGroup>
    </form>
  )
}
