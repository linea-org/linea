import * as Notifications from "expo-notifications"
import { useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { useMobileAuth } from "../auth/mobile-auth"
import { useClearWorkspaceCache } from "../query/monitoring-query"
import {
  parseNotificationTarget,
  type NotificationTarget,
} from "./notification-target"

export function NotificationNavigation() {
  const auth = useMobileAuth()
  const { data: session } = auth.useSession()
  const router = useRouter()
  const clearWorkspaceCache = useClearWorkspaceCache()
  const [pending, setPending] = useState<NotificationTarget[]>([])
  const [navigating, setNavigating] = useState(false)
  useEffect(() => {
    function receive(response: Notifications.NotificationResponse) {
      const target = parseNotificationTarget(
        response.notification.request.content.data
      )
      if (target) setPending((current) => [...current, target])
    }
    const subscription =
      Notifications.addNotificationResponseReceivedListener(receive)
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        receive(response)
        void Notifications.clearLastNotificationResponseAsync()
      }
    })
    return () => subscription.remove()
  }, [])
  useEffect(() => {
    const target = pending[0]
    if (!session || !target || navigating) return
    const activeSession = session
    const destination = target
    setNavigating(true)
    async function navigate() {
      if (
        activeSession.session.activeOrganizationId !== destination.workspaceId
      ) {
        clearWorkspaceCache()
        const result = await auth.setActiveWorkspace(destination.workspaceId)
        if (result.error) {
          throw result.error instanceof Error
            ? result.error
            : new Error("Could not select the notification workspace")
        }
      }
      if (destination.screen === "execution") {
        router.replace({
          pathname: "/executions/[executionId]",
          params: { executionId: destination.executionId },
        })
      } else if (destination.screen === "approval") {
        router.replace({
          pathname: "/approvals/[approvalId]",
          params: { approvalId: destination.approvalId },
        })
      } else {
        router.replace({
          pathname: "/signals/[signalId]",
          params: { signalId: destination.signalId },
        })
      }
    }
    void navigate()
      .catch((error: unknown) => {
        console.error(
          `Notification navigation failed: ${error instanceof Error ? error.message : String(error)}`
        )
        router.replace("/workspaces")
      })
      .finally(() => {
        setPending((current) => current.slice(1))
        setNavigating(false)
      })
  }, [auth, clearWorkspaceCache, navigating, pending, router, session])
  return null
}
