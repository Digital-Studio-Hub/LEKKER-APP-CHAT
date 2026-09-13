import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetch } from "expo/fetch";
import { router, useFocusEffect } from "expo-router";
import { getAuthToken } from "@/lib/auth-token";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { isSmallScreen, fontScale, responsiveMaxBubbleWidth } from "@/lib/responsive";
import { getApiUrl } from "@/lib/query-client";
import { storage, CledwynMessage } from "@/lib/storage";
import { useAuth } from "@/lib/auth-context";
import { fetchLekkerSoftwareUrl } from "@/lib/lekker-session";
import { LEKKER_NETWORK_URL } from "@/constants/ecosystem";

const NETWORK_SESSION_KEY = "lekker_cledwyn_network_session";

let messageCounter = 0;
function generateUniqueId(): string {
  messageCounter++;
  return `msg-${Date.now()}-${messageCounter}-${Math.random().toString(36).substr(2, 9)}`;
}

function TypingIndicator() {
  return (
    <View style={typingStyles.container}>
      <View style={typingStyles.bubble}>
        <View style={typingStyles.dots}>
          <View style={[typingStyles.dot, { opacity: 0.4 }]} />
          <View style={[typingStyles.dot, { opacity: 0.6 }]} />
          <View style={[typingStyles.dot, { opacity: 0.8 }]} />
        </View>
      </View>
    </View>
  );
}

const typingStyles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 4, alignItems: "flex-start" },
  bubble: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomLeftRadius: 4,
  },
  dots: { flexDirection: "row", gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
});

async function openWorkspaceCledwyn(hint?: string) {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  try {
    const url = await fetchLekkerSoftwareUrl("/app/cledwyn");
    router.push({
      pathname: "/in-app-browser",
      params: {
        url,
        title: "Cledwyn AI",
        ...(hint ? { hint } : {}),
      },
    });
  } catch {
    router.push({
      pathname: "/in-app-browser",
      params: { url: `${LEKKER_NETWORK_URL}/app/cledwyn`, title: "Cledwyn AI" },
    });
  }
}

function MessageBubble({
  message,
  onOpenNotif,
}: {
  message: CledwynMessage;
  onOpenNotif?: (msg: CledwynMessage) => void;
}) {
  const isUser = message.role === "user";
  const isNotif = message.role === "notification";

  if (isNotif) {
    return (
      <Pressable
        onPress={() => onOpenNotif?.(message)}
        style={({ pressed }) => [bubbleStyles.notifWrap, pressed && { opacity: 0.85 }]}
      >
        <View style={bubbleStyles.botAvatar}>
          <Ionicons name="sparkles" size={16} color={Colors.background} />
        </View>
        <View style={bubbleStyles.notifBubble}>
          <Text style={bubbleStyles.notifLabel}>Cledwyn · {message.source || "alert"}</Text>
          {message.title ? <Text style={bubbleStyles.notifTitle}>{message.title}</Text> : null}
          <Text style={bubbleStyles.notifText}>{message.content}</Text>
          {message.href ? (
            <Text style={bubbleStyles.notifLink}>Open in Software →</Text>
          ) : null}
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[bubbleStyles.container, isUser ? bubbleStyles.userContainer : bubbleStyles.assistantContainer]}>
      {!isUser && (
        <View style={bubbleStyles.botAvatar}>
          <Ionicons name="sparkles" size={16} color={Colors.background} />
        </View>
      )}
      <View style={[bubbleStyles.bubble, isUser ? bubbleStyles.userBubble : bubbleStyles.assistantBubble]}>
        <Text style={[bubbleStyles.text, isUser ? bubbleStyles.userText : bubbleStyles.assistantText]}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}

const bubbleStyles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 3, flexDirection: "row", gap: 8 },
  userContainer: { justifyContent: "flex-end" },
  assistantContainer: { justifyContent: "flex-start", alignItems: "flex-end" },
  botAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
  },
  bubble: { maxWidth: responsiveMaxBubbleWidth(), borderRadius: 18, paddingHorizontal: isSmallScreen ? 12 : 16, paddingVertical: 10 },
  userBubble: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  assistantBubble: { backgroundColor: Colors.card, borderBottomLeftRadius: 4 },
  text: { fontFamily: "Poppins_400Regular", fontSize: fontScale(15), lineHeight: fontScale(22) },
  userText: { color: Colors.background },
  assistantText: { color: Colors.text },
  notifWrap: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-end",
  },
  notifBubble: {
    maxWidth: responsiveMaxBubbleWidth(),
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(245,184,0,0.12)",
    borderWidth: 1,
    borderColor: "rgba(245,184,0,0.35)",
    gap: 2,
  },
  notifLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
    color: Colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  notifTitle: { fontFamily: "Poppins_600SemiBold", fontSize: fontScale(14), color: Colors.text },
  notifText: { fontFamily: "Poppins_400Regular", fontSize: fontScale(13), color: Colors.textSecondary, lineHeight: 18 },
  notifLink: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.primary, marginTop: 4 },
});

