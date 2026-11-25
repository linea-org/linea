import { describe, expect, it } from "vitest"

import type { CatalogModel } from "@/lib/model-settings-api"
import { modelMenu } from "./model-groups"

const model = (providerId: string, value: string): CatalogModel => ({
  value,
  label: value,
  providerId,
  providerLabel: providerId,
  keyName: `${providerId}_KEY`,
})
const models = [
  model("a", "a1"),
  model("a", "a2"),
  model("a", "a3"),
  model("b", "b1"),
]
const names = (items: CatalogModel[]) => items.map(({ value }) => value)
const grouped = (groups: { id: string; models: CatalogModel[] }[]) =>
  groups.map((group) => [group.id, names(group.models)])

describe("modelMenu", () => {
  it("shows the newest models that have a key and keeps the rest a level down", () => {
    const menu = modelMenu(models, new Set(["a_KEY"]), null)
    expect(names(menu.latest)).toEqual(["a1", "a2"])
    expect(grouped(menu.more)).toEqual([["a", ["a3"]]])
    expect(grouped(menu.locked)).toEqual([["b", ["b1"]]])
  })

  it("always shows the selected model", () => {
    const menu = modelMenu(models, new Set(["a_KEY"]), models[2])
    expect(names(menu.latest)).toEqual(["a1", "a2", "a3"])
    expect(menu.more).toEqual([])
  })

  it("only offers providers to add when there is no key", () => {
    const menu = modelMenu(models, new Set(), null)
    expect(menu.latest).toEqual([])
    expect(grouped(menu.locked)).toEqual([
      ["a", ["a1", "a2", "a3"]],
      ["b", ["b1"]],
    ])
  })
})
