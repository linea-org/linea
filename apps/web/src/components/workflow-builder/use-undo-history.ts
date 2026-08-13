import { useCallback, useRef } from "react"

/** Ref-based snapshot undo/redo — no store library needed for this. Push a snapshot after every settled edit (not on every drag frame); undo/redo hand back a prior snapshot for the caller to apply. */
export function useUndoHistory<T>(initial: T) {
  const past = useRef<T[]>([])
  const future = useRef<T[]>([])
  const current = useRef<T>(initial)

  const push = useCallback((snapshot: T) => {
    past.current.push(current.current)
    current.current = snapshot
    future.current = []
  }, [])

  const undo = useCallback((): T | undefined => {
    const previous = past.current.pop()
    if (previous === undefined) return undefined
    future.current.push(current.current)
    current.current = previous
    return previous
  }, [])

  const redo = useCallback((): T | undefined => {
    const next = future.current.pop()
    if (next === undefined) return undefined
    past.current.push(current.current)
    current.current = next
    return next
  }, [])

  const canUndo = useCallback(() => past.current.length > 0, [])
  const canRedo = useCallback(() => future.current.length > 0, [])

  return { push, undo, redo, canUndo, canRedo }
}
