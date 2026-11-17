import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { Button } from "@linea/ui/components/button"
import { Checkbox } from "@linea/ui/components/checkbox"
import { DialogFooter } from "@linea/ui/components/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"
import { Label } from "@linea/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linea/ui/components/select"

import { createApiKeyInputSchema } from "@/lib/api-keys-api"
import {
  accessOptions,
  customScopes,
  expiryOptions,
  presetScopes,
  type AccessPreset,
} from "./api-key-access"

const formSchema = createApiKeyInputSchema.extend({
  access: z.enum(["read", "run", "full", "custom"]),
})

type FormValues = z.infer<typeof formSchema>
export type CreateApiKeyValues = z.infer<typeof createApiKeyInputSchema>

export function CreateApiKeyForm({
  defaultAccess,
  pending,
  onSubmit,
}: Readonly<{
  defaultAccess: Exclude<AccessPreset, "custom">
  pending: boolean
  onSubmit: (values: CreateApiKeyValues) => void
}>) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      access: defaultAccess,
      scopes: presetScopes[defaultAccess],
      expiresInDays: 90,
    },
  })
  const access = watch("access")
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        void handleSubmit(({ name, scopes, expiresInDays }) =>
          onSubmit({ name, scopes, expiresInDays })
        )(event)
      }}
    >
      <FieldGroup>
        <Field data-invalid={!!errors.name || undefined}>
          <FieldLabel htmlFor="api-key-name">Name</FieldLabel>
          <Input
            id="api-key-name"
            placeholder="Production backend"
            autoFocus
            {...register("name")}
          />
          <FieldError>{errors.name?.message}</FieldError>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="api-key-access">Access</FieldLabel>
            <Select
              items={accessOptions}
              value={access}
              onValueChange={(value) => {
                if (!value) return
                setValue("access", value)
                if (value !== "custom") setValue("scopes", presetScopes[value])
              }}
            >
              <SelectTrigger id="api-key-access" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accessOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="api-key-expiry">Expires in</FieldLabel>
            <Controller
              name="expiresInDays"
              control={control}
              render={({ field }) => (
                <Select
                  items={expiryOptions}
                  value={field.value}
                  onValueChange={(value) => {
                    if (value) field.onChange(value)
                  }}
                >
                  <SelectTrigger id="api-key-expiry" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {expiryOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>
        {access === "custom" ? (
          <Field data-invalid={!!errors.scopes || undefined}>
            <FieldLabel>Scopes</FieldLabel>
            <Controller
              name="scopes"
              control={control}
              render={({ field }) => (
                <div className="grid gap-2 sm:grid-cols-2">
                  {customScopes.map((scope) => (
                    <Label key={scope} className="font-normal">
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
                      <code className="text-sm">{scope}</code>
                    </Label>
                  ))}
                </div>
              )}
            />
            <FieldError>{errors.scopes?.message}</FieldError>
          </Field>
        ) : null}
      </FieldGroup>
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create key"}
        </Button>
      </DialogFooter>
    </form>
  )
}
