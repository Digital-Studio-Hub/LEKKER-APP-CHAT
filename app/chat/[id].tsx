import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { storage, Conversation, ChatMessage, MessageStatus } from "@/lib/storage";
import { getApiUrl } from "@/lib/query-client";

function ReceiptIcon({ status }: { status?: MessageStatus }) {
  if (!status) return null;
  if (status === "sent") {
    return <Ionicons name="checkmark" size={14} color="rgba(0,0,0,0.4)" />;
  }
  if (status === "delivered") {
    return <Ionicons name="checkmark-done" size={14} color="rgba(0,0,0,0.4)" />;
  }
  return <Ionicons name="checkmark-done" size={14} color="#4CD964" />;
}

function MessageBubble({ message, isMe, isGroup, senderName }: { message: ChatMessage; isMe: boolean; isGroup?: boolean; senderName?: string }) {
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <View style={[bubbleStyles.wrapper, isMe ? bubbleStyles.meWrapper : bubbleStyles.themWrapper]}>
      <View style={[bubbleStyles.bubble, isMe ? bubbleStyles.meBubble : bubbleStyles.themBubble]}>
        {isGroup && !isMe && senderName && (
          <Text style={bubbleStyles.senderName}>{senderName}</Text>
        )}
        <Text style={[bubbleStyles.text, isMe ? bubbleStyles.meText : bubbleStyles.themText]}>
          {message.content}
        </Text>
        <View style={bubbleStyles.metaRow}>
          <Text style={[bubbleStyles.time, isMe ? bubbleStyles.meTime : bubbleStyles.themTime]}>
            {time}
          </Text>
          {isMe && <ReceiptIcon status={message.status} />}
        </View>
      </View>
    </View>
  );
}

const bubbleStyles = StyleSheet.create({
  wrapper: { paddingHorizontal: 16, paddingVertical: 2 },
  meWrapper: { alignItems: "flex-end" },
  themWrapper: { alignItems: "flex-start" },
  bubble: { maxWidth: "78%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  meBubble: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  themBubble: { backgroundColor: Colors.card, borderBottomLeftRadius: 4 },
  senderName: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.primary, marginBottom: 2 },
  text: { fontFamily: "Poppins_400Regular", fontSize: 15, lineHeight: 22 },
  meText: { color: Colors.background },
  themText: { color: Colors.text },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-end", marginTop: 2 },
  time: { fontFamily: "Poppins_400Regular", fontSize: 10 },
  meTime: { color: "rgba(0,0,0,0.4)" },
  themTime: { color: Colors.textMuted },
});

export default function ChatDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [inputText, setInputText] = useState("");
  const [isLekkerpreneur, setIsLekkerpreneur] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    loadConversation();
    loadLekkerStatus();
    refreshIntervalRef.current = setInterval(() => {
      loadConversation();
    }, 2000);
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      if (id) storage.markConversationSeen(id);
    }, [id]),
  );

  async function loadConversation() {
    const convs = await storage.getConversations();
    const conv = convs.find((c) => c.id === id);
    if (conv) {
      conv.unreadCount = 0;
      await storage.saveConversations(convs);
      setConversation(conv);
    }
  }

  async function loadLekkerStatus() {
    try {
      const url = new URL("/api/directory", getApiUrl());
      const res = await fetch(url.toString());
      const data = await res.json();
      const convs = await storage.getConversations();
      const conv = convs.find((c) => c.id === id);
      if (conv) {
        const phones = new Set(data.entries.map((e: any) => e.phone));
        setIsLekkerpreneur(phones.has(conv.contactId));
      }
    } catch (e) {}
  }

  async function handleSend() {
    const text = inputText.trim();
    if (!text || !id) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInputText("");

    await storage.addMessageToConversation(id, text, "me");
    await loadConversation();
  }

  function getSenderName(senderId: string): string | undefined {
    if (!conversation?.isGroup || !conversation.groupMembers) return undefined;
    const member = conversation.groupMembers.find((m) => m.phone === senderId || m.id === senderId);
    return member?.name;
  }

  const messages = conversation?.messages || [];
  const reversedMessages = [...messages].reverse();
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding" keyboardVerticalOffset={0}>
      <View style={[styles.header, { paddingTop: insets.top + webTopInset }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={Colors.text} />
        </Pressable>
        {conversation && (
          <View style={styles.headerCenter}>
            <View style={[styles.avatar, { backgroundColor: conversation.contactAvatarColor }]}>
              {conversation.isGroup ? (
                <Ionicons name="people" size={16} color="#fff" />
              ) : (
                <Text style={styles.avatarText}>
                  {conversation.contactName.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase()}
                </Text>
              )}
            </View>
            <View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={styles.headerName} numberOfLines={1}>{conversation.contactName}</Text>
                {isLekkerpreneur && !conversation.isGroup && (
                  <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                )}
              </View>
              {conversation.isGroup && conversation.groupMembers && (
                <Text style={styles.headerMembers} numberOfLines={1}>
                  {conversation.groupMembers.map((m) => m.name.split(" ")[0]).join(", ")}
                </Text>
              )}
            </View>
          </View>
        )}
        <View style={styles.backButton} />
      </View>

      <FlatList
        data={reversedMessages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            isMe={item.senderId === "me"}
            isGroup={conversation?.isGroup}
            senderName={getSenderName(item.senderId)}
          />
        )}
        inverted
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.messageList, messages.length === 0 && styles.emptyListContent]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Send a message to start the conversation</Text>
          </View>
        }
      />

      <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="Type a message..."
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
          style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
          disabled={!inputText.trim()}
        >
          <Ionicons name="send" size={18} color={Colors.background} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, justifyContent: "center" },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#fff" },
  headerName: { fontFamily: "Poppins_600SemiBold", fontSize: 17, color: Colors.text },
  headerMembers: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textMuted, maxWidth: 200 },
  messageList: { paddingVertical: 8 },
  emptyListContent: { flexGrow: 1, justifyContent: "center" },
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
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    color: Colors.text,
    fontFamily: "Poppins_400Regular",
    maxHeight: 120,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  sendButtonDisabled: { opacity: 0.4 },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    transform: [{ scaleY: -1 }],
  },
  emptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
  },
});
