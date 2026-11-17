import { Controller, type Control } from "react-hook-form"

import { Field, FieldError, FieldLabel } from "@linealabs/ui/components/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@linealabs/ui/components/select"

import type { ModelSetup } from "@/lib/model-settings-api"

import type { ModelSetupValues } from "./model-setup-schema"

export function ModelPickerField({
  control,
  models,
  error,
}: Readonly<{
  control: Control<ModelSetupValues>
  models: ModelSetup["settings"]["models"]
  error: string | undefined
}>) {
  const providerGroups = [
    ...new Map(models.map((item) => [item.providerId, item.providerLabel])),
  ]
  return (
    <Field data-invalid={!!error || undefined}>
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
      <FieldError>{error}</FieldError>
    </Field>
  )
}
