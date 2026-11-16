import {
  providers,
  registry,
  resolveKeyName,
  resolveProviderId,
} from '@linea/ai'
import { nodeRegistry } from '@linea/runtime'

export type CatalogModel = {
  value: string
  label: string
  providerId: string
  providerLabel: string
  keyName: string
}

export function buildModelCatalog(): CatalogModel[] {
  const labels = new Map(
    nodeRegistry.ai.ui.fields
      .find((field) => field.key === 'model')
      ?.options?.map((option) => [option.value, option.label]) ?? [],
  )
  return Object.keys(registry).map((value) => {
    const providerId = resolveProviderId(value)
    const provider = providers.find((item) => item.id === providerId)
    if (!provider) throw new Error(`No provider registered for "${value}"`)
    return {
      value,
      label: labels.get(value) ?? value,
      providerId: provider.id,
      providerLabel: provider.label,
      keyName: resolveKeyName(value),
    }
  })
}