export default function CledwynScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [messages, setMessages] = useState<CledwynMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList>(null);
  const initializedRef = useRef(false);

  function scrollToLatest(animated = true) {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }

  useEffect(() => {
    if (messages.length > 0 || showTyping) scrollToLatest(true);
  }, [messages.length, showTyping]);

  useEffect(() => {
    if (!initializedRef.current) {
      storage.getCledwynMessages().then((msgs) => {
        setMessages(msgs);
        initializedRef.current = true;
      });
    }
  }, []);

  const workspaceMode =
    !!user?.lekkerNetworkAccess && !!user?.isVerifiedLekkerpreneur && !!user?.lekkerWorkspaceId;

  const mergeNotifications = useCallback(async () => {
    if (!workspaceMode) return;
    try {
      const token = getAuthToken();
      const res = await fetch(`${getApiUrl()}api/cledwyn/notifications?limit=25`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) return;

      setMessages((prev) => {
        const existing = new Set(
          prev.filter((m) => m.role === "notification" && m.notificationId).map((m) => m.notificationId!),
        );
        const incoming: CledwynMessage[] = [];
        for (const n of items) {
          const nid = String(n.id || "");
          if (!nid || existing.has(nid)) continue;
          incoming.push({
            id: `notif-${nid}`,
            role: "notification",
            notificationId: nid,
            title: n.title || undefined,
            content: n.message || n.title || "Workspace update",
            source: n.source || "network",
            href: n.href || undefined,
            timestamp: n.createdAt || new Date().toISOString(),
          });
        }
        if (!incoming.length) return prev;
        const next = [...prev, ...incoming].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
        // Cap stored history
        const trimmed = next.length > 200 ? next.slice(next.length - 200) : next;
        storage.saveCledwynMessages(trimmed);
        return trimmed;
      });
    } catch {
      /* offline — ignore */
    }
  }, [workspaceMode]);

  useFocusEffect(
    useCallback(() => {
      mergeNotifications();
      if (!workspaceMode) return;
      const t = setInterval(mergeNotifications, 30000);
      return () => clearInterval(t);
    }, [mergeNotifications, workspaceMode]),
  );

  async function openNotif(msg: CledwynMessage) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = msg.href?.startsWith("/app") ? msg.href : "/app";
    try {
      const url = await fetchLekkerSoftwareUrl(next);
      router.push({ pathname: "/in-app-browser", params: { url, title: msg.title || "lekker.network" } });
    } catch {
      router.push("/(tabs)/software");
    }
  }

  async function handleSend() {
    const text = inputText.trim();
    if (!text || isStreaming) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInputText("");

    const currentMessages = [...messages];
    const userMessage: CledwynMessage = {
      id: generateUniqueId(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);
    setShowTyping(true);

    try {
      const baseUrl = getApiUrl();
      const chatHistory = [
        ...currentMessages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: text },
      ];

      const sessionId = (await AsyncStorage.getItem(NETWORK_SESSION_KEY)) || undefined;
      const token = getAuthToken();
      const response = await fetch(`${baseUrl}api/cledwyn/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: chatHistory,
          lekkerNetworkAccess: !!user?.lekkerNetworkAccess,
          ...(sessionId ? { sessionId } : {}),
        }),
      });

      if (!response.ok) {
        setShowTyping(false);
        setMessages((prev) => {
          const next = [
            ...prev,
            {
              id: generateUniqueId(),
              role: "assistant" as const,
              content: "Sorry, I couldn't reach Cledwyn right now. Please try again in a moment.",
              timestamp: new Date().toISOString(),
            },
          ];
          storage.saveCledwynMessages(next);
          return next;
        });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";
      let assistantAdded = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const metaSessionId = parsed.meta?.sessionId;
            if (typeof metaSessionId === "string" && metaSessionId.length > 0) {
              await AsyncStorage.setItem(NETWORK_SESSION_KEY, metaSessionId);
            }
            if (parsed.content) {
              fullContent += parsed.content;

              if (!assistantAdded) {
                setShowTyping(false);
                setMessages((prev) => [
                  ...prev,
                  {
                    id: generateUniqueId(),
                    role: "assistant",
                    content: fullContent,
                    timestamp: new Date().toISOString(),
                  },
                ]);
                assistantAdded = true;
              } else {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: fullContent,
                  };
                  return updated;
                });
              }
            }
            if (parsed.error) {
              throw new Error(parsed.error);
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }

      setMessages((prev) => {
        storage.saveCledwynMessages(prev);
        return prev;
      });
    } catch (error) {
      setShowTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: generateUniqueId(),
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsStreaming(false);
      setShowTyping(false);
    }
  }

  async function handleClearChat() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMessages([]);
    await storage.saveCledwynMessages([]);
  }

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const isWeb = Platform.OS === "web";
  const TAB_BAR_HEIGHT = 49;
  const nativeBottomPadding = TAB_BAR_HEIGHT + insets.bottom + 8;
  const bottomPadding = isWeb ? 84 : nativeBottomPadding;

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding" keyboardVerticalOffset={0}>
      <View style={[styles.header, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.headerLeft}>
          <View style={styles.cledwynAvatar}>
            <Ionicons name="sparkles" size={20} color={Colors.background} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Cledwyn AI</Text>
            <Text style={styles.headerSubtitle}>
              {workspaceMode
                ? "Workspace mode — alerts + business help"
                : "Your AI assistant"}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {workspaceMode ? (
            <Pressable onPress={() => openWorkspaceCledwyn()} style={styles.handoffButton} hitSlop={8}>
              <Ionicons name="grid-outline" size={18} color={Colors.primary} />
            </Pressable>
          ) : null}
          <Pressable onPress={handleClearChat} style={styles.clearButton}>
            <Ionicons name="trash-outline" size={20} color={Colors.textMuted} />
          </Pressable>
        </View>
      </View>

      {workspaceMode ? (
        <Pressable style={styles.banner} onPress={() => openWorkspaceCledwyn()}>
          <Ionicons name="sparkles" size={14} color={Colors.primary} />
          <Text style={styles.bannerText}>
            Full website & workspace tools → Software Cledwyn. Alerts land here as Cledwyn.
          </Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
        </Pressable>
      ) : null}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MessageBubble message={item} onOpenNotif={openNotif} />}
        ListFooterComponent={showTyping ? <TypingIndicator /> : null}
        onContentSizeChange={() => scrollToLatest(false)}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.messagesList, messages.length === 0 && styles.emptyListContent]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="sparkles" size={48} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Cledwyn AI</Text>
            <Text style={styles.emptySubtitle}>
              {workspaceMode
                ? "Ask about your business — or wait for workspace alerts from lekker.network"
                : "Ask Cledwyn about business strategy, quotes, marketing, or anything else"}
            </Text>
          </View>
        }
      />

      <View style={[styles.inputContainer, { paddingBottom: bottomPadding }]}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="Ask Cledwyn..."
          placeholderTextColor={Colors.textMuted}
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={2000}
          blurOnSubmit={false}
        />
        <Pressable
          onPress={() => {
            handleSend();
            inputRef.current?.focus();
          }}
          style={[styles.sendButton, (!inputText.trim() || isStreaming) && styles.sendButtonDisabled]}
          disabled={!inputText.trim() || isStreaming}
        >
          {isStreaming ? (
            <ActivityIndicator size="small" color={Colors.background} />
          ) : (
            <Ionicons name="arrow-up" size={20} color={Colors.background} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cledwynAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: fontScale(18),
    color: Colors.text,
  },
  headerSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: fontScale(12),
    color: Colors.textSecondary,
  },
  headerRight: { flexDirection: "row", alignItems: "center" },
  handoffButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  clearButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(245,184,0,0.1)",
    borderWidth: 1,
    borderColor: "rgba(245,184,0,0.25)",
  },
  bannerText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 15,
  },
  messagesList: {
    paddingVertical: 8,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.inputBackground,
    borderRadius: 22,
    paddingHorizontal: isSmallScreen ? 14 : 18,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: fontScale(15),
    color: Colors.text,
    fontFamily: "Poppins_400Regular",
    maxHeight: 120,
    minHeight: 44,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendButton: {
    width: 44,
    height: 44,
    minWidth: 44,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.card,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: fontScale(24),
    color: Colors.primary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: fontScale(14),
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
});
