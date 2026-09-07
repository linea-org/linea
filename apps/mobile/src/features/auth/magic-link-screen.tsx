import { useEffect, useState } from "react"
import { ActivityIndicator, StyleSheet, Text, View } from "react-native"
import { useMobileAuth } from "../../auth/mobile-auth"
import { authErrorMessage } from "../../lib/auth-error"
import { colors } from "../../theme/colors"

type MagicLinkScreenProps = {
  onVerified: () => void
  token: string | undefined
}

export function MagicLinkScreen({ onVerified, token }: MagicLinkScreenProps) {
  const auth = useMobileAuth()
  const [error, setError] = useState<string>()
  useEffect(() => {
    let active = true
    async function verify() {
      if (!token) {
        setError("This sign-in link is missing its token.")
        return
      }
      const { error } = await auth.verifyMagicLink(token)
      if (!active) return
      if (error) {
        setError(
          authErrorMessage(error, "This sign-in link is invalid or expired.")
        )
        return
      }
      onVerified()
    }
    void verify()
    return () => {
      active = false
    }
  }, [auth, onVerified, token])
  return (
    <View style={styles.container}>
      {error ? (
        <>
          <Text style={styles.title}>Could not sign in</Text>
          <Text accessibilityRole="alert" style={styles.description}>
            {error}
          </Text>
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.title}>Finishing sign in</Text>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: colors.canvas,
    flex: 1,
    gap: 14,
    justifyContent: "center",
    padding: 32,
  },
  description: {
    color: colors.danger,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  title: { color: colors.text, fontSize: 24, fontWeight: "700" },
})
