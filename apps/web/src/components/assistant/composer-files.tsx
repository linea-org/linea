import { useState } from "react"

import { AttachmentGroup } from "@linealabs/ui/components/attachment"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@linealabs/ui/components/dialog"

import {
  attachmentSummary,
  type Attachment,
  type RejectedFile,
} from "@/lib/attachments"
import { FileCard } from "./file-card"

export function ComposerFiles({
  files,
  onFilesChange,
  rejected,
  onRejectedChange,
}: Readonly<{
  files: Attachment[]
  onFilesChange: (files: Attachment[]) => void
  rejected: RejectedFile[]
  onRejectedChange: (files: RejectedFile[]) => void
}>) {
  const [opened, setOpened] = useState<Attachment | null>(null)
  return (
    <>
      <AttachmentGroup className="gap-2 px-1 pb-1">
        {files.map((file) => (
          <FileCard
            key={file.name}
            name={file.name}
            detail={attachmentSummary(file)}
            onOpen={() => setOpened(file)}
            onRemove={() =>
              onFilesChange(files.filter((item) => item !== file))
            }
          />
        ))}
        {rejected.map((file, index) => (
          <FileCard
            key={`${file.name}-${index}`}
            name={file.name}
            detail={file.reason}
            failed
            onRemove={() =>
              onRejectedChange(rejected.filter((item) => item !== file))
            }
          />
        ))}
      </AttachmentGroup>
      <Dialog open={opened !== null} onOpenChange={() => setOpened(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{opened?.name}</DialogTitle>
          </DialogHeader>
          <pre className="max-h-96 overflow-auto rounded-lg bg-surface-canvas p-3 font-mono text-xs break-words whitespace-pre-wrap">
            {opened?.content}
          </pre>
        </DialogContent>
      </Dialog>
    </>
  )
}
