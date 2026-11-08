import type { ComponentProps, KeyboardEvent } from "react"
import { Textarea } from "@linea/ui/components/textarea"
import { jsonStringContext } from "./json-string-context"

const pairs: Record<string, string> = {
  "{": "}",
  "[": "]",
  "(": ")",
  '"': '"',
}

const closers = new Set(["}", "]", ")", '"'])

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

type JsonEdit = {
  event: KeyboardEvent<HTMLTextAreaElement>
  element: HTMLTextAreaElement
  start: number
  end: number
  value: string
  context: ReturnType<typeof jsonStringContext>
}

function deletePair({ event, element, start, value, context }: JsonEdit) {
  const close = pairs[value[start - 1] ?? ""]
  const openingQuote =
    value[start - 1] === '"' && !jsonStringContext(value, start - 1).inString
  if (close && value[start] === close && (!context.inString || openingQuote)) {
    event.preventDefault()
    write(element, start - 1, start + 1, "", start - 1)
  }
}

function indentSelection({ event, element, start, end, value }: JsonEdit) {
  event.preventDefault()
  const indentAt = lineStart(value, start)
  if (event.shiftKey && value.slice(indentAt, indentAt + 2) === "  ") {
    write(element, indentAt, indentAt + 2, "", Math.max(indentAt, start - 2))
    return
  }
  if (!event.shiftKey) write(element, start, end, "  ", start + 2)
}

function insertNewline({ event, element, start, end, value }: JsonEdit) {
  const indent =
    value.slice(lineStart(value, start), start).match(/^[ \t]*/)?.[0] ?? ""
  const before = value[start - 1]
  const after = value[start]
  if ((before === "{" && after === "}") || (before === "[" && after === "]")) {
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
}

function overtypesClosing({ event, start, end, value, context }: JsonEdit) {
  if (!closers.has(event.key) || start !== end || value[start] !== event.key) {
    return false
  }
  return event.key === '"'
    ? context.inString && !context.escaped
    : !context.inString
}

function insertPair({ event, element, start, end, value, context }: JsonEdit) {
  const close = pairs[event.key]
  if (!close || context.inString) return
  event.preventDefault()
  if (start === end) {
    write(element, start, end, event.key + close, start + 1)
    return
  }
  write(
    element,
    start,
    end,
    event.key + value.slice(start, end) + close,
    end + 1
  )
}

function editJsonText(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const element = event.currentTarget
  const { selectionStart: start, selectionEnd: end, value } = element
  const edit: JsonEdit = {
    event,
    element,
    start,
    end,
    value,
    context: jsonStringContext(value, start),
  }
  if (event.key === "Backspace" && start === end && start > 0) {
    deletePair(edit)
  } else if (event.key === "Tab") {
    indentSelection(edit)
  } else if (event.key === "Enter" && start === end) {
    insertNewline(edit)
  } else if (overtypesClosing(edit)) {
    event.preventDefault()
    element.setSelectionRange(start + 1, start + 1)
  } else {
    insertPair(edit)
  }
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
