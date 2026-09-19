import { StyleSheet, Text, View } from "react-native"
import { colors } from "../../theme/colors"
import { titleCase } from "./format-monitoring"

export function StatusBadge({ status }: { status: string }) {
  const color =
    status === "failed"
      ? colors.danger
      : status === "paused"
        ? colors.warning
        : status === "succeeded"
          ? colors.success
          : colors.accent
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.text, { color }]}>{titleCase(status)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  text: { fontSize: 11, fontWeight: "700" },
})
