import { useEffect, useRef, useState, type RefObject } from "react"

import type { TimeWindow } from "./gantt-time-axis"

const GUTTER_PX = 8
const DRAG_THRESHOLD_PX = 4
const MIN_SPAN_MS = 1
const WHEEL_ZOOM_STEP = 0.0015

type Selection = { from: number; to: number }

/**
 * Drag across the timeline to zoom to that span; Ctrl/⌘ + wheel zooms around the cursor.
 * `GUTTER_PX` is the horizontal padding between the surface edge and the bar tracks.
 */
export function useTimelineZoom(
  surface: RefObject<HTMLDivElement | null>,
  totalMs: number
) {
  const [zoom, setZoom] = useState<TimeWindow | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const dragStart = useRef<{ x: number; pointerId: number } | null>(null)
  const dragged = useRef(false)
  const window = zoom ?? { startMs: 0, endMs: totalMs }
  const windowRef = useRef(window)
  windowRef.current = window

  function pctAt(clientX: number): number {
    const rect = surface.current?.getBoundingClientRect()
    if (!rect) return 0
    const width = rect.width - GUTTER_PX * 2
    return Math.min(
      Math.max(((clientX - rect.left - GUTTER_PX) / width) * 100, 0),
      100
    )
  }

  useEffect(() => {
    const element = surface.current
    if (!element) return
    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const { startMs, endMs } = windowRef.current
      const span = endMs - startMs
      const anchor = startMs + (pctAt(event.clientX) / 100) * span
      const nextSpan = Math.min(
        Math.max(span * Math.exp(event.deltaY * WHEEL_ZOOM_STEP), MIN_SPAN_MS),
        totalMs
      )
      const ratio = (anchor - startMs) / span
      const nextStart = Math.min(
        Math.max(anchor - ratio * nextSpan, 0),
        totalMs - nextSpan
      )
      setZoom(
        nextSpan >= totalMs
          ? null
          : { startMs: nextStart, endMs: nextStart + nextSpan }
      )
    }
    element.addEventListener("wheel", onWheel, { passive: false })
    return () => element.removeEventListener("wheel", onWheel)
  })

  // A touch scroll can cancel the pointer mid-drag; drop the gesture without zooming.
  function cancelDrag() {
    dragStart.current = null
    setSelection(null)
  }

  const handlers = {
    onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
      dragged.current = false
      const target = event.target as Element
      if (event.button !== 0 || target.closest("[data-no-zoom]")) return
      dragStart.current = { x: event.clientX, pointerId: event.pointerId }
    },
    onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
      const start = dragStart.current
      if (!start) return
      if (!dragged.current) {
        if (Math.abs(event.clientX - start.x) < DRAG_THRESHOLD_PX) return
        dragged.current = true
        event.currentTarget.setPointerCapture(start.pointerId)
        setSelection({ from: pctAt(start.x), to: pctAt(event.clientX) })
        return
      }
      setSelection({ from: pctAt(start.x), to: pctAt(event.clientX) })
    },
    onPointerUp() {
      dragStart.current = null
      if (!selection) return
      const [low, high] = [selection.from, selection.to].sort((a, b) => a - b)
      const span = window.endMs - window.startMs
      const next = {
        startMs: window.startMs + (low / 100) * span,
        endMs: window.startMs + (high / 100) * span,
      }
      if (next.endMs - next.startMs >= MIN_SPAN_MS) setZoom(next)
      setSelection(null)
    },
    onPointerCancel: cancelDrag,
    onLostPointerCapture: cancelDrag,
    onClickCapture(event: React.MouseEvent<HTMLDivElement>) {
      if (!dragged.current) return
      dragged.current = false
      event.stopPropagation()
      event.preventDefault()
    },
    onDoubleClick(event: React.MouseEvent<HTMLDivElement>) {
      if ((event.target as Element).closest("[data-no-zoom]")) return
      setZoom(null)
    },
  }
  return {
    window,
    zoomed: zoom !== null,
    selection,
    reset: () => setZoom(null),
    handlers,
    gutterPx: GUTTER_PX,
  }
}
