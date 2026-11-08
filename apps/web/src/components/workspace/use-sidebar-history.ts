import { useNavigate } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import {
  backTarget,
  createSidebarHistory,
  leaveToMain,
  rewindSidebar,
  restoreSidebarState,
  visitSidebarContext,
} from "./sidebar-history"

import {
  readSidebarBrowserState,
  writeSidebarBrowserState,
} from "./sidebar-browser-state"

import { useRouteSidebarContext } from "./use-route-sidebar-context"

export function useSidebarHistory(slug: string) {
  const { context, locationKey, ready } = useRouteSidebarContext(slug)
  const [state, setState] = useState(() => ({
    slug,
    history: createSidebarHistory(locationKey, context, `/w/${slug}`),
  }))
  let history = state.history
  if (ready && (state.slug !== slug || history.locationKey !== locationKey)) {
    history =
      state.slug !== slug
        ? createSidebarHistory(locationKey, context, `/w/${slug}`)
        : visitSidebarContext(history, locationKey, context)
    setState({ slug, history })
  }
  useEffect(() => {
    if (!ready) return
    const saved = readSidebarBrowserState()
    if (saved?.slug === slug) {
      setState((current) => ({
        ...current,
        history: restoreSidebarState(
          current.history,
          saved.trail,
          saved.expanded
        ),
      }))
    }
  }, [locationKey, slug, ready])
  useEffect(() => {
    if (ready && history.locationKey === locationKey)
      writeSidebarBrowserState(slug, history.trail, history.expanded)
  }, [slug, history, ready, locationKey])
  const navigate = useNavigate()
  function back() {
    // From the first layer, Back leaves it for the page we came from.
    const target = backTarget(history)
    if (target) {
      setState((current) => ({
        ...current,
        history: leaveToMain(current.history),
      }))
      void navigate({ to: target })
      return
    }
    setState((current) => ({
      ...current,
      history: rewindSidebar(current.history),
    }))
  }
  const setExpanded = useCallback((key: string, expanded: boolean) => {
    setState((current) =>
      current.history.expanded[key] === expanded
        ? current
        : {
            ...current,
            history: {
              ...current.history,
              expanded: { ...current.history.expanded, [key]: expanded },
            },
          }
    )
  }, [])
  return { history, back, setExpanded }
}
