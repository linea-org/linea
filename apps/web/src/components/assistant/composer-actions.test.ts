import { PaperclipIcon } from "lucide-react"
import { describe, expect, it } from "vitest"

import { slashMatches } from "./composer-actions"

const action = (id: string, label: string) => ({
  id,
  label,
  Icon: PaperclipIcon,
  run: () => undefined,
})
const actions = [action("files", "Add files"), action("web", "Browse the web")]
const ids = (value: string) => slashMatches(value, actions).map(({ id }) => id)

describe("slashMatches", () => {
  it("lists every action for a lone slash", () => {
    expect(ids("/")).toEqual(["files", "web"])
  })

  it("matches the start of any word, in any case", () => {
    expect(ids("/WE")).toEqual(["web"])
    expect(ids("/add")).toEqual(["files"])
  })

  it("leaves ordinary messages alone", () => {
    for (const value of ["", "hi", "a /", "/add files", "/usr/bin", "//"]) {
      expect(ids(value)).toEqual([])
    }
  })
})
