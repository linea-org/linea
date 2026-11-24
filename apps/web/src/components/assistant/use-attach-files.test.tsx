// @vitest-environment jsdom
import { act, useState } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"

import type { Attachment } from "@/lib/attachments"
import { useAttachFiles } from "./use-attach-files"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

it("keeps every file when a second batch arrives during a slow read", async () => {
  let files: Attachment[] = []
  let attach: (files: File[]) => void = () => undefined
  function Harness() {
    const [attachments, setAttachments] = useState<Attachment[]>([])
    files = attachments
    attach = useAttachFiles(attachments, setAttachments).attach
    return null
  }
  const root = createRoot(document.createElement("div"))
  act(() => root.render(<Harness />))

  let finish: ((text: string) => void) | undefined
  const slow = new File(["slow"], "slow.txt", { type: "text/plain" })
  slow.text = () => new Promise((resolve) => (finish = resolve))
  const quick = new File(["quick"], "quick.txt", { type: "text/plain" })
  quick.text = () => Promise.resolve("quick")
  await act(async () => {
    attach([slow])
    attach([quick])
    await vi.waitFor(() => expect(finish).not.toBeUndefined())
  })
  await act(async () => {
    finish?.("slow")
    await vi.waitFor(() => undefined)
  })
  await act(() => vi.waitFor(() => expect(files).toHaveLength(2)))
  expect(files.map(({ name }) => name)).toEqual(["slow.txt", "quick.txt"])
  act(() => root.unmount())
})
