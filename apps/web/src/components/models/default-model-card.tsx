import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { Button } from "@linea/ui/components/button"
import { Card } from "@linea/ui/components/card"
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

import {
  modelSetupQueryOptions,
  updateModelSettingsFn,
  type ModelSetup,
} from "@/lib/model-settings-api"

export function DefaultModelCard({
  slug,
  setup,
}: {
  slug: string
  setup: ModelSetup
}) {
  const queryClient = useQueryClient()
  const { models, defaultModel } = setup.settings
  const keyed = new Set(
    setup.providers
      .filter((provider) => provider.configured)
      .map((provider) => provider.keyName)
  )
  const [model, setModel] = useState(defaultModel ?? "")
  const save = useMutation({
    mutationFn: (value: string) =>
      updateModelSettingsFn({ data: { defaultModel: value } }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: modelSetupQueryOptions(slug).queryKey,
      }),
  })
  const providerGroups = [
    ...new Map(models.map((item) => [item.providerId, item.providerLabel])),
  ]
  return (
    <Card size="sm" className="gap-4 px-(--card-spacing)">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={model}
          onValueChange={(value) => value && setModel(value)}
          disabled={keyed.size === 0}
        >
          <SelectTrigger className="w-72" aria-label="Default model">
            <SelectValue
              placeholder={
                keyed.size === 0 ? "Add a provider key first" : "Choose a model"
              }
            >
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
                    <SelectItem
                      key={item.value}
                      value={item.value}
                      disabled={!keyed.has(item.keyName)}
                    >
                      {item.label}
                      {keyed.has(item.keyName) ? "" : " (no key)"}
                    </SelectItem>
                  ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="xs"
          disabled={!model || model === defaultModel || save.isPending}
          onClick={() => save.mutate(model)}
        >
          {save.isPending ? <Spinner /> : null}
          Save
        </Button>
      </div>
      {save.isError ? (
        <p className="text-xs text-destructive">{save.error.message}</p>
      ) : null}
    </Card>
  )
}
