/**
 * Native Events list — Connect bookings (mode=event) via Chat BFF.
 * Checkout uses retailChannel=chat for Network payout attribution.
 */
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
  RefreshControl,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { fontScale } from "@/lib/responsive";
import { getBookingOfferings } from "@/lib/connect-bookings";

type Offering = {
  id: string;
  title?: string;
  publicTitle?: string;
  startsAt?: string | null;
  locationName?: string | null;
  priceCents?: number | null;
  ticketTypes?: Array<{ id: string; name: string; priceCents: number }>;
  networkSource?: { hostName?: string; selectionId?: string };
};

function formatZAR(cents?: number | null) {
  if (cents == null || cents <= 0) return "Free";
  return `R${(cents / 100).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
}

function formatWhen(iso?: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("en-ZA", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function minPrice(o: Offering): number | null {
  if (o.ticketTypes?.length) {
    return Math.min(...o.ticketTypes.map((t) => t.priceCents));
  }
  return o.priceCents ?? null;
}

export default function EventsListScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Offering[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const webTop = Platform.OS === "web" ? 67 : 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getBookingOfferings({ mode: "event" });
      setItems(Array.isArray(data.offerings) ? data.offerings : []);
    } catch (e: any) {
      setError(e?.message || "Could not load events");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTop }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={Colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Events</Text>
          <Text style={styles.subtitle}>Tickets & experiences</Text>
        </View>
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="calendar-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Events unavailable</Text>
          <Text style={styles.emptyBody}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.primary} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="ticket-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No events yet</Text>
              <Text style={styles.emptyBody}>Check back soon for tickets & experiences.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const title = item.publicTitle || item.title || "Event";
            const when = formatWhen(item.startsAt);
            const price = minPrice(item);
            return (
              <Pressable
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
                onPress={() => router.push({ pathname: "/events/[id]", params: { id: item.id } })}
              >
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {title}
                </Text>
                {!!item.networkSource?.hostName && (
                  <Text style={styles.meta}>Hosted by {item.networkSource.hostName}</Text>
                )}
                {!!when && (
                  <View style={styles.row}>
                    <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
                    <Text style={styles.meta}>{when}</Text>
                  </View>
                )}
                {!!item.locationName && (
                  <View style={styles.row}>
                    <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
                    <Text style={styles.meta}>{item.locationName}</Text>
                  </View>
                )}
                <Text style={styles.price}>
                  {(item.ticketTypes?.length || 0) > 1 ? `From ${formatZAR(price)}` : formatZAR(price)}
                </Text>
              </Pressable>
            );
          }}
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
    paddingHorizontal: 8,
    paddingBottom: 8,
    gap: 4,
  },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Poppins_600SemiBold", fontSize: fontScale(20), color: Colors.text },
  subtitle: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textMuted },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  emptyTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.text, marginTop: 8 },
  emptyBody: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center" },
  retryBtn: {
    marginTop: 12,
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { fontFamily: "Poppins_600SemiBold", color: Colors.background },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  cardTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.text },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  meta: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textMuted, flexShrink: 1 },
  price: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.primary, marginTop: 4 },
});
