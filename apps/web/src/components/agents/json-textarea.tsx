import type { ComponentProps, KeyboardEvent } from "react"
import { Textarea } from "@linea/ui/components/textarea"
import { jsonStringContext } from "./json-string-context"

const pairs: Record<string, string> = {
  "{": "}",
  "[": "]",
  "(": ")",
  '"': '"',
}

function write(
  element: HTMLTextAreaElement,
  start: number,
  end: number,
  text: string,
  caret: number
) {
  element.setRangeText(text, start, end, "end")
  element.setSelectionRange(caret, caret)
  element.dispatchEvent(new Event("input", { bubbles: true }))
}

function lineStart(value: string, index: number) {
  return value.lastIndexOf("\n", index - 1) + 1
}

function editJsonText(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const element = event.currentTarget
  const start = element.selectionStart
  const end = element.selectionEnd
  const value = element.value
  const context = jsonStringContext(value, start)
  if (event.key === "Backspace" && start === end && start > 0) {
    const close = pairs[value[start - 1] ?? ""]
    const openingQuote =
      value[start - 1] === '"' && !jsonStringContext(value, start - 1).inString
    if (
      close &&
      value[start] === close &&
      (!context.inString || openingQuote)
    ) {
      event.preventDefault()
      write(element, start - 1, start + 1, "", start - 1)
    }
    return
  }
  if (event.key === "Tab") {
    event.preventDefault()
    const indentAt = lineStart(value, start)
    if (event.shiftKey && value.slice(indentAt, indentAt + 2) === "  ") {
      write(element, indentAt, indentAt + 2, "", Math.max(indentAt, start - 2))
      return
    }
    if (!event.shiftKey) write(element, start, end, "  ", start + 2)
    return
  }
  if (event.key === "Enter" && start === end) {
    const indent =
      value.slice(lineStart(value, start), start).match(/^[ \t]*/)?.[0] ?? ""
    const before = value[start - 1]
    const after = value[start]
    if (
      (before === "{" && after === "}") ||
      (before === "[" && after === "]")
    ) {
      event.preventDefault()
      const inner = `${indent}  `
      write(
        element,
        start,
        end,
        `\n${inner}\n${indent}`,
        start + 1 + inner.length
      )
      return
    }
    if (indent.length > 0) {
      event.preventDefault()
      write(element, start, end, `\n${indent}`, start + 1 + indent.length)
    }
    return
  }
  if (
    (event.key === "}" ||
      event.key === "]" ||
      event.key === ")" ||
      event.key === '"') &&
    start === end &&
    value[start] === event.key &&
    (event.key === '"'
      ? context.inString && !context.escaped
      : !context.inString)
  ) {
    event.preventDefault()
    element.setSelectionRange(start + 1, start + 1)
    return
  }
  const close = pairs[event.key]
  if (!close || context.inString) return
  if (start !== end) {
    event.preventDefault()
    write(
      element,
      start,
      end,
      event.key + value.slice(start, end) + close,
      end + 1
    )
    return
  }
  event.preventDefault()
  write(element, start, end, event.key + close, start + 1)
}

export function JsonTextarea({
  onKeyDown,
  ...props
}: ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      spellCheck={false}
      {...props}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (!event.defaultPrevented) editJsonText(event)
      }}
    />
  )
}
