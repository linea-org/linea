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
  const mentions = useFlag("assistantMentions")
  if (mentions) {
    return (
      <MentionEditor
        value={value}
        onChange={onChange}
        onSendKey={onSendKey}
        label={label}
        placeholder={placeholder}
        hero={hero}
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
      rows={hero ? 3 : 2}
      autoFocus={hero}
      className={hero ? "max-h-60 min-h-24 text-base" : "max-h-40"}
    />
  )
}
