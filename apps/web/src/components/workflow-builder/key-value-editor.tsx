import { useState } from "react"
import { PlusIcon, XIcon } from "lucide-react"
import { Button } from "@linea/ui/components/button"
import { Input } from "@linea/ui/components/input"

type Row = { id: string; key: string; value: string }

function emptyRow(): Row {
  return { id: crypto.randomUUID(), key: "", value: "" }
}

// Non-string existing values (a header or variable set before this editor existed, or written by
// an API/import) are shown JSON-stringified so they remain visible and round-trip through editing
// without silently discarding the value's original shape.
function toRows(value: unknown): Row[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [emptyRow()]
  }
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return [emptyRow()]
  return entries.map(([key, v]) => ({
    id: crypto.randomUUID(),
    key,
    value: typeof v === "string" ? v : JSON.stringify(v),
  }))
}

function toObject(rows: Row[]): Record<string, string> {
  const result: Record<string, string> = {}
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
  onChange: (value: Record<string, string>) => void
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
            value={row.value}
            onChange={(e) => updateRow(row.id, { value: e.target.value })}
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
