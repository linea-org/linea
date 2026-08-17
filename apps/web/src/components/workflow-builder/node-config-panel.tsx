import { useState } from "react"
import { nodeRegistry, type NodeTypeId } from "@linea/runtime/browser"
import type { NodeUIField } from "@linea/runtime/browser"
import { XIcon } from "lucide-react"
import { Button } from "@linea/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@linea/ui/components/field"
import { Input } from "@linea/ui/components/input"
import { Textarea } from "@linea/ui/components/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linea/ui/components/select"

type NodeConfigPanelProps = {
  nodeType: NodeTypeId
  config: Record<string, unknown>
  onClose: () => void
  onChange: (config: Record<string, unknown>) => void
}

function isJsonWidget(widget: NodeUIField["widget"]) {
  return widget === "code" || widget === "key-value"
}

function fieldToInputValue(value: unknown, widget: NodeUIField["widget"]) {
  if (value === undefined) return ""
  if (isJsonWidget(widget)) return JSON.stringify(value, null, 2)
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : ""
}

function configToDraft(
  config: Record<string, unknown>,
  fields: NodeUIField[]
): Record<string, string> {
  const draft: Record<string, string> = {}
  for (const field of fields) {
    draft[field.key] = fieldToInputValue(config[field.key], field.widget)
  }
  return draft
}

export function NodeConfigPanel({
  nodeType,
  config,
  onClose,
  onChange,
}: NodeConfigPanelProps) {
  const definition = nodeRegistry[nodeType]
  const title =
    typeof config.name === "string" && config.name.trim()
      ? config.name.trim()
      : definition.ui.label
  const [draft, setDraft] = useState(() =>
    configToDraft(config, definition.ui.fields)
  )
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({})
  function setField(field: NodeUIField, rawValue: string) {
    setDraft((prev) => ({ ...prev, [field.key]: rawValue }))
    if (isJsonWidget(field.widget)) {
      if (rawValue.trim() === "") {
        const rest = { ...config }
        delete rest[field.key]
        setJsonErrors((prev) => ({ ...prev, [field.key]: "" }))
        onChange(rest)
        return
      }
      try {
        const parsed: unknown = JSON.parse(rawValue)
        setJsonErrors((prev) => ({ ...prev, [field.key]: "" }))
        onChange({ ...config, [field.key]: parsed })
      } catch {
        setJsonErrors((prev) => ({ ...prev, [field.key]: "Invalid JSON" }))
      }
      return
    }
    onChange({ ...config, [field.key]: rawValue })
  }
  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {title}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          aria-label="Close panel"
        >
          <XIcon />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <FieldGroup className="p-4">
          {definition.ui.fields.map((field) => {
            if (
              field.showIf &&
              draft[field.showIf.key] !== field.showIf.equals
            ) {
              return null
            }
            const invalid = Boolean(jsonErrors[field.key])
            return (
              <Field key={field.key} data-invalid={invalid || undefined}>
                <FieldLabel htmlFor={`node-field-${field.key}`}>
                  {field.label}
                </FieldLabel>
                {field.description && (
                  <FieldDescription>{field.description}</FieldDescription>
                )}
                {field.widget === "select" ? (
                  <Select
                    items={field.options}
                    value={draft[field.key] || null}
                    onValueChange={(value) => {
                      if (typeof value === "string") setField(field, value)
                    }}
                    modal={false}
                  >
                    <SelectTrigger
                      id={`node-field-${field.key}`}
                      className="w-full"
                    >
                      <SelectValue placeholder={field.label} />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options?.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : field.widget === "textarea" ||
                  field.widget === "code" ||
                  field.widget === "key-value" ? (
                  <Textarea
                    id={`node-field-${field.key}`}
                    value={draft[field.key] ?? ""}
                    onChange={(e) => setField(field, e.target.value)}
                    rows={field.widget === "textarea" ? 4 : 6}
                    aria-invalid={invalid || undefined}
                    className={
                      isJsonWidget(field.widget)
                        ? "field-sizing-fixed font-mono text-xs"
                        : undefined
                    }
                    placeholder={isJsonWidget(field.widget) ? "{}" : undefined}
                  />
                ) : (
                  <Input
                    id={`node-field-${field.key}`}
                    value={draft[field.key] ?? ""}
                    onChange={(e) => setField(field, e.target.value)}
                    aria-invalid={invalid || undefined}
                  />
                )}
                <FieldError>{jsonErrors[field.key]}</FieldError>
              </Field>
            )
          })}
        </FieldGroup>
      </div>
    </aside>
  )
}
