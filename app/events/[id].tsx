/**
 * Native event ticket checkout — Connect create+pay with retailChannel=chat.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
  Linking,
} from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { fontScale } from "@/lib/responsive";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { getAuthToken } from "@/lib/auth-token";
import { createBookingCheckout, createBooking } from "@/lib/connect-bookings";

type TicketType = { id: string; name: string; priceCents: number; quantityTotal?: number; quantitySold?: number };
type Offering = {
  id: string;
  title?: string;
  publicTitle?: string;
  description?: string | null;
  startsAt?: string | null;
  locationName?: string | null;
  priceCents?: number | null;
  requirePayment?: boolean;
  waitlistEnabled?: boolean;
  ticketTypes?: TicketType[];
  networkSource?: { selectionId?: string; hostName?: string };
};

function formatZAR(cents?: number | null) {
  if (cents == null || cents <= 0) return "Free";
  return `R${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatWhen(iso?: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("en-ZA", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const webTop = Platform.OS === "web" ? 67 : 0;

  const [offering, setOffering] = useState<Offering | null>(null);
  const [loading, setLoading] = useState(true);
  const [ticketTypeId, setTicketTypeId] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setName(`${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || "");
    setEmail(user.email && !user.email.includes("placeholder") ? user.email : "");
    setPhone(user.phone || "");
  }, [user?.id]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const base = getApiUrl();
      const token = getAuthToken();
      // List then find — Connect detail may be same list item; also try offerings list filter
      const res = await fetch(`${base}api/connect/bookings/offerings?mode=event`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      const list: Offering[] = data.offerings || [];
      const found = list.find((o) => o.id === id) || null;
      setOffering(found);
      if (found?.ticketTypes?.length) {
        setTicketTypeId(found.ticketTypes[0].id);
      }
      if (!found) setStatusMsg("Event not found or no longer listed.");
    } catch (e: any) {
      setStatusMsg(e?.message || "Failed to load event");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const tickets = offering?.ticketTypes || [];
  const selected = tickets.find((t) => t.id === ticketTypeId) || tickets[0];
  const unitPrice = selected?.priceCents ?? offering?.priceCents ?? 0;
  const requiresPay = offering?.requirePayment !== false && unitPrice > 0;
  const selectionId = offering?.networkSource?.selectionId;

  const totalLabel = useMemo(() => formatZAR(unitPrice * quantity), [unitPrice, quantity]);

  async function submit() {
    if (!offering) return;
    if (!name.trim()) {
      Alert.alert("Name required", "Enter your name for the tickets.");
      return;
    }
    if (!email.trim() && !phone.trim()) {
      Alert.alert("Contact required", "Enter email or phone so we can send your tickets.");
      return;
    }
    if (tickets.length > 0 && !selected?.id) {
      Alert.alert("Choose a ticket", "Select a ticket type.");
      return;
    }

    setSubmitting(true);
    setStatusMsg(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const payload = {
      kind: "event_ticket" as const,
      offeringId: offering.id,
      selectionId,
      ticketTypeId: selected?.id,
      quantity,
      customerName: name.trim(),
      customerEmail: email.trim() || undefined,
      customerPhone: phone.trim() || undefined,
      promoCode: promoCode.trim() || undefined,
      inviteCode: inviteCode.trim() || undefined,
      retailChannel: "chat",
      returnUrl: "https://chat.lekker.network/?paid=1",
      cancelUrl: "https://chat.lekker.network/?paid=0",
    };

    try {
      const result = requiresPay
        ? await createBookingCheckout(payload)
        : await createBooking(payload);

      const payUrl = result.paymentUrl || result.checkoutUrl;
      if (payUrl && typeof payUrl === "string") {
        const can = await Linking.canOpenURL(payUrl);
        if (can) {
          await Linking.openURL(payUrl);
          setStatusMsg("Complete payment in the browser, then return here.");
          return;
        }
      }
      // Paywall form style (payload + signature) — open in-app browser with Marketplace-style note
      if (result.paywallUrl && result.payload && result.signature) {
        Alert.alert(
          "Complete payment",
          "You'll finish payment in the secure PayLekker page.",
          [
            {
              text: "Continue",
              onPress: () => {
                // Fallback: open Marketplace event page for form POST paywall
                router.push({
                  pathname: "/in-app-browser",
                  params: {
                    url: `https://lekkermarketplace.com/events/${offering.id}`,
                    title: "Pay for tickets",
                  },
                });
              },
            },
          ],
        );
        return;
      }

      const unpaid =
        result.paymentStatus === "unpaid" ||
        (typeof result.totalCents === "number" && result.totalCents > 0 && result.paymentStatus !== "paid" && result.paymentStatus !== "free");
      setStatusMsg(
        unpaid
          ? result.message || "Complete payment to confirm your tickets"
          : result.message || "You're in — check your email/WhatsApp for tickets",
      );
      Alert.alert(unpaid ? "Almost there" : "You're in", result.message || (unpaid ? "Payment still needed" : "Tickets confirmed"));
    } catch (e: any) {
      Alert.alert("Booking failed", e?.message || "Please try again");
      setStatusMsg(e?.message || "Booking failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTop }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Get tickets
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : !offering ? (
        <View style={styles.center}>
          <Text style={styles.empty}>{statusMsg || "Event not found"}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
          <Text style={styles.title}>{offering.publicTitle || offering.title}</Text>
          {!!offering.networkSource?.hostName && (
            <Text style={styles.meta}>Hosted by {offering.networkSource.hostName}</Text>
          )}
          {!!formatWhen(offering.startsAt) && (
            <View style={styles.row}>
              <Ionicons name="calendar-outline" size={16} color={Colors.textMuted} />
              <Text style={styles.meta}>{formatWhen(offering.startsAt)}</Text>
            </View>
          )}
          {!!offering.locationName && (
            <View style={styles.row}>
              <Ionicons name="location-outline" size={16} color={Colors.textMuted} />
              <Text style={styles.meta}>{offering.locationName}</Text>
            </View>
          )}
          {!!offering.description && <Text style={styles.body}>{offering.description}</Text>}

          {tickets.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.label}>Ticket type</Text>
              {tickets.map((t) => {
                const soldOut =
                  t.quantityTotal != null && t.quantitySold != null && t.quantitySold >= t.quantityTotal;
                const active = t.id === (selected?.id || ticketTypeId);
                return (
                  <Pressable
                    key={t.id}
                    disabled={soldOut}
                    onPress={() => setTicketTypeId(t.id)}
                    style={[styles.ticketRow, active && styles.ticketActive, soldOut && { opacity: 0.45 }]}
                  >
                    <Text style={styles.ticketName}>{t.name}</Text>
                    <Text style={styles.ticketPrice}>{soldOut ? "Sold out" : formatZAR(t.priceCents)}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.label}>Quantity</Text>
            <View style={styles.qtyRow}>
              <Pressable
                style={styles.qtyBtn}
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                <Ionicons name="remove" size={18} color={Colors.text} />
              </Pressable>
              <Text style={styles.qtyText}>{quantity}</Text>
              <Pressable
                style={styles.qtyBtn}
                onPress={() => setQuantity((q) => Math.min(10, q + 1))}
              >
                <Ionicons name="add" size={18} color={Colors.text} />
              </Pressable>
              <Text style={styles.total}>{totalLabel}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Your details</Text>
            <TextInput
              style={styles.input}
              placeholder="Full name"
              placeholderTextColor={Colors.textMuted}
              value={name}
              onChangeText={setName}
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={Colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone (+27…)"
              placeholderTextColor={Colors.textMuted}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
            <TextInput
              style={styles.input}
              placeholder="Promo code (optional)"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
              value={promoCode}
              onChangeText={setPromoCode}
            />
            <TextInput
              style={styles.input}
              placeholder="Invite code (optional)"
              placeholderTextColor={Colors.textMuted}
              value={inviteCode}
              onChangeText={setInviteCode}
            />
          </View>

          <Text style={styles.hint}>
            Paid tickets use PayLekker via Lekker Network Connect. Channel attributed as Chat.
          </Text>

          {!!statusMsg && <Text style={styles.status}>{statusMsg}</Text>}

          <Pressable
            style={[styles.cta, submitting && { opacity: 0.7 }]}
            onPress={submit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={Colors.background} />
            ) : (
              <Text style={styles.ctaText}>
                {requiresPay ? `Pay ${totalLabel}` : `Get tickets · ${totalLabel}`}
              </Text>
            )}
          </Pressable>
        </ScrollView>
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
  },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 17,
    color: Colors.text,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  empty: { fontFamily: "Poppins_400Regular", color: Colors.textMuted, textAlign: "center" },
  title: { fontFamily: "Poppins_700Bold", fontSize: fontScale(22), color: Colors.text },
  body: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  meta: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textMuted, flexShrink: 1 },
  section: { gap: 8, marginTop: 8 },
  label: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text },
  ticketRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  ticketActive: { borderColor: Colors.primary },
  ticketName: { fontFamily: "Poppins_500Medium", color: Colors.text },
  ticketPrice: { fontFamily: "Poppins_600SemiBold", color: Colors.primary },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.text, minWidth: 24, textAlign: "center" },
  total: { marginLeft: "auto", fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.primary },
  input: {
    backgroundColor: Colors.inputBackground,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
  },
  hint: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textMuted, lineHeight: 16 },
  status: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.primary },
  cta: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  ctaText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.background },
});
