import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { PlusIcon, XIcon } from "lucide-react"
import { Button } from "@linea/ui/components/button"
import { Input } from "@linea/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linea/ui/components/select"
import { Textarea } from "@linea/ui/components/textarea"

type ValueKind = "text" | "number" | "boolean" | "json"

// `value` is what gets saved; `valueText` is only the editor contents, kept separate so
// editing one row never re-stringifies another row's nested object. `error` is set when
// valueText doesn't parse as its declared kind — value then keeps its last valid parse rather
// than falling back to raw text, so the saved runtime type never disagrees with the kind shown.
type Row = {
  id: string
  key: string
  kind: ValueKind
  value: unknown
  valueText: string
  error?: string
}

const KIND_OPTIONS: { label: string; value: ValueKind }[] = [
  { label: "Text", value: "text" },
  { label: "Number", value: "number" },
  { label: "Boolean", value: "boolean" },
  { label: "JSON", value: "json" },
]

const PAIRS: Record<string, string> = { "{": "}", "[": "]", '"': '"' }

function emptyRow(): Row {
  return {
    id: crypto.randomUUID(),
    key: "",
    kind: "text",
    value: "",
    valueText: "",
  }
}

function kindFromValue(value: unknown): ValueKind {
  if (typeof value === "number") return "number"
  if (typeof value === "boolean") return "boolean"
  if (value === null || Array.isArray(value)) return "json"
  if (typeof value === "object") return "json"
  return "text"
}

// Plain String(x) on an unknown value risks "[object Object]" for anything non-primitive.
function stringifyLiteral(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  if (value === undefined || value === null) return ""
  return JSON.stringify(value)
}

function textFromValue(value: unknown, kind: ValueKind): string {
  if (kind === "json") {
    if (typeof value === "string") return value
    // JSON.stringify returns undefined (not a string) for undefined/functions/symbols.
    return JSON.stringify(value, null, 2) ?? ""
  }
  if (kind === "boolean") return value === true ? "true" : "false"
  return stringifyLiteral(value)
}

type ParseResult = { ok: true; value: unknown } | { ok: false; error: string }

// Returns `ok: false` instead of silently falling back to raw text — the caller keeps the row's
// last valid value in that case, so an invalid Number/JSON draft never gets saved as a plain
// string that disagrees with the kind the editor still shows for that row.
function parseKind(kind: ValueKind, text: string): ParseResult {
  if (kind === "number") {
    const trimmed = text.trim()
    if (trimmed === "") return { ok: true, value: "" }
    const parsed = Number(trimmed)
    return Number.isFinite(parsed)
      ? { ok: true, value: parsed }
      : { ok: false, error: "Not a valid number" }
  }
  if (kind === "boolean") return { ok: true, value: text === "true" }
  if (kind === "json") {
    if (text.trim() === "") return { ok: true, value: {} }
    try {
      return { ok: true, value: JSON.parse(text) }
    } catch {
      return { ok: false, error: "Invalid JSON" }
    }
  }
  return { ok: true, value: text }
}

function coerceKind(kind: ValueKind, current: unknown): unknown {
  if (kind === "text") {
    return stringifyLiteral(current)
  }
  if (kind === "number") {
    if (typeof current === "number" && Number.isFinite(current)) return current
    const parsed = Number(current)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (kind === "boolean") return current === true || current === "true"
  if (typeof current === "object" && current !== null) return current
  if (typeof current === "string" && current.trim() !== "") {
    try {
      return JSON.parse(current)
    } catch {
      return {}
    }
  }
  return {}
}

// `typed` off (e.g. HTTP headers) forces every row to plain text, regardless of what's actually
// stored — headers must stay strings, so a pre-existing non-string value (from before this editor
// existed, or restored via undo) is coerced to its string form rather than surfacing a hidden
// number/boolean/JSON kind that later edits would keep silently re-parsing into.
function toRows(value: unknown, typed: boolean): Row[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [emptyRow()]
  }
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return [emptyRow()]
  return entries.map(([key, v]) => {
    const kind = typed ? kindFromValue(v) : "text"
    return {
      id: crypto.randomUUID(),
      key,
      kind,
      value: typed ? v : stringifyLiteral(v),
      valueText: typed ? textFromValue(v, kind) : stringifyLiteral(v),
    }
  })
}

function toObject(rows: Row[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const row of rows) {
    const key = row.key.trim()
    if (key) result[key] = row.value
  }
  return result
}

function applyPair(
  text: string,
  start: number,
  end: number,
  open: string
): { next: string; cursor: number } | null {
  const close = PAIRS[open]
  if (!close) return null
  if (start === end && text[start] === close && open === close) {
    return { next: text, cursor: start + 1 }
  }
  const selected = text.slice(start, end)
  return {
    next: text.slice(0, start) + open + selected + close + text.slice(end),
    cursor: start + open.length + selected.length,
  }
}

function applyBackspacePair(
  text: string,
  start: number,
  end: number
): { next: string; cursor: number } | null {
  if (start !== end || start === 0) return null
  const close = PAIRS[text[start - 1] ?? ""]
  if (!close || text[start] !== close) return null
  return {
    next: text.slice(0, start - 1) + text.slice(start + 1),
    cursor: start - 1,
  }
}

