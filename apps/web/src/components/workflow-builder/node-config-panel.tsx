import { useCallback, useEffect, useState } from "react"
import {
  nodeRegistry,
  retryPolicySchema,
  type NodeTypeId,
} from "@linea/runtime/browser"
import type { NodeUIField } from "@linea/runtime/browser"
import { InfoIcon, XIcon } from "lucide-react"
import { Button } from "@linea/ui/components/button"
import {
  Field,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@linea/ui/components/tooltip"
import { AgentStepField } from "./agent-step-field"
import { KeyValueEditor } from "./key-value-editor"

type NodeConfigPanelProps = {
  nodeType: NodeTypeId
  config: Record<string, unknown>
  applicationId?: string
  onClose: () => void
  onChange: (config: Record<string, unknown>) => void
}

function isJsonWidget(widget: NodeUIField["widget"]) {
  return widget === "code"
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
    const raw = fieldToInputValue(config[field.key], field.widget)
    draft[field.key] =
      raw ||
      (field.widget === "select" && !field.showIf && !field.optional
        ? (field.options?.[0]?.value ?? "")
        : raw)
  }
  return draft
}

function selectDefaults(
  config: Record<string, unknown>,
  fields: NodeUIField[]
): Record<string, unknown> | null {
  const next: Record<string, unknown> = {}
  for (const field of fields) {
    if (field.widget !== "select" || field.showIf || field.optional) continue
    if (config[field.key] !== undefined && config[field.key] !== "") continue
    const first = field.options?.[0]?.value
    if (first) next[field.key] = first
  }
  return Object.keys(next).length > 0 ? next : null
}

export function NodeConfigPanel({
  nodeType,
  config,
  applicationId,
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
  useEffect(() => {
    const defaults = selectDefaults(config, definition.ui.fields)
    if (defaults) onChange({ ...config, ...defaults })
  }, [config, definition.ui.fields, onChange])
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
        // Valid JSON isn't the same as a valid policy — retryPolicy has a strict runtime schema
        // (maxAttempts, backoff, timeoutMs), and saving something that merely parses but doesn't
        // match it used to mean retries silently never actually applied.
        if (field.key === "retryPolicy") {
          const result = retryPolicySchema.safeParse(parsed)
          if (!result.success) {
            setJsonErrors((prev) => ({
              ...prev,
              [field.key]: `Doesn't match the retry policy shape: ${result.error.issues[0]?.message ?? "invalid"}`,
            }))
            return
          }
        }
        setJsonErrors((prev) => ({ ...prev, [field.key]: "" }))
        onChange({ ...config, [field.key]: parsed })
      } catch {
        setJsonErrors((prev) => ({ ...prev, [field.key]: "Invalid JSON" }))
      }
      return
    }
    onChange({ ...config, [field.key]: rawValue })
  }
  const onAgentSelection = useCallback(
    (selection: { agentId: string; agentContractRevisionId: string }) => {
      setDraft((prev) => ({ ...prev, agentId: selection.agentId }))
      onChange({ ...config, ...selection })
    },
    [config, onChange]
  )
  function renderControl(field: NodeUIField, invalid: boolean) {
    const id = `node-field-${field.key}`
    if (field.widget === "agent") {
      if (!applicationId) return null
      return (
        <AgentStepField
          id={id}
          applicationId={applicationId}
          value={draft[field.key] ?? ""}
          revisionValue={
            typeof config.agentContractRevisionId === "string"
              ? config.agentContractRevisionId
              : ""
          }
          onChange={onAgentSelection}
        />
      )
    }
    if (field.widget === "select") {
      return (
        <Select
          items={field.options}
          value={draft[field.key] || null}
          onValueChange={(value) => {
            if (typeof value === "string") setField(field, value)
          }}
          modal={false}
        >
          <SelectTrigger id={id} className="w-full">
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
      )
    }
    if (field.widget === "key-value") {
      return (
        <KeyValueEditor
          id={id}
          value={config[field.key]}
          typed={nodeType === "variables"}
          onChange={(value) => onChange({ ...config, [field.key]: value })}
        />
      )
    }
    if (field.widget === "textarea" || field.widget === "code") {
      return (
        <Textarea
          id={id}
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
      )
    }
    return (
      <Input
        id={id}
        value={draft[field.key] ?? ""}
        onChange={(e) => setField(field, e.target.value)}
        aria-invalid={invalid || undefined}
      />
    )
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
        <TooltipProvider>
          <FieldGroup className="p-4">
            {definition.ui.fields.map((field) => {
              if (field.showIf) {
                const current =
                  draft[field.showIf.key] ||
                  definition.ui.fields.find((f) => f.key === field.showIf?.key)
                    ?.options?.[0]?.value
                const expected = field.showIf.equals
                const matches = Array.isArray(expected)
                  ? expected.includes(current ?? "")
                  : current === expected
                if (!matches) return null
              }
              const invalid = Boolean(jsonErrors[field.key])
              return (
                <Field key={field.key} data-invalid={invalid || undefined}>
                  <div className="flex items-center gap-1">
                    <FieldLabel htmlFor={`node-field-${field.key}`}>
                      {field.label}
                    </FieldLabel>
                    {field.description && (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              aria-label={`About ${field.label}`}
                              className="text-muted-foreground hover:text-foreground"
                            />
                          }
                        >
                          <InfoIcon className="size-3.5" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-64 text-pretty">
                          {field.description}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  {renderControl(field, invalid)}
                  <FieldError>{jsonErrors[field.key]}</FieldError>
                </Field>
              )
            })}
          </FieldGroup>
        </TooltipProvider>
      </div>
    </aside>
  )
}
