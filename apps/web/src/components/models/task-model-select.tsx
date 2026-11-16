import { useEffect, useState } from "react"
import { CheckIcon } from "lucide-react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@linea/ui/components/select"
import { Spinner } from "@linea/ui/components/spinner"

import {
  modelSetupQueryOptions,
  updateModelSettingsFn,
  type ModelSetup,
  type TaskModelKey,
} from "@/lib/model-settings-api"

const SAVED_VISIBLE_MS = 2000

// Select values can't be null, so the "unset" choice travels as this sentinel.
const UNSET = "unset"

export function TaskModelSelect({
  slug,
  setup,
  task,
  label,
  unsetLabel,
}: {
  slug: string
  setup: ModelSetup
  task: TaskModelKey
  label: string
  unsetLabel: string | null
}) {
  const queryClient = useQueryClient()
  const { models } = setup.settings
  const keyed = new Set(
    setup.providers
      .filter((provider) => provider.configured)
      .map((provider) => provider.keyName)
  )
  const [model, setModel] = useState(setup.settings[task] ?? UNSET)
  const chosen = models.find((item) => item.value === model)
  const save = useMutation({
    mutationFn: (value: string) =>
      updateModelSettingsFn({
        data: { [task]: value === UNSET ? null : value },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: modelSetupQueryOptions(slug).queryKey,
      }),
  })
  const { isSuccess, reset } = save
  useEffect(() => {
    if (!isSuccess) return
    const timer = setTimeout(reset, SAVED_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [isSuccess, reset])
  const providerGroups = [
    ...new Map(models.map((item) => [item.providerId, item.providerLabel])),
  ]
  const placeholder =
    keyed.size === 0 ? "Add a provider key first" : "Choose a model"
  return (
    <div className="flex min-w-0 flex-row-reverse flex-wrap items-center gap-3">
      <Select
        value={model}
        onValueChange={(value) => {
          if (!value || value === model) return
          setModel(value)
          save.mutate(value)
        }}
        disabled={keyed.size === 0 && unsetLabel === null}
      >
        <SelectTrigger size="sm" className="w-64" aria-label={label}>
          <SelectValue>
            {(value: string) =>
              value === UNSET
                ? (unsetLabel ?? placeholder)
                : (models.find((item) => item.value === value)?.label ??
                  placeholder)
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {unsetLabel ? (
            <>
              <SelectItem value={UNSET}>{unsetLabel}</SelectItem>
              <SelectSeparator />
            </>
          ) : null}
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
                    {keyed.has(item.keyName) ? null : (
                      <span className="ml-auto text-xs text-muted-foreground">
                        No key
                      </span>
                    )}
                  </SelectItem>
                ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {save.isPending ? (
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Spinner className="size-3.5" />
          Saving
        </span>
      ) : save.isSuccess ? (
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CheckIcon className="size-3.5" />
          Saved
        </span>
      ) : null}
      {chosen && !keyed.has(chosen.keyName) ? (
        <span className="text-sm text-warning">
          Add a {chosen.providerLabel} key to use this model.
        </span>
      ) : null}
      {save.isError ? (
        <span className="text-sm text-destructive">{save.error.message}</span>
      ) : null}
    </div>
  )
}
