import { useState } from "react"

import type { Attachment } from "@/lib/attachments"
import type { CatalogModel, ModelSetup } from "@/lib/model-settings-api"

export type ComposerOptions = {
  /** Every model, so the picker can show what is missing a key. */
  models: CatalogModel[]
  /** Key names that have a key; only their models can run. */
  keyed: ReadonlySet<string>
  model: CatalogModel | null
  onModelChange: (value: string) => void
  web: boolean
  onWebChange: (value: boolean) => void
  attachments: Attachment[]
  onAttachmentsChange: (value: Attachment[]) => void
}

export function useComposerOptions(
  setup: ModelSetup | undefined
): ComposerOptions {
  const [chosen, setChosen] = useState<string | null>(null)
  const [web, setWeb] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const keyed = new Set(
    (setup?.providers ?? [])
      .filter((provider) => provider.configured)
      .map((provider) => provider.keyName)
  )
  const models = setup?.settings.models ?? []
  const value = chosen ?? setup?.settings.defaultModel
  return {
    models,
    keyed,
    model:
      models.find(
        (model) => model.value === value && keyed.has(model.keyName)
      ) ?? null,
    onModelChange: setChosen,
    web,
    onWebChange: setWeb,
    attachments,
    onAttachmentsChange: setAttachments,
  }
}
