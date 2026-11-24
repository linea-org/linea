import { FileTextIcon, ImageIcon, TriangleAlertIcon, XIcon } from "lucide-react"

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@linealabs/ui/components/attachment"

const IMAGE = /\.(png|jpe?g|gif|webp|svg|heic)$/i

function FileIcon({
  name,
  failed,
}: Readonly<{ name: string; failed: boolean }>) {
  if (failed) return <TriangleAlertIcon />
  return IMAGE.test(name) ? <ImageIcon /> : <FileTextIcon />
}

/** A file on a message, in the composer before it is sent and in the thread after. */
export function FileCard({
  name,
  detail,
  failed = false,
  onOpen,
  onRemove,
}: Readonly<{
  name: string
  detail?: string
  failed?: boolean
  onOpen?: () => void
  onRemove?: () => void
}>) {
  return (
    <Attachment
      size="sm"
      state={failed ? "error" : "done"}
      className="max-w-56"
    >
      <AttachmentMedia>
        <FileIcon name={name} failed={failed} />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{name}</AttachmentTitle>
        {detail ? (
          <AttachmentDescription>{detail}</AttachmentDescription>
        ) : null}
      </AttachmentContent>
      {onOpen ? (
        <AttachmentTrigger aria-label={`Open ${name}`} onClick={onOpen} />
      ) : null}
      {onRemove ? (
        <AttachmentActions>
          <AttachmentAction
            type="button"
            aria-label={`Remove ${name}`}
            onClick={onRemove}
          >
            <XIcon />
          </AttachmentAction>
        </AttachmentActions>
      ) : null}
    </Attachment>
  )
}
