import * as Device from "expo-device"
import * as Notifications from "expo-notifications"
import { useEffect } from "react"
import { AppState, Platform } from "react-native"
import { getMobileSessionCookie } from "../auth/better-auth-client"
import { useMobileAuth } from "../auth/mobile-auth"
import { registerPushDevice } from "./push-device-api"

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

function projectId(): string {
  const value = process.env.EXPO_PUBLIC_EAS_PROJECT_ID
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Expo project ID is required for push notifications")
  }
  return value
}

export function PushRegistration() {
  const { data: session } = useMobileAuth().useSession()
  const userId = session?.user.id
  const sessionId = session?.session.id
  useEffect(() => {
    if (!userId || !sessionId || Platform.OS === "web" || !Device.isDevice)
      return
    let active = true
    const cookie = getMobileSessionCookie()
    async function register() {
      const current = await Notifications.getPermissionsAsync()
      const permission =
        current.status === Notifications.PermissionStatus.GRANTED
          ? current
          : await Notifications.requestPermissionsAsync()
      if (
        permission.status !== Notifications.PermissionStatus.GRANTED ||
        !active
      )
        return
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Default",
          importance: Notifications.AndroidImportance.DEFAULT,
        })
      }
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: projectId(),
      })
      if (!active) return
      const baseUrl = process.env.EXPO_PUBLIC_API_URL
      if (!baseUrl) throw new Error("EXPO_PUBLIC_API_URL is required")
      await registerPushDevice({
        baseUrl: baseUrl.replace(/\/$/, ""),
        cookie,
        token: token.data,
        platform: Platform.OS === "ios" ? "ios" : "android",
      })
    }
    const refresh = () =>
      void register().catch((error: unknown) => {
        console.error(
          `Push registration failed: ${error instanceof Error ? error.message : String(error)}`
        )
      })
    refresh()
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh()
    })
    return () => {
      subscription.remove()
      active = false
    }
  }, [userId, sessionId])
  return null
}
