import { useState } from "react"
import { PlusIcon, XIcon } from "lucide-react"
import { Button } from "@linea/ui/components/button"
import { Input } from "@linea/ui/components/input"

// `value` is the actual JS value that gets saved; `valueText` is only what's rendered in the
// input. They're kept separate (rather than deriving one object from every row's displayed text
// on each keystroke) so editing one row's key, or adding/removing a row, never touches another
// row's value — a nested object/array would otherwise get flattened into its JSON-stringified
// display text the moment any other row changed.
type Row = { id: string; key: string; value: unknown; valueText: string }

function emptyRow(): Row {
  return { id: crypto.randomUUID(), key: "", value: "", valueText: "" }
}

// A value typed as valid JSON (numbers, booleans, null, quoted strings, or nested
// objects/arrays) is saved as that type; anything else — including plain unquoted text like
// `bar`, which isn't valid JSON — is saved as a literal string.
function parseLiteral(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function toRows(value: unknown): Row[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [emptyRow()]
  }
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return [emptyRow()]
  return entries.map(([key, v]) => ({
    id: crypto.randomUUID(),
    key,
    value: v,
    valueText: typeof v === "string" ? v : JSON.stringify(v),
  }))
}

function toObject(rows: Row[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const row of rows) {
    const key = row.key.trim()
    if (key) result[key] = row.value
  }
  return result
}

export function KeyValueEditor({
  id,
  value,
  onChange,
}: {
  id: string
  value: unknown
  onChange: (value: Record<string, unknown>) => void
}) {
  const [rows, setRows] = useState<Row[]>(() => toRows(value))

  function updateRow(rowId: string, patch: Partial<Row>) {
    const next = rows.map((row) =>
      row.id === rowId ? { ...row, ...patch } : row
    )
    setRows(next)
    onChange(toObject(next))
  }

  function removeRow(rowId: string) {
    const next = rows.filter((row) => row.id !== rowId)
    const withFallback = next.length > 0 ? next : [emptyRow()]
    setRows(withFallback)
    onChange(toObject(withFallback))
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <div key={row.id} className="flex items-center gap-2">
          <Input
            id={index === 0 ? id : undefined}
            placeholder="Key"
            value={row.key}
            onChange={(e) => updateRow(row.id, { key: e.target.value })}
          />
          <Input
            placeholder="Value"
            value={row.valueText}
            onChange={(e) => {
              const valueText = e.target.value
              updateRow(row.id, { valueText, value: parseLiteral(valueText) })
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Remove row"
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
        onClick={() => setRows((prev) => [...prev, emptyRow()])}
      >
        <PlusIcon />
        Add
      </Button>
    </div>
  )
}
