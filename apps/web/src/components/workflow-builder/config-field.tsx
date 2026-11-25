import { useRef, type FocusEvent, type ReactNode } from "react"
import type { NodeUIField } from "@linealabs/runtime/browser"
import { InfoIcon } from "lucide-react"
import { Field, FieldError, FieldLabel } from "@linealabs/ui/components/field"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@linealabs/ui/components/tooltip"

import {
  insertReference,
  REFERENCE_TARGET,
  type ReferenceTarget,
} from "./insert-reference"
import type { ReferenceGroup } from "./reference-options"
import { ReferencePicker } from "./reference-picker"

export function ConfigField({
  field,
  error,
  references,
  applicationId,
  children,
}: Readonly<{
  field: NodeUIField
  error: string | undefined
  references: ReferenceGroup[]
  applicationId: string | undefined
  children: ReactNode
}>) {
  const container = useRef<HTMLDivElement>(null)
  // The input last typed in, because opening the picker takes the focus away.
  const target = useRef<ReferenceTarget>(null)
  const rememberTarget = ({ target: focused }: FocusEvent) => {
    if (
      focused.hasAttribute(REFERENCE_TARGET) &&
      (focused instanceof HTMLInputElement ||
        focused instanceof HTMLTextAreaElement)
    ) {
      target.current = focused
    }
  }
  const insert = (text: string) => {
    if (
      !target.current?.isConnected ||
      !target.current.hasAttribute(REFERENCE_TARGET)
    ) {
      target.current =
        container.current?.querySelector<ReferenceTarget>(
          `[${REFERENCE_TARGET}]`
        ) ?? null
    }
    if (target.current) insertReference(target.current, text)
  }
  return (
    <Field
      ref={container}
      data-invalid={Boolean(error) || undefined}
      onFocus={rememberTarget}
    >
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
        {field.references && (
          <ReferencePicker
            label={field.label}
            groups={references}
            withSecrets={field.references.secrets === true}
            applicationId={applicationId}
            finalFocus={target}
            onSelect={insert}
          />
        )}
      </div>
      {children}
      <FieldError>{error}</FieldError>
    </Field>
  )
}
