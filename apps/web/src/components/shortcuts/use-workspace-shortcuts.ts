import { useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"

import { CLICK_SHORTCUTS } from "@/lib/shortcuts/definitions"

import { shortcutHandlers } from "./shortcut-registry"
import { findShortcutTarget } from "./shortcut-target"
import { useShortcut } from "./use-shortcut"

export function useWorkspaceShortcuts(slug: string) {
  const navigate = useNavigate()
  useShortcut(
    "go-home",
    () => void navigate({ to: "/w/$slug", params: { slug } })
  )
  useShortcut(
    "go-applications",
    () => void navigate({ to: "/w/$slug/applications", params: { slug } })
  )
  useShortcut(
    "go-workflows",
    () => void navigate({ to: "/w/$slug/workflows", params: { slug } })
  )
  useShortcut(
    "go-executions",
    () => void navigate({ to: "/w/$slug/executions", params: { slug } })
  )
  useShortcut(
    "go-inky",
    () =>
      void navigate({ to: "/w/$slug/assistant", params: { slug }, search: {} })
  )
  useShortcut(
    "go-settings",
    () => void navigate({ to: "/w/$slug/settings", params: { slug } })
  )
  useEffect(() => {
    const registered = CLICK_SHORTCUTS.map((id) => {
      const press = () => findShortcutTarget(id)?.click()
      shortcutHandlers.set(id, press)
      return [id, press] as const
    })
    return () => {
      for (const [id, press] of registered) {
        if (shortcutHandlers.get(id) === press) shortcutHandlers.delete(id)
      }
    }
  }, [])
}
