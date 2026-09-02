import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  Switch,
  Platform,
  Alert,
} from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { getAuthToken } from "@/lib/auth-token";
import { useAuth } from "@/lib/auth-context";

type Turn = { role: string; content: string; createdAt?: string; businessName?: string };

export default function EnquiryThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [lead, setLead] = useState<any>(null);
  const [role, setRole] = useState<"seeker" | "provider">("seeker");
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sharePhone, setSharePhone] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const url = new URL(`/api/enquiries/${id}`, getApiUrl());
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${getAuthToken() || ""}` },
      });
      const data = await res.json();
      if (data.lead) {
        setLead(data.lead);
        setRole(data.role === "provider" ? "provider" : "seeker");
        setSharePhone(!!data.lead.privacy?.sharePhone);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(load, 12000);
      return () => clearInterval(t);
    }, [load]),
  );

  async function send() {
    if (!text.trim() || !id) return;
    setSending(true);
    try {
      const res = await fetch(new URL(`/api/enquiries/${id}/messages`, getApiUrl()).toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken() || ""}`,
        },
        body: JSON.stringify({ content: text.trim(), asProvider: role === "provider" }),
      });
      const data = await res.json();
      if (data.lead) setLead(data.lead);
      setText("");
    } catch (e) {
      Alert.alert("Send failed", "Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function toggleReveal(next: boolean) {
    if (role !== "seeker" || !id) return;
    try {
      const res = await fetch(new URL(`/api/enquiries/${id}/privacy`, getApiUrl()).toString(), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken() || ""}`,
        },
        body: JSON.stringify({ sharePhone: next }),
      });
      const data = await res.json();
      if (data.lead) {
        setLead(data.lead);
        setSharePhone(!!data.lead.privacy?.sharePhone);
      } else {
        Alert.alert("Couldn't update", data.message || "Try again");
      }
    } catch {
      Alert.alert("Couldn't update", "Try again");
    }
  }

  const transcript: Turn[] = Array.isArray(lead?.transcript) ? lead.transcript : [];

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 12 : 0) }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {lead?.serviceLabel || lead?.summary || "Enquiry"}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {role === "provider"
              ? lead?.seekerName || "Customer"
              : lead?.provider?.businessName || "Lekkerpreneur"}
          </Text>
        </View>
      </View>

      {role === "seeker" && (
        <View style={styles.privacyBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.privacyTitle}>{sharePhone ? "Number shared" : "Private"}</Text>
            <Text style={styles.privacyHint}>
              {sharePhone
                ? "The lekkerpreneur can see your phone number."
                : "Your phone is hidden — same privacy as Marketplace Instant Match."}
            </Text>
          </View>
          <Switch
            value={sharePhone}
            onValueChange={toggleReveal}
            trackColor={{ false: Colors.border, true: Colors.primary }}
          />
        </View>
      )}

      {loading && !lead ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : (
        <FlatList
          data={transcript}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          renderItem={({ item }) => {
            if (item.role === "system") {
              return (
                <View style={styles.systemBubble}>
                  <Text style={styles.systemText}>{item.content}</Text>
                </View>
              );
            }
            const mine = item.role === "seeker" || item.role === "user";
            return (
              <View style={[styles.bubbleRow, mine ? { justifyContent: "flex-end" } : null]}>
                <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                  <Text style={styles.bubbleLabel}>
                    {mine ? "You" : item.businessName || (item.role === "provider" ? "Provider" : item.role)}
                  </Text>
                  <Text style={[styles.bubbleText, mine && { color: "#000" }]}>{item.content}</Text>
                </View>
              </View>
            );
          }}
        />
      )}

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          style={styles.input}
          placeholder="Reply…"
          placeholderTextColor={Colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
        />
        <Pressable style={styles.send} onPress={send} disabled={sending || !text.trim()}>
          {sending ? (
            <ActivityIndicator color={Colors.background} />
          ) : (
            <Ionicons name="send" size={18} color={Colors.background} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.text },
  sub: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textMuted },
  privacyBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  privacyTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text },
  privacyHint: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  systemBubble: { alignItems: "center", marginVertical: 6 },
  systemText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    backgroundColor: Colors.card,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    overflow: "hidden",
    maxWidth: "92%",
    textAlign: "center",
  },
  bubbleRow: { flexDirection: "row", marginBottom: 8 },
  bubble: { maxWidth: "85%", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  mine: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  theirs: { backgroundColor: Colors.card, borderBottomLeftRadius: 4 },
  bubbleLabel: { fontFamily: "Poppins_500Medium", fontSize: 10, opacity: 0.7, marginBottom: 2, color: Colors.text },
  bubbleText: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text, lineHeight: 20 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.text,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
