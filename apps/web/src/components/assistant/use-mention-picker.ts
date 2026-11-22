import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react"

import {
  insertMentionAtTrigger,
  mentionTriggerAtCaret,
  type MentionTriggerAtCaret,
} from "./mention-editor-dom"
import {
  filterMentions,
  mentionKey,
  type MentionCandidate,
} from "./mention-text"
import { useMentionCandidates } from "./use-mention-candidates"

const sameTrigger = (
  a: MentionTriggerAtCaret | null,
  b: MentionTriggerAtCaret | null
) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.node === b.node &&
    a.start === b.start &&
    a.end === b.end)

export function useMentionPicker({
  root,
  workflowId,
  onInserted,
}: {
  root: RefObject<HTMLElement | null>
  workflowId: string | undefined
  onInserted: () => void
}) {
  const pickerRef = useRef<HTMLDivElement>(null)
  const [trigger, setTrigger] = useState<MentionTriggerAtCaret | null>(null)
  const [dismissed, setDismissed] = useState<MentionTriggerAtCaret | null>(null)
  const [active, setActive] = useState<string | null>(null)

  const refresh = useCallback(() => {
    const next = root.current ? mentionTriggerAtCaret(root.current) : null
    setTrigger((prev) => (sameTrigger(prev, next) ? prev : next))
    setDismissed((prev) =>
      next && prev && next.node === prev.node && next.start === prev.start
        ? prev
        : null
    )
  }, [root])

  useEffect(() => {
    document.addEventListener("selectionchange", refresh)
    return () => document.removeEventListener("selectionchange", refresh)
  }, [refresh])

  const open =
    trigger !== null &&
    !(
      dismissed &&
      dismissed.node === trigger.node &&
      dismissed.start === trigger.start
    )
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

  function pick(candidate: MentionCandidate) {
    if (!root.current || !trigger) return
    insertMentionAtTrigger(root.current, trigger, candidate, candidate.label)
    setTrigger(null)
    onInserted()
  }

  // cmdk generates its own element ids, so the editor points at them after each render.
  useLayoutEffect(() => {
    const element = root.current
    if (!element) return
    const list = pickerRef.current?.querySelector("[cmdk-list]")?.id
    const option = [
      ...(pickerRef.current?.querySelectorAll("[cmdk-item]") ?? []),
    ].find((node) => node.getAttribute("data-value") === activeKey)?.id
    for (const [name, id] of [
      ["aria-controls", list],
      ["aria-activedescendant", option],
    ] as const) {
      if (open && id) element.setAttribute(name, id)
      else element.removeAttribute(name)
    }
  })

  /** Returns true when the key belonged to the open picker, so the editor must ignore it. */
  function handleKeyDown(event: KeyboardEvent<HTMLElement>): boolean {
    if (!trigger || !open || event.nativeEvent.isComposing) return false
    if (event.key === "Escape") {
      // React listens on document, as does the page-wide Escape handler that would blur the editor.
      event.nativeEvent.stopImmediatePropagation()
      event.preventDefault()
      setDismissed(trigger)
      return true
    }
    if (event.shiftKey || event.metaKey || event.ctrlKey) return false
    if (items.length === 0) {
      // Matches may still be arriving, so Enter must not send a half-typed "@wor".
      if (!(isLoading && event.key === "Enter")) return false
      event.preventDefault()
      return true
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
    pickerRef,
    open,
    items,
    activeKey,
    setActive,
    pick,
    isLoading,
    error,
    handleKeyDown,
    refresh,
  }
}
