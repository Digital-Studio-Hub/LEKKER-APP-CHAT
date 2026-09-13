import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  FlatList,
  ActivityIndicator,
  Linking,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { fontScale } from "@/lib/responsive";
import { useAuth } from "@/lib/auth-context";
import {
  fetchSchedule,
  flattenScheduleItems,
  formatScheduleWhen,
  type ScheduleItem,
  type SchedulePayload,
} from "@/lib/schedule-api";
import { fetchLekkerSoftwareUrl } from "@/lib/lekker-session";
import { LEKKER_NETWORK_URL } from "@/constants/ecosystem";

type Range = "today" | "week";

export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const webTop = Platform.OS === "web" ? 67 : 0;
  const { user } = useAuth();
  const [range, setRange] = useState<Range>("today");
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<SchedulePayload | null>(null);

  const canSchedule =
    !!user?.isVerifiedLekkerpreneur && !!user?.lekkerWorkspaceId && !!user?.lekkerNetworkId;

  const load = useCallback(async () => {
    if (!canSchedule) {
      setPayload({
        success: true,
        available: false,
        meetings: [],
        bookings: [],
        offerings: [],
        activeNow: [],
      });
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await fetchSchedule(range);
    setPayload(data);
    setLoading(false);
  }, [canSchedule, range]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const items = useMemo(() => (payload ? flattenScheduleItems(payload) : []), [payload]);
  const activeNow = payload?.activeNow || [];

  async function openItem(item: ScheduleItem) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (item.href?.startsWith("http")) {
        router.push({ pathname: "/in-app-browser", params: { url: item.href, title: item.title } });
        return;
      }
      if (item.kind === "meet" || item.href?.includes("/meet/")) {
        const path = item.href?.replace(LEKKER_NETWORK_URL, "") || "/app/meeting-calendar";
        const url = await fetchLekkerSoftwareUrl(path.startsWith("/") ? path : "/app/meeting-calendar");
        router.push({ pathname: "/in-app-browser", params: { url, title: item.title || "Meet" } });
        return;
      }
      const url = await fetchLekkerSoftwareUrl("/app/meeting-calendar");
      router.push({ pathname: "/in-app-browser", params: { url, title: "Calendar" } });
    } catch {
      Linking.openURL(`${LEKKER_NETWORK_URL}/app/meeting-calendar`);
    }
  }

  function kindLabel(item: ScheduleItem): string {
    if (item.kind === "meet" || item.type === "meet") return "Meet";
    if (item.kind === "booking" || item.type === "booking") return "Booking";
    if (item.kind === "offering" || item.type === "offering") return "Offering";
    return "Event";
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTop }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Schedule</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.tabs}>
        {(["today", "week"] as Range[]).map((r) => {
          const on = range === r;
          return (
            <Pressable
              key={r}
              onPress={() => {
                Haptics.selectionAsync();
                setRange(r);
              }}
              style={[styles.tab, on && styles.tabOn]}
            >
              <Text style={[styles.tabText, on && styles.tabTextOn]}>
                {r === "today" ? "Today" : "This week"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!canSchedule ? (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Lekkerpreneur schedule</Text>
          <Text style={styles.emptyBody}>
            Sync your lekker.network workspace in Settings to see Meet rooms and bookings here.
          </Text>
        </View>
      ) : loading ? (
        <View style={styles.empty}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={
            activeNow.length > 0 ? (
              <View style={styles.activeBanner}>
                <Ionicons name="radio-button-on" size={16} color={Colors.danger} />
                <Text style={styles.activeText}>
                  In progress: {activeNow.map((a) => a.title).join(", ")} — status may switch to Do
                  Not Disturb
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="sunny-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>Nothing scheduled</Text>
              <Text style={styles.emptyBody}>
                No Meet rooms or bookings in this range. Create them in Software → Meeting Calendar.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
              onPress={() => openItem(item)}
            >
              <View style={styles.kindBadge}>
                <Text style={styles.kindText}>{kindLabel(item)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {item.title || "Untitled"}
                </Text>
                <Text style={styles.rowMeta}>{formatScheduleWhen(item)}</Text>
                {item.status ? (
                  <Text style={styles.rowStatus}>{item.status}</Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_600SemiBold", fontSize: fontScale(17), color: Colors.text },
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary },
  tabTextOn: { color: Colors.background },
  empty: { alignItems: "center", justifyContent: "center", padding: 32, gap: 10, flexGrow: 1 },
  emptyTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.text },
  emptyBody: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  activeBanner: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: "rgba(255,59,48,0.12)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  activeText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.text,
    lineHeight: 18,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  kindBadge: {
    backgroundColor: "rgba(245,184,0,0.2)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  kindText: { fontFamily: "Poppins_600SemiBold", fontSize: 10, color: Colors.primary },
  rowTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  rowMeta: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  rowStatus: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    textTransform: "capitalize",
  },
});
