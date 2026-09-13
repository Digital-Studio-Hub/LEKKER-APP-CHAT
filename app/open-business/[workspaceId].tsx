import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
  TextInput,
  ActivityIndicator,
  Switch,
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
import { startChatWithContact } from "@/lib/chat-api";

type ResolvedBusiness = {
  workspaceId: string;
  businessName: string;
  lekkerNetworkId: string | null;
  phone: string | null;
  chatUserRegistered: boolean;
  province: string | null;
};

export default function OpenBusinessScreen() {
  const insets = useSafeAreaInsets();
  const webTop = Platform.OS === "web" ? 67 : 0;
  const { workspaceId: rawId } = useLocalSearchParams<{ workspaceId: string }>();
  const workspaceId = String(rawId || "").trim();
  const { user, isLoading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [business, setBusiness] = useState<ResolvedBusiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [enquiryText, setEnquiryText] = useState("");
  const [shareContact, setShareContact] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) {
      setError("Missing business link");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        new URL(`/api/directory/by-workspace/${encodeURIComponent(workspaceId)}`, getApiUrl()).toString(),
        { headers: { Authorization: `Bearer ${getAuthToken() || ""}` } },
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || "Business not found");
        setBusiness(null);
        return;
      }
      setBusiness(data.business as ResolvedBusiness);
    } catch {
      setError("Couldn’t load this business. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleMessage() {
    if (!business) return;
    if (!user) {
      Alert.alert("Sign in required", "Open Lekker Chat and sign in to message this business.");
      router.replace("/");
      return;
    }
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await startChatWithContact({
        lekkerNetworkId: business.lekkerNetworkId || undefined,
        phone: business.phone || undefined,
      });
      if (result.code === "USER_NOT_REGISTERED" || !result.chat) {
        Alert.alert(
          "Not on Lekker Chat yet",
          "This business hasn’t joined Lekker Chat messaging. Send an anonymous enquiry instead — they’ll see it in their portal.",
          [{ text: "Enquire", onPress: () => setEnquiryOpen(true) }, { text: "Cancel", style: "cancel" }],
        );
        return;
      }
      router.replace({ pathname: "/chat/[id]", params: { id: result.chat.id } });
    } catch (e: any) {
      Alert.alert("Couldn’t start chat", e?.message || "Try again");
    } finally {
      setBusy(false);
    }
  }

  async function handleEnquire() {
    if (!business || enquiryText.trim().length < 3) {
      Alert.alert("Add a brief", "Write a short note about what you need (at least 3 characters).");
      return;
    }
    if (!user) {
      Alert.alert("Sign in required", "Sign in to Lekker Chat to send an enquiry.");
      router.replace("/");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(new URL("/api/directory/enquire", getApiUrl()).toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken() || ""}`,
        },
        body: JSON.stringify({
          targetWorkspaceId: business.workspaceId,
          summary: enquiryText.trim(),
          province: business.province || undefined,
          shareContact,
          privacy: {
            sharePhone: shareContact,
            shareEmail: shareContact,
            shareLocation: false,
            shareBrief: true,
          },
          sourceUrl: `lekker-chat://open-business/${business.workspaceId}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        Alert.alert("Enquiry failed", data.message || "Please try again.");
        return;
      }
      setEnquiryOpen(false);
      router.replace({ pathname: "/enquiry/[id]", params: { id: data.leadId } });
    } catch {
      Alert.alert("Enquiry failed", "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTop }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Website chat</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading || authLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : error || !business ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.errorText}>{error || "Business not found"}</Text>
          <Pressable style={styles.secondaryBtn} onPress={() => router.replace("/")}>
            <Text style={styles.secondaryBtnText}>Go to Chats</Text>
          </Pressable>
        </View>
      ) : enquiryOpen ? (
        <View style={styles.card}>
          <Text style={styles.title}>Enquire · {business.businessName}</Text>
          <Text style={styles.body}>
            They’ll see your first name only unless you share contact. Replies land in Lekker Chat.
          </Text>
          <TextInput
            style={styles.input}
            value={enquiryText}
            onChangeText={setEnquiryText}
            placeholder="What do you need?"
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={1000}
          />
          <View style={styles.row}>
            <Text style={styles.optionLabel}>Share my phone & email</Text>
            <Switch
              value={shareContact}
              onValueChange={setShareContact}
              trackColor={{ false: Colors.border, true: Colors.primary }}
            />
          </View>
          <Pressable
            style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
            onPress={handleEnquire}
            disabled={busy}
          >
            <Text style={styles.primaryBtnText}>{busy ? "Sending…" : "Send enquiry"}</Text>
          </Pressable>
          <Pressable onPress={() => setEnquiryOpen(false)}>
            <Text style={styles.link}>Back</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="chatbubbles" size={32} color={Colors.background} />
          </View>
          <Text style={styles.title}>{business.businessName}</Text>
          <Text style={styles.body}>
            Message them in Lekker Chat, or send an anonymous enquiry (Directory privacy).
          </Text>
          <Pressable
            style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
            onPress={handleMessage}
            disabled={busy}
          >
            <Text style={styles.primaryBtnText}>
              {busy ? "Opening…" : business.chatUserRegistered ? "Message" : "Try Message"}
            </Text>
          </Pressable>
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => setEnquiryOpen(true)}
            disabled={busy}
          >
            <Text style={styles.secondaryBtnText}>Enquire anonymously</Text>
          </Pressable>
        </View>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  card: {
    margin: 20,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 24,
    gap: 14,
    alignItems: "center",
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: fontScale(20),
    color: Colors.text,
    textAlign: "center",
  },
  body: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  errorText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
  },
  primaryBtn: {
    width: "100%",
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.background },
  secondaryBtn: {
    width: "100%",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text },
  input: {
    width: "100%",
    minHeight: 100,
    backgroundColor: Colors.inputBackground,
    borderRadius: 12,
    padding: 12,
    color: Colors.text,
    fontFamily: "Poppins_400Regular",
    textAlignVertical: "top",
  },
  row: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionLabel: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.text, flex: 1 },
  link: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.primary, marginTop: 4 },
});
