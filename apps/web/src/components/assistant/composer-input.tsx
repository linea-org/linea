import type { KeyboardEvent } from "react"

import { InputGroupTextarea } from "@linealabs/ui/components/input-group"

import { useFlag } from "@/lib/use-flag"
import { MentionEditor } from "./mention-editor"

/** The message field: the chip editor behind assistantMentions, otherwise the plain textarea. */
export function ComposerInput({
  value,
  onChange,
  onSendKey,
  label,
  placeholder,
  autoFocus,
  workflowId,
}: Readonly<{
  value: string
  onChange: (value: string) => void
  onSendKey: (event: KeyboardEvent<HTMLElement>) => void
  label: string
  placeholder: string
  autoFocus: boolean
  workflowId?: string
}>) {
  const mentions = useFlag("assistantMentions")
  if (mentions) {
    return (
      <MentionEditor
        value={value}
        onChange={onChange}
        onSendKey={onSendKey}
        label={label}
        placeholder={placeholder}
        autoFocus={autoFocus}
        workflowId={workflowId}
      />
    )
  }
  return (
    <InputGroupTextarea
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onSendKey}
      placeholder={placeholder}
      rows={1}
      autoFocus={autoFocus}
      className="max-h-40 min-h-0 placeholder-shown:overflow-hidden placeholder-shown:text-nowrap"
    />
  )
}
