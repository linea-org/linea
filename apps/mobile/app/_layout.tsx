import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { ActivityIndicator, StyleSheet, View } from "react-native"
import { SafeAreaProvider } from "react-native-safe-area-context"
import {
  getMobileSessionCookie,
  mobileAuthClient,
} from "../src/auth/better-auth-client"
import { ApprovalApiProvider, createApprovalApi } from "../src/api/approval-api"
import { MobileAuthProvider, useMobileAuth } from "../src/auth/mobile-auth"
import {
  createMonitoringApi,
  MonitoringApiProvider,
} from "../src/api/monitoring-api"
import { MonitoringQueryProvider } from "../src/query/monitoring-query"
import { colors } from "../src/theme/colors"
import { NotificationNavigation } from "../src/notifications/notification-navigation"
import { PushRegistration } from "../src/notifications/push-registration"

export default function RootLayout() {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL
  if (!baseUrl) throw new Error("EXPO_PUBLIC_API_URL is required")
  return (
    <MobileAuthProvider client={mobileAuthClient}>
      <MonitoringQueryProvider>
        <ApprovalApiProvider
          api={createApprovalApi({
            baseUrl: baseUrl.replace(/\/$/, ""),
            getCookie: getMobileSessionCookie,
          })}
        >
          <MonitoringApiProvider
            api={createMonitoringApi({
              baseUrl: baseUrl.replace(/\/$/, ""),
              getCookie: getMobileSessionCookie,
            })}
          >
            <RootNavigator />
          </MonitoringApiProvider>
        </ApprovalApiProvider>
      </MonitoringQueryProvider>
    </MobileAuthProvider>
  )
}

function RootNavigator() {
  const { data: session, isPending } = useMobileAuth().useSession()
  if (isPending) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    )
  }
  return (
    <SafeAreaProvider>
      <NotificationNavigation />
      <PushRegistration />
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Screen name="magic-link" />
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="monitor" />
          <Stack.Screen name="workspaces" />
          <Stack.Screen name="executions/[executionId]" />
          <Stack.Screen name="approvals/[approvalId]" />
          <Stack.Screen name="signals/[signalId]" />
        </Stack.Protected>
      </Stack>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    backgroundColor: colors.canvas,
    flex: 1,
    justifyContent: "center",
  },
})
