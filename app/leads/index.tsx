import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  TextInput,
  Platform,
  RefreshControl,
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
  listMarketplaceLeads,
  type MarketplaceLeadRow,
  type MarketplaceLeadsResponse,
} from "@/lib/leads-api";
import { fetchLekkerSoftwareUrl } from "@/lib/lekker-session";

function formatWhen(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hours = (Date.now() - d.getTime()) / (1000 * 60 * 60);
  if (hours < 24) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (hours < 48) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function MarketplaceLeadsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [status, setStatus] = useState<"open" | "closed" | "all">("open");
  const [qDraft, setQDraft] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<MarketplaceLeadsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!opts?.soft) setLoading(true);
      try {
        setError(null);
        const res = await listMarketplaceLeads({ status, q, page: 1, limit: 40 });
        if (res.message && !res.leads) {
          setError(res.message);
        }
        setData(res);
      } catch (e: any) {
        setError(e?.message || "Failed to load leads");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [status, q],
  );

  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(() => load({ soft: true }), 20000);
      return () => clearInterval(t);
    }, [load]),
  );

  async function openNetworkSettings() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const url = await fetchLekkerSoftwareUrl("/app/settings");
      if (Platform.OS === "web") {
        window.open(url, "_blank");
      } else {
        await Linking.openURL(url);
      }
    } catch {
      router.push("/(tabs)/software");
    }
  }

  const leads = data?.leads || [];
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const isLekkerpreneur = !!user?.isVerifiedLekkerpreneur && !!user?.lekkerWorkspaceId;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={styles.backBtn}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Marketplace Leads</Text>
          <Text style={styles.headerSubtitle}>
            {data?.optedIn
              ? `${data.total ?? leads.length} lead${(data.total ?? leads.length) === 1 ? "" : "s"} · Instant Match`
              : "Directory replies + Instant Match"}
          </Text>
        </View>
        <Pressable onPress={() => { setRefreshing(true); load({ soft: true }); }} style={styles.iconBtn}>
          <Ionicons name="refresh" size={20} color={Colors.primary} />
        </Pressable>
      </View>

      {!isLekkerpreneur ? (
        <View style={styles.centered}>
          <Ionicons name="briefcase-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Lekkerpreneur workspace required</Text>
          <Text style={styles.emptyBody}>Sync your Lekkerpreneur account in Settings to manage leads here.</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.push("/settings")}>
            <Text style={styles.primaryBtnText}>Open Settings</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.filterRow}>
            {(["open", "closed", "all"] as const).map((s) => (
              <Pressable
                key={s}
                onPress={() => {
                  Haptics.selectionAsync();
                  setStatus(s);
                }}
                style={[styles.chip, status === s && styles.chipActive]}
              >
                <Text style={[styles.chipText, status === s && styles.chipTextActive]}>
                  {s === "open" ? "Open" : s === "closed" ? "Closed" : "All"}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search service, seeker, city…"
              placeholderTextColor={Colors.textMuted}
              value={qDraft}
              onChangeText={setQDraft}
              onSubmitEditing={() => setQ(qDraft.trim())}
              returnKeyType="search"
            />
            {qDraft ? (
              <Pressable
                onPress={() => {
                  setQDraft("");
                  setQ("");
                }}
              >
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          {data && data.optedIn === false ? (
            <View style={styles.banner}>
              <Text style={styles.bannerTitle}>Opt in for Instant Match</Text>
              <Text style={styles.bannerBody}>
                Enable Marketplace Leads in lekker.network Settings to receive matching jobs. Directory enquiry replies still show here.
              </Text>
              <Pressable style={styles.primaryBtn} onPress={openNetworkSettings}>
                <Text style={styles.primaryBtnText}>Open Network Settings</Text>
              </Pressable>
            </View>
          ) : null}

          {loading && !refreshing ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : error && leads.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.emptyTitle}>Couldn’t load leads</Text>
              <Text style={styles.emptyBody}>{error}</Text>
              <Pressable style={styles.primaryBtn} onPress={() => load()}>
                <Text style={styles.primaryBtnText}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              data={leads}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: insets.bottom + 24, flexGrow: 1 }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    setRefreshing(true);
                    load({ soft: true });
                  }}
                  tintColor={Colors.primary}
                />
              }
              ListEmptyComponent={
                <View style={styles.centered}>
                  <Ionicons name="mail-open-outline" size={36} color={Colors.textMuted} />
                  <Text style={styles.emptyTitle}>No leads yet</Text>
                  <Text style={styles.emptyBody}>
                    When customers enquire from Directory or Instant Match, they land here.
                  </Text>
                </View>
              }
              renderItem={({ item }) => <LeadRow item={item} />}
            />
          )}
        </>
      )}
    </View>
  );
}

function LeadRow({ item }: { item: MarketplaceLeadRow }) {
  const place = [item.suburb, item.city, item.province].filter(Boolean).join(", ");
  const preview =
    item.summary ||
    item.serviceLabel ||
    item.serviceCategory ||
    "Marketplace enquiry";

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push({ pathname: "/leads/[id]", params: { id: item.id } });
      }}
    >
      <View style={[styles.rowIcon, item.unreadForProvider && styles.rowIconUnread]}>
        <Ionicons
          name={item.unreadForProvider ? "mail-unread" : "briefcase-outline"}
          size={18}
          color={item.unreadForProvider ? Colors.background : Colors.primary}
        />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.rowTop}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.seekerName || "Seeker"} · {item.serviceLabel || item.serviceCategory || "Lead"}
          </Text>
          <Text style={styles.rowTime}>{formatWhen(item.lastMessageAt || item.bumpedAt || item.createdAt)}</Text>
        </View>
        <Text style={styles.rowPreview} numberOfLines={2}>
          {preview}
        </Text>
        <View style={styles.metaRow}>
          {place ? (
            <Text style={styles.metaText} numberOfLines={1}>
              <Ionicons name="location-outline" size={11} color={Colors.textMuted} /> {place}
            </Text>
          ) : (
            <Text style={styles.metaText}>Location private</Text>
          )}
          {item.unreadForProvider ? <View style={styles.unreadDot} /> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: fontScale(20), color: Colors.text },
  headerSubtitle: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textMuted },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  chipTextActive: { color: Colors.background },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    borderRadius: 12,
    backgroundColor: Colors.inputBackground,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text },
  banner: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "rgba(245,184,0,0.12)",
    borderWidth: 1,
    borderColor: "rgba(245,184,0,0.35)",
    gap: 8,
  },
  bannerTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  bannerBody: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  primaryBtn: {
    alignSelf: "flex-start",
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 4,
  },
  primaryBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  emptyTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.text, textAlign: "center" },
  emptyBody: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.cardElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconUnread: { backgroundColor: Colors.primary },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowTitle: { flex: 1, fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  rowTime: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textMuted },
  rowPreview: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  metaText: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textMuted },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
});
