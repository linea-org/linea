import { useEffect, useRef, useState } from "react"

import {
  readAttachments,
  type Attachment,
  type RejectedFile,
} from "@/lib/attachments"

export function useAttachFiles(
  attachments: Attachment[],
  onChange: (attachments: Attachment[]) => void
) {
  const [rejected, setRejected] = useState<RejectedFile[]>([])
  const latest = useRef(attachments)
  useEffect(() => {
    latest.current = attachments
  }, [attachments])
  // Reads one batch at a time, so a paste during a slow read does not drop that read's files.
  const reading = useRef(Promise.resolve())
  function attach(files: File[]) {
    reading.current = reading.current.then(async () => {
      const result = await readAttachments(files, latest.current)
      latest.current = result.attachments
      onChange(result.attachments)
      setRejected((current) => [...current, ...result.rejected])
    })
  }
  return { rejected, setRejected, attach }
}
