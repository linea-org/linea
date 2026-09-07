import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { ActivityIndicator, StyleSheet, View } from "react-native"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { mobileAuthClient } from "../src/auth/better-auth-client"
import { MobileAuthProvider, useMobileAuth } from "../src/auth/mobile-auth"
import { colors } from "../src/theme/colors"

export default function RootLayout() {
  return (
    <MobileAuthProvider client={mobileAuthClient}>
      <RootNavigator />
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
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Screen name="magic-link" />
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="workspaces" />
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
