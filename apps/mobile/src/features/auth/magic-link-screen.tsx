import { useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { useMobileAuth } from "../../auth/mobile-auth"
import { authErrorMessage } from "../../lib/auth-error"
import { colors } from "../../theme/colors"

type MagicLinkScreenProps = {
  onVerified: () => void
  token: string | undefined
}

export function MagicLinkScreen({ onVerified, token }: MagicLinkScreenProps) {
  const auth = useMobileAuth()
  const { data: session, isPending } = auth.useSession()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  async function verify() {
    if (!token || pending || isPending) return
    setPending(true)
    setError(undefined)
    try {
      const result = await auth.verifyMagicLink(token)
      if (result.error) {
        setError(
          authErrorMessage(
            result.error,
            "This sign-in link is invalid or expired."
          )
        )
        return
      }
      onVerified()
    } catch (error) {
      setError(authErrorMessage(error, "Could not complete sign in."))
    } finally {
      setPending(false)
    }
  }
  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {session ? "Switch account?" : "Use this sign-in link?"}
      </Text>
      <Text style={styles.description}>
        {session
          ? `You are signed in as ${session.user.email}. This link may replace your current account. `
          : ""}
        Continue only if you requested this sign-in link.
      </Text>
      {(!token || error) && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error ?? "This sign-in link is missing its token."}
        </Text>
      )}
      {pending ? (
        <ActivityIndicator color={colors.accent} size="large" />
      ) : (
        <Pressable
          accessibilityRole="button"
          disabled={!token || isPending}
          onPress={() => void verify()}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Use this sign-in link</Text>
        </Pressable>
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
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  error: { color: colors.danger, textAlign: "center" },
  button: { backgroundColor: colors.accent, borderRadius: 12, padding: 16 },
  buttonText: { color: colors.canvas, fontWeight: "700" },
  title: { color: colors.text, fontSize: 24, fontWeight: "700" },
})
