import { useState } from "react"
import { Pressable, Text, View } from "react-native"
import { useMobileAuth } from "../../auth/mobile-auth"
import { authErrorMessage } from "../../lib/auth-error"
import { useClearWorkspaceCache } from "../../query/monitoring-query"
import { colors } from "../../theme/colors"

export function SignOutButton() {
  const auth = useMobileAuth()
  const clearCache = useClearWorkspaceCache()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  async function signOut() {
    setPending(true)
    setError(undefined)
    try {
      const result = await auth.signOut()
      if (result.error)
        throw new Error(
          authErrorMessage(result.error, "Could not sign out. Try again.")
        )
      clearCache()
    } catch (error) {
      setError(authErrorMessage(error, "Could not sign out. Try again."))
    } finally {
      setPending(false)
    }
  }
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        disabled={pending}
        onPress={() => void signOut()}
        style={{ paddingVertical: 12 }}
      >
        <Text style={{ color: colors.accent }}>
          {pending ? "Signing out..." : "Sign out"}
        </Text>
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}
    </View>
  )
}