export function KeyValueEditor({
  id,
  value,
  onChange,
  typed = false,
}: {
  id: string
  value: unknown
  onChange: (value: Record<string, unknown>) => void
  typed?: boolean
}) {
  const [rows, setRows] = useState<Row[]>(() => toRows(value, typed))
  // Tracks the object shape we ourselves last emitted, so the effect below can tell "the parent
  // echoed our own edit back down" (skip — resyncing would reset every row's id mid-keystroke and
  // steal input focus) apart from "something else changed this node's config" — undo/redo, a
  // collaborative update, or switching operation and back — which the mounted editor otherwise has
  // no way to notice, since useState's initializer only runs once at mount.
  const lastEmitted = useRef(value)
  useEffect(() => {
    if (JSON.stringify(value) === JSON.stringify(lastEmitted.current)) return
    lastEmitted.current = value
    setRows(toRows(value, typed))
  }, [value, typed])
  function commit(next: Row[]) {
    const obj = toObject(next)
    lastEmitted.current = obj
    setRows(next)
    onChange(obj)
  }
  function updateRow(rowId: string, patch: Partial<Row>) {
    commit(rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)))
  }
  function setKind(row: Row, kind: ValueKind) {
    const nextValue = coerceKind(kind, row.value)
    updateRow(row.id, {
      kind,
      value: nextValue,
      valueText: textFromValue(nextValue, kind),
      error: undefined,
    })
  }
  function setValueText(row: Row, valueText: string) {
    if (!typed) {
      updateRow(row.id, { valueText, value: valueText, error: undefined })
      return
    }
    const result = parseKind(row.kind, valueText)
    if (result.ok) {
      updateRow(row.id, { valueText, value: result.value, error: undefined })
    } else {
      // Keeps row.value at its last valid parse — commit() below still fires so the key/other
      // rows' edits aren't blocked, but this row's own saved value doesn't change until it's valid.
      updateRow(row.id, { valueText, error: result.error })
    }
  }
  function addRow() {
    setRows((prev) => [...prev, emptyRow()])
  }
  function removeRow(rowId: string) {
    const next = rows.filter((row) => row.id !== rowId)
    commit(next.length > 0 ? next : [emptyRow()])
  }
  function handleEditorKey(
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    row: Row
  ) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      if (row.key.trim()) addRow()
      return
    }
    if (!typed || row.kind !== "json") return
    const target = event.currentTarget
    const start = target.selectionStart ?? 0
    const end = target.selectionEnd ?? 0
    if (event.key === "Backspace") {
      const paired = applyBackspacePair(row.valueText, start, end)
      if (!paired) return
      event.preventDefault()
      setValueText(row, paired.next)
      queueMicrotask(() => {
        target.selectionStart = target.selectionEnd = paired.cursor
      })
      return
    }
    const paired = applyPair(row.valueText, start, end, event.key)
    if (!paired) return
    event.preventDefault()
    setValueText(row, paired.next)
    queueMicrotask(() => {
      target.selectionStart = target.selectionEnd = paired.cursor
    })
  }
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <div key={row.id} className="flex items-start gap-2">
          <Input
            id={index === 0 ? id : undefined}
            placeholder="Key"
            value={row.key}
            className="h-8 w-24 shrink-0"
            onChange={(e) => updateRow(row.id, { key: e.target.value })}
            onKeyDown={(e) => handleEditorKey(e, row)}
          />
          {typed ? (
            <Select
              items={KIND_OPTIONS}
              value={row.kind}
              onValueChange={(next) => {
                if (
                  next === "text" ||
                  next === "number" ||
                  next === "boolean" ||
                  next === "json"
                ) {
                  setKind(row, next)
                }
              }}
              modal={false}
            >
              <SelectTrigger
                size="sm"
                className="h-8 w-[5.75rem] shrink-0"
                aria-label="Value type"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KIND_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <div className="min-w-0 flex-1">
            {typed && row.kind === "boolean" ? (
              <Select
                items={[
                  { label: "true", value: "true" },
                  { label: "false", value: "false" },
                ]}
                value={row.valueText || "false"}
                onValueChange={(next) => {
                  if (typeof next === "string") setValueText(row, next)
                }}
                modal={false}
              >
                <SelectTrigger size="sm" className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">true</SelectItem>
                  <SelectItem value="false">false</SelectItem>
                </SelectContent>
              </Select>
            ) : typed && row.kind === "json" ? (
              <Textarea
                placeholder="{}"
                value={row.valueText}
                rows={9}
                aria-invalid={Boolean(row.error)}
                className="field-sizing-fixed min-h-40 resize-y overflow-auto py-1.5 font-mono text-xs"
                onChange={(e) => setValueText(row, e.target.value)}
                onKeyDown={(e) => handleEditorKey(e, row)}
              />
            ) : (
              <Input
                type={typed && row.kind === "number" ? "number" : "text"}
                placeholder="Value"
                value={row.valueText}
                aria-invalid={Boolean(row.error)}
                className="h-8 font-mono text-xs"
                onChange={(e) => setValueText(row, e.target.value)}
                onKeyDown={(e) => handleEditorKey(e, row)}
              />
            )}
            {row.error && (
              <p className="mt-1 text-[11px] text-destructive">{row.error}</p>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Remove row"
            className="mt-0.5 shrink-0"
            onClick={() => removeRow(row.id)}
          >
            <XIcon />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={addRow}
      >
        <PlusIcon />
        Add
      </Button>
    </div>
  )
}
