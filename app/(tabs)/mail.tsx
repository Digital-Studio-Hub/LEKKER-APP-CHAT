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

export default function MailScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const [threads, setThreads] = useState<MailThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<MailThread | null>(null);
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
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
      if (!selectedThread) loadThreads();
    }, [selectedThread]),
  );

  async function openThread(thread: MailThread) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedThread(thread);
    setLoadingThread(true);
    try {
      const msgs = await fetchMailThread(thread.id);
      setMessages(msgs);
    } finally {
      setLoadingThread(false);
    }
  }

  function closeThread() {
    setSelectedThread(null);
    setMessages([]);
    loadThreads(true);
  }

  if (selectedThread) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.threadHeader}>
          <Pressable onPress={closeThread} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={Colors.text} />
          </Pressable>
          <View style={styles.threadHeaderInfo}>
            <Text style={styles.threadSubject} numberOfLines={1}>{selectedThread.subject || "(No subject)"}</Text>
            <Text style={styles.threadFrom} numberOfLines={1}>{selectedThread.fromName}</Text>
          </View>
        </View>

        {loadingThread ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.messagesList, { paddingBottom: bottomPad }]}
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
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mail</Text>
        <Text style={styles.headerSubtitle}>Workspace inbox</Text>
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
              <Text style={styles.emptySubtext}>New emails will appear here</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingVertical: 8 },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: fontScale(28), color: Colors.text },
  headerSubtitle: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textMuted, marginTop: 2 },
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
  threadSubject: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text },
  threadFrom: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textMuted },
  messagesList: { padding: 16, gap: 12 },
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
  emptyState: { alignItems: "center", paddingTop: 60, gap: 8 },
  emptyText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.text },
  emptySubtext: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textMuted },
});