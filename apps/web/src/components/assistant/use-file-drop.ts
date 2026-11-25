import { useEffect, useEffectEvent, useState } from "react"

const hasFiles = (event: DragEvent) =>
  event.dataTransfer?.types.includes("Files") ?? false

/** Accepts files dropped anywhere on the page; true while they are dragged over it. */
export function useFileDrop(onFiles: (files: File[]) => void): boolean {
  const [over, setOver] = useState(false)
  const accept = useEffectEvent(onFiles)
  useEffect(() => {
    function drag(event: DragEvent) {
      if (!hasFiles(event)) return
      event.preventDefault()
      setOver(true)
    }
    function leave(event: DragEvent) {
      // Only leaving the window has no element to move to.
      if (event.relatedTarget === null) setOver(false)
    }
    function drop(event: DragEvent) {
      if (!hasFiles(event)) return
      event.preventDefault()
      setOver(false)
      accept([...(event.dataTransfer?.files ?? [])])
    }
    window.addEventListener("dragover", drag)
    window.addEventListener("dragleave", leave)
    window.addEventListener("drop", drop)
    return () => {
      window.removeEventListener("dragover", drag)
      window.removeEventListener("dragleave", leave)
      window.removeEventListener("drop", drop)
    }
  }, [])
  return over
}
