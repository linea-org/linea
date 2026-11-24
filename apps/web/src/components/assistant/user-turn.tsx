import { useState } from "react"
import {
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
} from "lucide-react"

import {
  Bubble,
  BubbleContent,
  BubbleGroup,
} from "@linealabs/ui/components/bubble"
import { Button } from "@linealabs/ui/components/button"
import { InputGroupTextarea } from "@linealabs/ui/components/input-group"
import { cn } from "@linealabs/ui/lib/utils"

import { UserAvatar } from "@/components/account"
import { authClient } from "@/lib/auth-client"

import { ComposerFrame } from "./composer-frame"
import { FileCard } from "./file-card"
import { sendOnEnter } from "./send-on-enter"
import type { VisibleMessage } from "./use-assistant-chat"

function BranchSwitcher({
  message,
  disabled,
  onSwitch,
}: Readonly<{
  message: VisibleMessage
  disabled: boolean
  onSwitch: (id: string) => void
}>) {
  const index = message.siblingIds.indexOf(message.id)
  const count = message.siblingIds.length
  return (
    <div className="flex items-center text-sm text-muted-foreground tabular-nums">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Previous version"
        disabled={disabled || index === 0}
        onClick={() => onSwitch(message.siblingIds[index - 1])}
      >
        <ChevronLeftIcon />
      </Button>
      {index + 1} / {count}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Next version"
        disabled={disabled || index === count - 1}
        onClick={() => onSwitch(message.siblingIds[index + 1])}
      >
        <ChevronRightIcon />
      </Button>
    </div>
  )
}

function EditForm({
  initial,
  onCancel,
  onSubmit,
}: Readonly<{
  initial: string
  onCancel: () => void
  onSubmit: (text: string) => void
}>) {
  const [text, setText] = useState(initial)
  const changed = text.trim() !== "" && text.trim() !== initial.trim()
  return (
    <ComposerFrame
      value={text}
      trailing={
        <>
          <Button
            type="button"
            variant="ghost"
            className="rounded-full"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="icon"
            className="rounded-full"
            aria-label="Send edited message"
            disabled={!changed}
            onClick={() => onSubmit(text)}
          >
            <ArrowUpIcon />
          </Button>
        </>
      }
    >
      <InputGroupTextarea
        autoFocus
        aria-label="Edit message"
        rows={1}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel()
          sendOnEnter(event, () => {
            if (changed) onSubmit(text)
          })
        }}
        className="max-h-60 min-h-0"
      />
    </ComposerFrame>
  )
}

export function UserTurn({
  message,
  enter,
  disabled,
  onEdit,
  onSwitch,
}: Readonly<{
  message: VisibleMessage
  enter: string | false
  disabled: boolean
  onEdit: (id: string, text: string) => void
  onSwitch: (id: string) => void
}>) {
  const [editing, setEditing] = useState(false)
  const { data: session } = authClient.useSession()
  return (
    <div
      className={cn(
        "group flex flex-col items-end gap-1.5",
        message.fresh && enter
      )}
    >
      {message.attachments.length > 0 ? (
        <ul className="flex flex-wrap justify-end gap-1.5 pr-11">
          {message.attachments.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              <FileCard name={file.name} />
            </li>
          ))}
        </ul>
      ) : null}
      {editing ? (
        <EditForm
          initial={message.content}
          onCancel={() => setEditing(false)}
          onSubmit={(text) => {
            setEditing(false)
            onEdit(message.id, text)
          }}
        />
      ) : (
        <>
          <div className="flex w-full items-end justify-end gap-3">
            <BubbleGroup className="max-w-4/5">
              <Bubble align="end" variant="default" className="max-w-full">
                <BubbleContent className="whitespace-pre-wrap">
                  {message.content}
                </BubbleContent>
              </Bubble>
            </BubbleGroup>
            <UserAvatar
              name={session?.user.name}
              email={session?.user.email}
              image={session?.user.image}
              size="sm"
              className="size-8 shrink-0 overflow-hidden rounded-full"
            />
          </div>
          <div className="flex items-center gap-0.5 pr-11">
            {message.siblingIds.length > 1 ? (
              <BranchSwitcher
                message={message}
                disabled={disabled}
                onSwitch={onSwitch}
              />
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Edit message"
              disabled={disabled}
              className="text-muted-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
              onClick={() => setEditing(true)}
            >
              <PencilIcon />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
