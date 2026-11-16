import { useMemo } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { Button } from "@linea/ui/components/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@linea/ui/components/select"
import { Spinner } from "@linea/ui/components/spinner"

import { findOrCreateDevelopmentEnvironment } from "@/lib/default-application"
import {
  modelSetupQueryOptions,
  updateModelSettingsFn,
  type ModelSetup,
} from "@/lib/model-settings-api"
import { upsertSecretFn } from "@/lib/secrets-api"

type FormValues = { model: string; apiKey: string }

export function ModelSetupForm({
  slug,
  setup,
}: {
  slug: string
  setup: ModelSetup
}) {
  const queryClient = useQueryClient()
  const { models } = setup.settings
  const schema = useMemo(
    () =>
      z
        .object({
          model: z.string().min(1, "Choose a model"),
          apiKey: z.string().trim(),
        })
        .superRefine((values, context) => {
          const model = models.find((item) => item.value === values.model)
          const hasKey = setup.providers.some(
            (provider) =>
              provider.keyName === model?.keyName && provider.configured
          )
          if (model && !hasKey && !values.apiKey) {
            context.addIssue({
              code: "custom",
              path: ["apiKey"],
              message: `Add your ${model.providerLabel} API key`,
            })
          }
        }),
    [models, setup.providers]
  )
  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { model: setup.settings.defaultModel ?? "", apiKey: "" },
  })
  const selected = models.find((item) => item.value === watch("model"))
  const selectedHasKey = setup.providers.some(
    (provider) => provider.keyName === selected?.keyName && provider.configured
  )
  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const model = models.find((item) => item.value === values.model)
      if (!model) throw new Error("Choose a model")
      if (values.apiKey) {
        const development = await findOrCreateDevelopmentEnvironment()
        await upsertSecretFn({
          data: {
            environmentId: development.id,
            key: model.keyName,
            value: values.apiKey,
          },
        })
      }
      await updateModelSettingsFn({ data: { defaultModel: values.model } })
    },
    onSuccess: async (_result, values) => {
      reset({ model: values.model, apiKey: "" })
      await queryClient.invalidateQueries({
        queryKey: modelSetupQueryOptions(slug).queryKey,
      })
    },
  })
  const providerGroups = [
    ...new Map(models.map((item) => [item.providerId, item.providerLabel])),
  ]
  return (
    <form
      onSubmit={(event) => {
        void handleSubmit((values) => save.mutate(values))(event)
      }}
    >
      <FieldGroup>
        <Field data-invalid={!!errors.model || undefined}>
          <FieldLabel htmlFor="model-setup-model">Model</FieldLabel>
          <Controller
            control={control}
            name="model"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="model-setup-model">
                  <SelectValue placeholder="Choose a model">
                    {(value: string) =>
                      models.find((item) => item.value === value)?.label ??
                      "Choose a model"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {providerGroups.map(([providerId, providerLabel]) => (
                    <SelectGroup key={providerId}>
                      <SelectLabel>{providerLabel}</SelectLabel>
                      {models
                        .filter((item) => item.providerId === providerId)
                        .map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError>{errors.model?.message}</FieldError>
        </Field>
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
                selectedHasKey ? "Key saved. Paste a new one to replace it" : ""
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
