import { AlertCircleIcon, InboxIcon } from "lucide-react-native"
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { colors } from "../../theme/colors"

export function LoadingState({ label }: { label: string }) {
  return (
    <View accessibilityLabel={label} style={styles.state}>
      <ActivityIndicator color={colors.accent} size="large" />
      <Text style={styles.description}>{label}</Text>
    </View>
  )
}

export function ErrorState({
  message,
  retry,
}: {
  message: string
  retry: () => void
}) {
  return (
    <View style={styles.state}>
      <AlertCircleIcon color={colors.danger} size={28} />
      <Text accessibilityRole="alert" style={styles.title}>
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={retry}
        style={styles.button}
      >
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
    </View>
  )
}

export function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <View style={styles.state}>
      <InboxIcon color={colors.muted} size={28} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  button: {
    borderColor: colors.accent,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  buttonText: { color: colors.accent, fontSize: 14, fontWeight: "600" },
  description: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  state: {
    alignItems: "center",
    gap: 10,
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 56,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
})
