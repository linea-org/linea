import { useCallback, useEffect, useState } from "react"

const storageKey = (key: string) => `linea:draft:${key}`

function readDraft(key: string): string {
  try {
    return sessionStorage.getItem(storageKey(key)) ?? ""
  } catch (error) {
    console.warn("Could not read the draft", error)
    return ""
  }
}

function saveDraft(key: string, text: string) {
  try {
    if (text) sessionStorage.setItem(storageKey(key), text)
    else sessionStorage.removeItem(storageKey(key))
  } catch (error) {
    console.warn("Could not save the draft", error)
  }
}

/** A message kept for this tab, so a reload does not lose it. */
export function useSavedDraft(key: string, initial = "") {
  const [draft, setDraft] = useState(initial)
  useEffect(() => {
    if (!initial) setDraft(readDraft(key))
  }, [key, initial])
  const change = useCallback(
    (text: string) => {
      setDraft(text)
      saveDraft(key, text)
    },
    [key]
  )
  return [draft, change] as const
}
