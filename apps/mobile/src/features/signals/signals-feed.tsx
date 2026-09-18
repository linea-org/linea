import { useQuery } from "@tanstack/react-query"
import { RadioTowerIcon } from "lucide-react-native"
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native"
import { useMonitoringApi } from "../../api/monitoring-api"
import type { SignalSummary } from "../../api/monitoring-types"
import { useMonitoringRefresh } from "../../query/use-monitoring-refresh"
import { colors } from "../../theme/colors"
import { titleCase } from "../monitoring/format-monitoring"
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../monitoring/monitoring-state"

export function SignalsFeed({ workspaceId }: { workspaceId: string }) {
  const api = useMonitoringApi()
  const query = useQuery({
    queryKey: ["monitoring", workspaceId, "signals"],
    queryFn: api.listSignals,
  })
  useMonitoringRefresh(() => void query.refetch())
  if (query.isPending) return <LoadingState label="Loading signals" />
  if (query.isError) {
    return (
      <ErrorState
        message={query.error.message || "Could not load signals"}
        retry={() => void query.refetch()}
      />
    )
  }
  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={query.data}
      keyExtractor={(signal) => signal.id}
      ListEmptyComponent={
        <EmptyState
          description="Tracked problem patterns will appear as they are detected."
          title="No signals yet"
        />
      }
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor={colors.accent}
        />
      }
      renderItem={({ item }) => <SignalCard signal={item} />}
    />
  )
}

function SignalCard({ signal }: { signal: SignalSummary }) {
  return (
    <View style={styles.card}>
      <View style={styles.icon}>
        <RadioTowerIcon color={colors.accent} size={18} />
      </View>
      <View style={styles.copy}>
        <View style={styles.heading}>
          <Text style={styles.name}>{titleCase(signal.flagType)}</Text>
          <Text style={styles.status}>{titleCase(signal.status)}</Text>
        </View>
        <Text numberOfLines={1} style={styles.key}>
          {signal.signalKey}
        </Text>
        <Text style={styles.meta}>
          {signal.occurrenceCount}{" "}
          {signal.occurrenceCount === 1 ? "occurrence" : "occurrences"} · Last
          seen {new Date(signal.lastFlaggedAt).toLocaleDateString()}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    padding: 16,
  },
  copy: { flex: 1, gap: 5 },
  heading: { alignItems: "center", flexDirection: "row", gap: 10 },
  icon: { paddingTop: 2 },
  key: { color: colors.muted, fontSize: 12 },
  list: { gap: 10, padding: 20 },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  name: { color: colors.text, flex: 1, fontSize: 15, fontWeight: "600" },
  status: { color: colors.accent, fontSize: 11, fontWeight: "700" },
})
