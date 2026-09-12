import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
  KeyboardAvoidingView,
} from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { fontScale } from "@/lib/responsive";
import {
  getMarketplaceLead,
  replyMarketplaceLead,
  setMarketplaceLeadStatus,
  type MarketplaceLeadRow,
} from "@/lib/leads-api";
import { startChatWithContact } from "@/lib/chat-api";

type Turn = { role?: string; content?: string; createdAt?: string; businessName?: string };

export default function MarketplaceLeadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [lead, setLead] = useState<MarketplaceLeadRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [startingDm, setStartingDm] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await getMarketplaceLead(id);
      if (data.lead) setLead(data.lead);
      else if (data.message) Alert.alert("Lead", data.message);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(load, 15000);
      return () => clearInterval(t);
    }, [load]),
  );

  async function send() {
    if (!text.trim() || !id) return;
    setSending(true);
    try {
      const data = await replyMarketplaceLead(id, text.trim());
      if (data.lead) {
        setLead(data.lead);
        setText("");
      } else {
        Alert.alert("Send failed", data.message || "Please try again.");
      }
    } catch {
      Alert.alert("Send failed", "Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function markStatus(status: "contacted" | "closed") {
    if (!id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const data = await setMarketplaceLeadStatus(id, status);
    if (data.success === false) {
      Alert.alert("Update failed", data.message || "Try again");
      return;
    }
    await load();
  }

  async function openDm() {
    const phone = lead?.seekerPhone;
    if (!phone) {
      Alert.alert("Contact private", "The seeker has not shared their phone yet.");
      return;
    }
    setStartingDm(true);
    try {
      const { chat, code, message } = await startChatWithContact({ phone });
      if (chat?.id) {
        router.push({ pathname: "/chat/[id]", params: { id: chat.id } });
        return;
      }
      if (code === "USER_NOT_REGISTERED") {
        Alert.alert("Not on Lekker Chat yet", message || "Invite them via WhatsApp from Chats.");
      } else {
        Alert.alert("Couldn’t start DM", message || "Try again");
      }
    } finally {
      setStartingDm(false);
    }
  }

  const transcript: Turn[] = Array.isArray(lead?.transcript) ? lead!.transcript! : [];
  const canRespond = lead?.canRespond !== false && lead?.status !== "closed";
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const place = [lead?.suburb, lead?.city, lead?.province].filter(Boolean).join(", ");

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + webTopInset }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {lead?.seekerName || "Lead"}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {lead?.serviceLabel || lead?.serviceCategory || "Marketplace lead"}
          </Text>
        </View>
        <Pressable
          onPress={() =>
            Alert.alert("Lead actions", undefined, [
              { text: "Cancel", style: "cancel" },
              { text: "Mark contacted", onPress: () => markStatus("contacted") },
              { text: "Close lead", style: "destructive", onPress: () => markStatus("closed") },
            ])
          }
          style={styles.backBtn}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={Colors.text} />
        </Pressable>
      </View>

      {loading && !lead ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : !lead ? (
        <View style={styles.centered}>
          <Text style={styles.empty}>Lead not found</Text>
        </View>
      ) : (
        <>
          <View style={styles.metaCard}>
            {lead.summary ? <Text style={styles.summary}>{lead.summary}</Text> : null}
            <View style={styles.metaBits}>
              {place ? (
                <Text style={styles.metaBit}>
                  <Ionicons name="location-outline" size={12} color={Colors.textMuted} /> {place}
                </Text>
              ) : (
                <Text style={styles.metaBit}>Location private</Text>
              )}
              {lead.budget ? <Text style={styles.metaBit}>Budget: {lead.budget}</Text> : null}
              {lead.timeframe ? <Text style={styles.metaBit}>{lead.timeframe}</Text> : null}
              <Text style={styles.metaBit}>Status: {lead.status || "open"}</Text>
            </View>
            {(lead.seekerPhone || lead.seekerEmail) && (
              <View style={styles.contactRow}>
                {lead.seekerPhone ? (
                  <Pressable style={styles.contactChip} onPress={openDm} disabled={startingDm}>
                    <Ionicons name="chatbubble-ellipses-outline" size={14} color={Colors.background} />
                    <Text style={styles.contactChipText}>{startingDm ? "Opening…" : "Continue in DM"}</Text>
                  </Pressable>
                ) : null}
                {lead.seekerPhone ? (
                  <Text style={styles.contactHint}>{lead.seekerPhone}</Text>
                ) : null}
                {lead.seekerEmail ? <Text style={styles.contactHint}>{lead.seekerEmail}</Text> : null}
              </View>
            )}
            {!lead.seekerPhone && !lead.seekerEmail ? (
              <Text style={styles.privacyHint}>
                Contact stays private until the seeker shares it in this thread.
              </Text>
            ) : null}
          </View>

          <FlatList
            data={transcript}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, flexGrow: 1 }}
            ListEmptyComponent={
              <Text style={styles.emptyThread}>No messages yet — send the first reply.</Text>
            }
            renderItem={({ item }) => {
              if (item.role === "system") {
                return (
                  <View style={styles.systemBubble}>
                    <Text style={styles.systemText}>{item.content}</Text>
                  </View>
                );
              }
              const isSeeker = item.role === "seeker" || item.role === "user";
              const isProvider = item.role === "provider";
              return (
                <View style={[styles.bubbleWrap, isSeeker ? styles.alignEnd : styles.alignStart]}>
                  <View
                    style={[
                      styles.bubble,
                      isSeeker && styles.bubbleSeeker,
                      isProvider && styles.bubbleProvider,
                      !isSeeker && !isProvider && styles.bubbleAssist,
                    ]}
                  >
                    <Text style={[styles.bubbleLabel, isSeeker && styles.bubbleLabelOnPrimary]}>
                      {isSeeker ? "Seeker" : isProvider ? "You" : "Cledwyn"}
                    </Text>
                    <Text style={[styles.bubbleText, isSeeker && styles.bubbleTextOnPrimary]}>
                      {item.content}
                    </Text>
                  </View>
                </View>
              );
            }}
          />

          {canRespond ? (
            <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
              <TextInput
                style={styles.input}
                placeholder="Reply to seeker…"
                placeholderTextColor={Colors.textMuted}
                value={text}
                onChangeText={setText}
                multiline
              />
              <Pressable
                style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]}
                onPress={send}
                disabled={!text.trim() || sending}
              >
                {sending ? (
                  <ActivityIndicator size="small" color={Colors.background} />
                ) : (
                  <Ionicons name="send" size={18} color={Colors.background} />
                )}
              </Pressable>
            </View>
          ) : (
            <View style={[styles.closedBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              <Text style={styles.closedText}>This lead is closed</Text>
            </View>
          )}
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: fontScale(17), color: Colors.text },
  headerSubtitle: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textMuted },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { fontFamily: "Poppins_400Regular", color: Colors.textMuted },
  metaCard: {
    margin: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  summary: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text, lineHeight: 20 },
  metaBits: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metaBit: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textMuted },
  contactRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 4 },
  contactChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  contactChipText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.background },
  contactHint: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  privacyHint: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textMuted, lineHeight: 16 },
  emptyThread: {
    textAlign: "center",
    marginTop: 40,
    fontFamily: "Poppins_400Regular",
    color: Colors.textMuted,
    fontSize: 13,
  },
  systemBubble: { alignItems: "center", marginVertical: 6 },
  systemText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    backgroundColor: Colors.cardElevated,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: "hidden",
    maxWidth: "90%",
  },
  bubbleWrap: { marginVertical: 4, maxWidth: "88%" },
  alignEnd: { alignSelf: "flex-end" },
  alignStart: { alignSelf: "flex-start" },
  bubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleSeeker: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleProvider: {
    backgroundColor: "rgba(245,184,0,0.15)",
    borderWidth: 1,
    borderColor: "rgba(245,184,0,0.25)",
    borderBottomLeftRadius: 4,
  },
  bubbleAssist: { backgroundColor: Colors.cardElevated, borderBottomLeftRadius: 4 },
  bubbleLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
    opacity: 0.7,
    marginBottom: 2,
    color: Colors.text,
  },
  bubbleLabelOnPrimary: { color: Colors.background },
  bubbleText: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text, lineHeight: 20 },
  bubbleTextOnPrimary: { color: Colors.background },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: Colors.inputBackground,
    color: Colors.text,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  closedBar: { padding: 14, alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  closedText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textMuted },
});
