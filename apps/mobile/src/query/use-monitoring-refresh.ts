import { useFocusEffect } from "expo-router"
import { useCallback, useRef } from "react"
import { AppState, type AppStateStatus } from "react-native"

export const MONITORING_POLL_INTERVAL_MS = 15_000
export const MONITORING_MAX_POLLS = 8

export function useMonitoringRefresh(refresh: () => void, enabled = true) {
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined
      let appState: AppStateStatus = AppState.currentState
      let polls = 0
      let interval: ReturnType<typeof setInterval> | undefined
      function stopPolling() {
        if (interval) clearInterval(interval)
        interval = undefined
      }
      function startPolling() {
        stopPolling()
        polls = 0
        if (appState !== "active") return
        interval = setInterval(() => {
          if (appState !== "active" || polls >= MONITORING_MAX_POLLS) {
            stopPolling()
            return
          }
          polls += 1
          refreshRef.current()
          if (polls >= MONITORING_MAX_POLLS) stopPolling()
        }, MONITORING_POLL_INTERVAL_MS)
      }
      refreshRef.current()
      startPolling()
      const subscription = AppState.addEventListener("change", (nextState) => {
        const enteringForeground =
          appState !== "active" && nextState === "active"
        appState = nextState
        if (nextState !== "active") {
          stopPolling()
          return
        }
        if (enteringForeground) {
          refreshRef.current()
          startPolling()
        }
      })
      return () => {
        subscription.remove()
        stopPolling()
      }
    }, [enabled])
  )
}
