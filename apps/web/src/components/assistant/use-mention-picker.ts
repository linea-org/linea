import {
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type SyntheticEvent,
} from "react"

import { useFlag } from "@/lib/use-flag"
import {
  filterMentions,
  findMentionTrigger,
  insertMention,
  mentionKey,
  type MentionCandidate,
} from "./mention-text"
import { useMentionCandidates } from "./use-mention-candidates"

type TextareaEvent =
  SyntheticEvent<HTMLTextAreaElement> | ChangeEvent<HTMLTextAreaElement>

export function useMentionPicker({
  value,
  onChange,
  workflowId,
}: {
  value: string
  onChange: (value: string) => void
  workflowId: string | undefined
}) {
  const enabled = useFlag("assistantMentions")
  const textarea = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLDivElement>(null)
  const pendingCaret = useRef<number | null>(null)
  const [caret, setCaret] = useState(0)
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const [active, setActive] = useState<string | null>(null)

  const trigger = enabled ? findMentionTrigger(value, caret) : null
  const open = trigger !== null && trigger.start !== dismissedAt
  const { candidates, isLoading, error } = useMentionCandidates(
    open,
    workflowId
  )
  const items = trigger && open ? filterMentions(candidates, trigger.query) : []
  const activeKey = items.some((item) => mentionKey(item) === active)
    ? active
    : items[0]
      ? mentionKey(items[0])
      : null

  function track(event: TextareaEvent) {
    const { selectionStart, value: text } = event.currentTarget
    setCaret(selectionStart)
    const next = findMentionTrigger(text, selectionStart)
    setDismissedAt((at) => (next?.start === at ? at : null))
  }

  function pick(candidate: MentionCandidate) {
    const element = textarea.current
    if (!element || !trigger) return
    const next = insertMention(
      value,
      element.selectionStart,
      trigger,
      candidate
    )
    pendingCaret.current = next.caret
    setCaret(next.caret)
    onChange(next.text)
  }

  useLayoutEffect(() => {
    const element = textarea.current
    if (!element || pendingCaret.current === null) return
    element.setSelectionRange(pendingCaret.current, pendingCaret.current)
    element.focus()
    pendingCaret.current = null
  }, [value])

  // cmdk generates its own element ids, so the textarea points at them after each render.
  useLayoutEffect(() => {
    const element = textarea.current
    if (!element) return
    const list = picker.current?.querySelector("[cmdk-list]")?.id
    const option = [
      ...(picker.current?.querySelectorAll("[cmdk-item]") ?? []),
    ].find((node) => node.getAttribute("data-value") === activeKey)?.id
    for (const [name, id] of [
      ["aria-controls", list],
      ["aria-activedescendant", option],
    ] as const) {
      if (open && id) element.setAttribute(name, id)
      else element.removeAttribute(name)
    }
  })

  /** Returns true when the key belonged to the open picker, so the composer must ignore it. */
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!trigger || !open || event.nativeEvent.isComposing) return false
    if (event.key === "Escape") {
      // React listens on document, as does the page-wide Escape handler that would blur the textarea.
      event.nativeEvent.stopImmediatePropagation()
      event.preventDefault()
      setDismissedAt(trigger.start)
      return true
    }
    if (
      items.length === 0 ||
      event.shiftKey ||
      event.metaKey ||
      event.ctrlKey
    ) {
      return false
    }
    const index = items.findIndex((item) => mentionKey(item) === activeKey)
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const step = event.key === "ArrowDown" ? 1 : -1
      setActive(mentionKey(items[(index + step + items.length) % items.length]))
    } else if (event.key === "Enter" || event.key === "Tab") {
      pick(items[index])
    } else {
      return false
    }
    event.preventDefault()
    return true
  }

  return {
    textarea,
    picker,
    open,
    items,
    activeKey,
    setActive,
    pick,
    isLoading,
    error,
    track,
    handleKeyDown,
    inputAria: open
      ? ({
          role: "combobox",
          "aria-expanded": true,
          "aria-haspopup": "listbox",
          "aria-autocomplete": "list",
        } as const)
      : {},
  }
}
