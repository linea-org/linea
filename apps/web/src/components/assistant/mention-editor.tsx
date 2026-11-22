import {
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react"
import { createPortal } from "react-dom"

import { cn } from "@linealabs/ui/lib/utils"

import { MentionChip } from "./mention-chip"
import {
  caretAtEnd,
  chipHosts,
  chipNextToCaret,
  insertTextAtCaret,
  removeChip,
  renderText,
  serializeEditor,
} from "./mention-editor-dom"
import { MentionPicker } from "./mention-picker"
import type { MentionKind } from "./mention-text"
import { useMentionPicker } from "./use-mention-picker"

const sameHosts = (a: HTMLElement[], b: HTMLElement[]) =>
  a.length === b.length && a.every((host, index) => host === b[index])

/**
 * A plain-text message with references shown as removable chips. The DOM is the source of truth
 * while typing; `value` is rewritten into it only when the parent changes it, such as on send.
 */
export function MentionEditor({
  value,
  onChange,
  onSendKey,
  label,
  placeholder,
  hero,
  workflowId,
}: Readonly<{
  value: string
  onChange: (value: string) => void
  onSendKey: (event: KeyboardEvent<HTMLElement>) => void
  label: string
  placeholder: string
  hero: boolean
  workflowId?: string
}>) {
  const root = useRef<HTMLDivElement>(null)
  const lastText = useRef<string | null>(null)
  const [hosts, setHosts] = useState<HTMLElement[]>([])

  function commit() {
    const element = root.current
    if (!element) return
    const text = serializeEditor(element)
    lastText.current = text
    onChange(text)
    const next = chipHosts(element)
    setHosts((prev) => (sameHosts(prev, next) ? prev : next))
  }

  const mentions = useMentionPicker({ root, workflowId, onInserted: commit })

  useLayoutEffect(() => {
    const element = root.current
    if (!element || value === lastText.current) return
    renderText(element, value)
    lastText.current = value
    setHosts(chipHosts(element))
    if (document.activeElement === element) caretAtEnd(element)
  }, [value])

  useLayoutEffect(() => {
    if (hero) root.current?.focus()
  }, [hero])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (mentions.handleKeyDown(event)) return
    const plain = !(
      event.shiftKey ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    )
    if (
      plain &&
      !event.nativeEvent.isComposing &&
      (event.key === "Backspace" || event.key === "Delete")
    ) {
      const chip = root.current
        ? chipNextToCaret(
            root.current,
            event.key === "Backspace" ? "before" : "after"
          )
        : null
      if (chip && root.current) {
        event.preventDefault()
        removeChip(root.current, chip)
        commit()
        return
      }
    }
    onSendKey(event)
  }

  function onPaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault()
    if (!root.current) return
    insertTextAtCaret(root.current, event.clipboardData.getData("text/plain"))
    commit()
  }

  return (
    <>
      {mentions.open ? (
        <MentionPicker
          ref={mentions.pickerRef}
          items={mentions.items}
          activeKey={mentions.activeKey}
          onActiveChange={mentions.setActive}
          onPick={mentions.pick}
          isLoading={mentions.isLoading}
          error={mentions.error}
        />
      ) : null}
      <div className="relative w-full flex-1">
        {value === "" ? (
          <span className="pointer-events-none absolute top-2 left-3 text-base text-muted-foreground md:text-sm">
            {placeholder}
          </span>
        ) : null}
        <div
          ref={root}
          data-slot="input-group-control"
          // plaintext-only keeps typed and dropped text free of formatting and markup.
          contentEditable="plaintext-only"
          suppressContentEditableWarning
          role={mentions.open ? "combobox" : "textbox"}
          aria-multiline="true"
          aria-label={label}
          aria-expanded={mentions.open ? true : undefined}
          aria-haspopup={mentions.open ? "listbox" : undefined}
          aria-autocomplete={mentions.open ? "list" : undefined}
          spellCheck
          onInput={() => {
            commit()
            mentions.refresh()
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          className={cn(
            "block w-full overflow-y-auto px-3 py-2 text-base break-words whitespace-pre-wrap outline-none md:text-sm",
            hero ? "max-h-60 min-h-24" : "max-h-40 min-h-16"
          )}
        />
        {hosts.map((host) =>
          createPortal(
            <MentionChip
              kind={host.dataset.mentionKind as MentionKind}
              label={host.dataset.label ?? ""}
              onRemove={() => {
                if (!root.current) return
                root.current.focus()
                removeChip(root.current, host)
                commit()
              }}
            />,
            host,
            host.dataset.chipKey
          )
        )}
      </div>
    </>
  )
}
