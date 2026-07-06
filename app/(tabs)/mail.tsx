import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  KeyboardAvoidingView,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { fontScale } from "@/lib/responsive";
import {
  fetchMailThreads,
  fetchMailThread,
  sendMail,
  type MailThread,
  type MailMessage,
} from "@/lib/mail-api";

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function replySubject(subject: string): string {
  const s = subject || "";
  return s.toLowerCase().startsWith("re:") ? s : `Re: ${s}`;
}

export default function MailScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const [threads, setThreads] = useState<MailThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<MailThread | null>(null);
  const [threadSubject, setThreadSubject] = useState("");
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [composing, setComposing] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  const bottomPad = Platform.OS === "web" ? 84 : 49 + insets.bottom + 8;

  async function loadThreads(refresh = false) {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const data = await fetchMailThreads();
      setThreads(data);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      if (!selectedThread && !composing) loadThreads();
    }, [selectedThread, composing]),
  );

  async function openThread(thread: MailThread) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedThread(thread);
    setComposing(false);
    setLoadingThread(true);
    setReplyBody("");
    try {
      const detail = await fetchMailThread(thread.id);
      setThreadSubject(detail.subject || thread.subject);
      setMessages(detail.messages);
    } finally {
      setLoadingThread(false);
    }
  }

  function closeThread() {
    setSelectedThread(null);
    setMessages([]);
    setReplyBody("");
    loadThreads(true);
  }

  function startCompose() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedThread(null);
    setComposing(true);
    setComposeTo("");
    setComposeSubject("");
    setComposeBody("");
  }

  function cancelCompose() {
    setComposing(false);
    loadThreads(true);
  }

  async function handleSendCompose() {
    if (!composeTo.trim() || !composeSubject.trim() || !composeBody.trim()) {
      Alert.alert("Missing fields", "Add recipient, subject, and message.");
      return;
    }
    setSending(true);
    try {
      const result = await sendMail({
        to: composeTo.trim(),
        subject: composeSubject.trim(),
        bodyText: composeBody.trim(),
      });
      if (!result.success) {
        Alert.alert("Send failed", result.message || "Could not send email");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setComposing(false);
      await loadThreads(true);
    } finally {
      setSending(false);
    }
  }

  async function handleSendReply() {
    if (!replyBody.trim() || !selectedThread) return;
    const inbound = [...messages].reverse().find((m) => !m.isOutbound && m.fromAddress);
    const to = inbound?.fromAddress || "";
    if (!to) {
      Alert.alert("Cannot reply", "No recipient address found on this thread.");
      return;
    }
    const lastMsg = messages[messages.length - 1];
    setSending(true);
    try {
      const result = await sendMail({
        to,
        subject: replySubject(threadSubject || selectedThread.subject),
        bodyText: replyBody.trim(),
        inReplyTo: lastMsg?.id,
        references: lastMsg?.id,
      });
      if (!result.success) {
        Alert.alert("Send failed", result.message || "Could not send reply");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setReplyBody("");
      const detail = await fetchMailThread(selectedThread.id);
      setMessages(detail.messages);
      setThreadSubject(detail.subject);
    } finally {
      setSending(false);
    }
  }

  if (composing) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: insets.top + webTopInset }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.threadHeader}>
          <Pressable onPress={cancelCompose} style={styles.backButton}>
            <Ionicons name="close" size={22} color={Colors.text} />
          </Pressable>
          <Text style={styles.composeTitle}>New email</Text>
          <Pressable onPress={handleSendCompose} disabled={sending} style={styles.sendHeaderBtn}>
            {sending ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Ionicons name="send" size={20} color={Colors.primary} />
            )}
          </Pressable>
        </View>
        <View style={styles.composeForm}>
          <TextInput
            style={styles.composeField}
            placeholder="To"
            placeholderTextColor={Colors.textMuted}
            value={composeTo}
            onChangeText={setComposeTo}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.composeField}
            placeholder="Subject"
            placeholderTextColor={Colors.textMuted}
            value={composeSubject}
            onChangeText={setComposeSubject}
          />
          <TextInput
            style={[styles.composeField, styles.composeBody]}
            placeholder="Message"
            placeholderTextColor={Colors.textMuted}
            value={composeBody}
            onChangeText={setComposeBody}
            multiline
            textAlignVertical="top"
          />
        </View>
      </KeyboardAvoidingView>
    );
  }

  if (selectedThread) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: insets.top + webTopInset }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.threadHeader}>
          <Pressable onPress={closeThread} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={Colors.text} />
          </Pressable>
          <View style={styles.threadHeaderInfo}>
            <Text style={styles.threadSubject} numberOfLines={1}>
              {threadSubject || selectedThread.subject || "(No subject)"}
            </Text>
            <Text style={styles.threadFrom} numberOfLines={1}>{selectedThread.fromName}</Text>
          </View>
        </View>

        {loadingThread ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <>
            <FlatList
              data={messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.messagesList}
              renderItem={({ item }) => (
                <View style={[styles.messageBubble, item.isOutbound && styles.messageOutbound]}>
                  <Text style={styles.messageFrom}>{item.from}</Text>
                  <Text style={styles.messageBody}>{item.bodyText}</Text>
                  <Text style={styles.messageTime}>{formatTimeAgo(item.createdAt)}</Text>
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.centered}>
                  <Text style={styles.emptyText}>No messages in this thread</Text>
                </View>
              }
            />
            <View style={[styles.replyBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
              <TextInput
                style={styles.replyInput}
                placeholder="Reply..."
                placeholderTextColor={Colors.textMuted}
                value={replyBody}
                onChangeText={setReplyBody}
                multiline
              />
              <Pressable
                onPress={handleSendReply}
                disabled={sending || !replyBody.trim()}
                style={[styles.replySend, (!replyBody.trim() || sending) && { opacity: 0.4 }]}
              >
                {sending ? (
                  <ActivityIndicator size="small" color={Colors.background} />
                ) : (
                  <Ionicons name="send" size={18} color={Colors.background} />
                )}
              </Pressable>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.headerTitle}>Mail</Text>
          <Text style={styles.headerSubtitle}>Workspace inbox</Text>
        </View>
        <Pressable onPress={startCompose} style={styles.composeFab}>
          <Ionicons name="create-outline" size={22} color={Colors.background} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadThreads(true)}
              tintColor={Colors.primary}
            />
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.threadRow, pressed && { opacity: 0.85 }]}
              onPress={() => openThread(item)}
            >
              <View style={styles.threadRowMain}>
                <View style={styles.threadRowTop}>
                  <Text style={[styles.threadFromName, item.unread && styles.unreadText]} numberOfLines={1}>
                    {item.fromName || "Unknown"}
                  </Text>
                  <Text style={styles.threadTime}>{formatTimeAgo(item.updatedAt)}</Text>
                </View>
                <Text style={[styles.threadRowSubject, item.unread && styles.unreadText]} numberOfLines={1}>
                  {item.subject || "(No subject)"}
                </Text>
                <Text style={styles.threadSnippet} numberOfLines={2}>{item.snippet}</Text>
              </View>
              {item.unread && <View style={styles.unreadDot} />}
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="mail-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>Inbox is empty</Text>
              <Text style={styles.emptySubtext}>Tap compose to send your first email</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: fontScale(28), color: Colors.text },
  headerSubtitle: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  composeFab: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 16, paddingTop: 8 },
  threadRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 8,
  },
  threadRowMain: { flex: 1 },
  threadRowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  threadFromName: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text, flex: 1 },
  threadTime: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textMuted },
  threadRowSubject: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text, marginBottom: 2 },
  threadSnippet: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  unreadText: { color: Colors.text },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  threadHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  backButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  threadHeaderInfo: { flex: 1 },
  composeTitle: { flex: 1, fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.text },
  sendHeaderBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  threadSubject: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text },
  threadFrom: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textMuted },
  messagesList: { padding: 16, gap: 12, paddingBottom: 8 },
  messageBubble: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    maxWidth: "92%",
    alignSelf: "flex-start",
  },
  messageOutbound: { alignSelf: "flex-end", backgroundColor: Colors.cardElevated },
  messageFrom: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.primary, marginBottom: 6 },
  messageBody: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text, lineHeight: 22 },
  messageTime: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textMuted, marginTop: 8, textAlign: "right" },
  replyBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  replyInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: Colors.inputBackground,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
  },
  replySend: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  composeForm: { padding: 16, gap: 10, flex: 1 },
  composeField: {
    backgroundColor: Colors.inputBackground,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
  },
  composeBody: { flex: 1, minHeight: 160, textAlignVertical: "top" },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 8 },
  emptyText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.text },
  emptySubtext: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textMuted },
});