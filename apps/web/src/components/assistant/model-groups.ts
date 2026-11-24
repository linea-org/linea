import type { CatalogModel } from "@/lib/model-settings-api"

export type ModelGroup = { id: string; label: string; models: CatalogModel[] }

const LATEST_PER_PROVIDER = 2

function byProvider(models: CatalogModel[]): ModelGroup[] {
  const groups = new Map<string, ModelGroup>()
  for (const model of models) {
    const { providerId: id, providerLabel: label } = model
    const group = groups.get(id) ?? { id, label, models: [] }
    group.models.push(model)
    groups.set(id, group)
  }
  return [...groups.values()]
}

/** Splits the catalog, which lists each provider's newest model first, into the menu's levels. */
export function modelMenu(
  models: CatalogModel[],
  keyed: ReadonlySet<string>,
  selected: CatalogModel | null
) {
  const ready = models.filter((model) => keyed.has(model.keyName))
  const newest = new Set(
    byProvider(ready).flatMap((group) =>
      group.models.slice(0, LATEST_PER_PROVIDER)
    )
  )
  if (selected) newest.add(selected)
  return {
    latest: ready.filter((model) => newest.has(model)),
    more: byProvider(ready.filter((model) => !newest.has(model))),
    locked: byProvider(models.filter((model) => !keyed.has(model.keyName))),
  }
}
