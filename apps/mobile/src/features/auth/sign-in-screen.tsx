import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { useState } from "react"
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { z } from "zod"
import { useMobileAuth } from "../../auth/mobile-auth"
import { authErrorMessage } from "../../lib/auth-error"
import { colors } from "../../theme/colors"

const signInSchema = z.object({
  email: z.email("Enter a valid email address"),
})

type SignInValues = z.infer<typeof signInSchema>

export function SignInScreen() {
  const auth = useMobileAuth()
  const [sentTo, setSentTo] = useState<string>()
  const [requestError, setRequestError] = useState<string>()
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "" },
  })
  const submit = handleSubmit(async ({ email }) => {
    setRequestError(undefined)
    const { error } = await auth.requestMagicLink(email)
    if (error) {
      setRequestError(authErrorMessage(error, "Could not send sign-in link"))
      return
    }
    setSentTo(email)
  })
  if (sentTo) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.description}>
          Open the link sent to {sentTo} on this phone to finish signing in.
        </Text>
      </View>
    )
  }
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.eyebrow}>LINEA OPERATOR</Text>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.description}>
          We will email you a secure link that opens this app.
        </Text>
        <Controller
          control={control}
          name="email"
          render={({ field: { onBlur, onChange, value } }) => (
            <TextInput
              accessibilityLabel="Email address"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onBlur={onBlur}
              onChangeText={onChange}
              placeholder="you@company.com"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={value}
            />
          )}
        />
        {errors.email ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {errors.email.message}
          </Text>
        ) : null}
        {requestError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {requestError}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={() => void submit()}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            isSubmitting && styles.buttonDisabled,
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={styles.buttonText}>Email sign-in link</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderColor: colors.accent,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 52,
    justifyContent: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.7 },
  buttonText: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 14,
    padding: 24,
  },
  centered: {
    alignItems: "center",
    backgroundColor: colors.canvas,
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 32,
  },
  container: {
    backgroundColor: colors.canvas,
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  description: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  error: { color: colors.danger, fontSize: 14 },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
    textAlign: "center",
  },
  input: {
    borderColor: colors.separator,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "700",
    textAlign: "center",
  },
})
