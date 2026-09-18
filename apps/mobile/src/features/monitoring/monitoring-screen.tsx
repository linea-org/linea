import { useRouter } from "expo-router"
import {
  ActivityIcon,
  Building2Icon,
  CircleCheckIcon,
  RadioTowerIcon,
} from "lucide-react-native"
import { useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { useMobileAuth } from "../../auth/mobile-auth"
import { colors } from "../../theme/colors"
import { ApprovalsFeed } from "../approvals/approvals-feed"
import { ExecutionsFeed } from "../executions/executions-feed"
import { SignalsFeed } from "../signals/signals-feed"

export function MonitoringScreen() {
  const router = useRouter()
  const { data: session } = useMobileAuth().useSession()
  const [feed, setFeed] = useState<"approvals" | "executions" | "signals">(
    "executions"
  )
  const workspaceId = session?.session.activeOrganizationId
  if (!workspaceId) return null
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>WORKSPACE MONITORING</Text>
          <Text style={styles.title}>
            {feed === "executions"
              ? "Executions"
              : feed === "signals"
                ? "Signals"
                : "Approvals"}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Switch workspace"
          accessibilityRole="button"
          onPress={() => router.push("/workspaces")}
          style={styles.workspace}
        >
          <Building2Icon color={colors.accent} size={20} />
        </Pressable>
      </View>
      <View style={styles.tabs}>
        <Tab
          icon={
            <ActivityIcon
              color={feed === "executions" ? colors.accent : colors.muted}
              size={18}
            />
          }
          label="Executions"
          onPress={() => setFeed("executions")}
          selected={feed === "executions"}
        />
        <Tab
          icon={
            <RadioTowerIcon
              color={feed === "signals" ? colors.accent : colors.muted}
              size={18}
            />
          }
          label="Signals"
          onPress={() => setFeed("signals")}
          selected={feed === "signals"}
        />
        <Tab
          icon={
            <CircleCheckIcon
              color={feed === "approvals" ? colors.accent : colors.muted}
              size={18}
            />
          }
          label="Approvals"
          onPress={() => setFeed("approvals")}
          selected={feed === "approvals"}
        />
      </View>
      {feed === "executions" ? (
        <ExecutionsFeed workspaceId={workspaceId} />
      ) : feed === "signals" ? (
        <SignalsFeed workspaceId={workspaceId} />
      ) : (
        <ApprovalsFeed
          userEmail={session.user.email}
          workspaceId={workspaceId}
        />
      )}
    </View>
  )
}

function Tab({
  icon,
  label,
  onPress,
  selected,
}: {
  icon: React.ReactNode
  label: string
  onPress: () => void
  selected: boolean
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.tab, selected && styles.tabSelected]}
    >
      {icon}
      <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  eyebrow: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.1,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 56,
  },
  heading: { flex: 1, gap: 5 },
  screen: { backgroundColor: colors.canvas, flex: 1 },
  tab: {
    alignItems: "center",
    borderBottomWidth: 2,
    borderColor: "transparent",
    flex: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    paddingVertical: 13,
  },
  tabLabel: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  tabLabelSelected: { color: colors.accent },
  tabSelected: { borderColor: colors.accent },
  tabs: {
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    marginBottom: 12,
    marginTop: 16,
  },
  title: { color: colors.text, fontSize: 28, fontWeight: "700" },
  workspace: {
    alignItems: "center",
    borderColor: colors.separator,
    borderRadius: 12,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
})
