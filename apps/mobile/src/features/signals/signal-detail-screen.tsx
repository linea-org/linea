import { useQuery } from "@tanstack/react-query"
import { ArrowLeftIcon } from "lucide-react-native"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { useMonitoringApi } from "../../api/monitoring-api"
import { useMonitoringRefresh } from "../../query/use-monitoring-refresh"
import { colors } from "../../theme/colors"
import { titleCase } from "../monitoring/format-monitoring"
import { ErrorState, LoadingState } from "../monitoring/monitoring-state"

export function SignalDetailScreen({
  goBack,
  signalId,
  workspaceId,
}: {
  goBack: () => void
  signalId: string
  workspaceId: string
}) {
  const api = useMonitoringApi()
  const query = useQuery({
    queryKey: ["monitoring", workspaceId, "signal", signalId],
    queryFn: () => api.getSignal(signalId),
  })
  useMonitoringRefresh(() => void query.refetch())
  if (query.isPending) return <LoadingState label="Loading signal" />
  if (query.isError) {
    return (
      <ErrorState
        message={query.error.message || "Could not load signal"}
        retry={() => void query.refetch()}
      />
    )
  }
  const signal = query.data
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          onPress={goBack}
          style={styles.back}
        >
          <ArrowLeftIcon color={colors.text} size={22} />
        </Pressable>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>SIGNAL</Text>
          <Text style={styles.title}>{titleCase(signal.flagType)}</Text>
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.status}>{titleCase(signal.status)}</Text>
        <Text style={styles.key}>{signal.signalKey}</Text>
        <Text style={styles.meta}>
          {signal.occurrenceCount} occurrences across{" "}
          {signal.affectedExecutions} executions
        </Text>
        <Text style={styles.meta}>
          Last seen {new Date(signal.lastFlaggedAt).toLocaleString()}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  back: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    margin: 20,
    padding: 18,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.1,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    padding: 20,
    paddingTop: 56,
  },
  heading: { flex: 1, gap: 4 },
  key: { color: colors.muted, fontFamily: "monospace", fontSize: 12 },
  meta: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  screen: { backgroundColor: colors.canvas, flex: 1 },
  status: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  title: { color: colors.text, fontSize: 20, fontWeight: "700" },
})
