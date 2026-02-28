import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
  Image,
  TextInput,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { storage, Conversation, BlockedUser } from "@/lib/storage";
import { fetchDirectoryCached } from "@/lib/query-client";

function Avatar({ name, color, size = 50, photo, isGroup }: { name: string; color: string; size?: number; photo?: string; isGroup?: boolean }) {
  if (photo) {
    return <Image source={{ uri: photo }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  if (isGroup) {
    return (
      <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
        <Ionicons name="people" size={size * 0.4} color="#fff" />
      </View>
    );
  }
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  );
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = diff / (1000 * 60 * 60);

  if (hours < 24) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (hours < 48) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function ReceiptIcon({ conversation }: { conversation: Conversation }) {
  const lastMsg = conversation.messages[conversation.messages.length - 1];
  if (!lastMsg || lastMsg.senderId !== "me") return null;
  const status = lastMsg.status;
  if (!status || status === "sent") {
    return <Ionicons name="checkmark" size={14} color={Colors.textMuted} />;
  }
  if (status === "delivered") {
    return <Ionicons name="checkmark-done" size={14} color={Colors.textMuted} />;
  }
  return <Ionicons name="checkmark-done" size={14} color="#4CD964" />;
}

export default function ChatsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [lekkerPhones, setLekkerPhones] = useState<Set<string>>(new Set());
  const [blockedPhones, setBlockedPhones] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase().trim();
    return conversations.filter((c) => {
      if (c.contactName.toLowerCase().includes(q)) return true;
      if (c.lastMessage.toLowerCase().includes(q)) return true;
      return c.messages.some((m) => m.content.toLowerCase().includes(q));
    });
  }, [conversations, searchQuery]);

  useFocusEffect(
    useCallback(() => {
      loadConversations();
      loadLekkerPhones();
      loadBlockedUsers();
      const interval = setInterval(loadConversations, 5000);
      return () => clearInterval(interval);
    }, []),
  );

  async function loadConversations() {
    const convs = await storage.getConversations();
    setConversations(convs);
  }

  async function loadLekkerPhones() {
    try {
      const data = await fetchDirectoryCached();
      const phones = new Set<string>(data.entries.map((e: any) => e.phone));
      setLekkerPhones(phones);
    } catch (e) {
      console.error("Failed to load directory phones:", e);
    }
  }

  async function loadBlockedUsers() {
    const blocked = await storage.getBlockedUsers();
    setBlockedPhones(new Set(blocked.map((b) => b.phone)));
  }

  async function handleBlockUser(item: Conversation) {
    const isBlocked = blockedPhones.has(item.contactId);
    if (isBlocked) {
      await storage.unblockUser(item.contactId);
    } else {
      await storage.blockUser(item.contactName, item.contactId);
    }
    loadBlockedUsers();
    loadConversations();
  }

  function handleChatActions(item: Conversation) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const isBlocked = blockedPhones.has(item.contactId);
    const blockOption = item.isGroup ? [] : [
      {
        text: isBlocked ? "Unblock User" : "Block User",
        style: (isBlocked ? "default" : "destructive") as "default" | "destructive",
        onPress: () => {
          if (isBlocked) {
            handleBlockUser(item);
          } else {
            Alert.alert(
              "Block " + item.contactName + "?",
              "Blocked users cannot send you messages. You can unblock them later from Settings.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Block",
                  style: "destructive",
                  onPress: () => handleBlockUser(item),
                },
              ],
            );
          }
        },
      },
    ];

    Alert.alert(
      item.contactName,
      isBlocked ? "This user is blocked" : "",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: item.pinned ? "Unpin Chat" : "Pin Chat",
          onPress: () => handlePinToggle(item.id),
        },
        ...blockOption,
        {
          text: "Delete Chat",
          style: "destructive",
          onPress: async () => {
            await storage.deleteConversation(item.id);
            loadConversations();
          },
        },
      ],
    );
  }

  async function handlePinToggle(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await storage.togglePinConversation(id);
    loadConversations();
  }

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/settings");
            }}
            style={styles.iconButton}
          >
            <Ionicons name="settings-outline" size={24} color={Colors.text} />
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/new-group");
            }}
            style={styles.iconButton}
          >
            <Ionicons name="people-outline" size={24} color={Colors.text} />
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/new-chat");
            }}
            style={styles.iconButton}
          >
            <Ionicons name="create-outline" size={24} color={Colors.primary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search chats..."
          placeholderTextColor={Colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery("")} style={styles.searchClear}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>

      <FlatList
        data={filteredConversations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          Platform.OS === "web" ? { paddingBottom: 84 } : undefined,
        ]}
        contentInsetAdjustmentBehavior="automatic"
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS !== "web"}
        initialNumToRender={15}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.chatItem, pressed && styles.chatItemPressed]}
            onPress={() => router.push({ pathname: "/chat/[id]", params: { id: item.id } })}
            onLongPress={() => handleChatActions(item)}
          >
            <Avatar name={item.contactName} color={item.contactAvatarColor} isGroup={item.isGroup} />
            <View style={styles.chatInfo}>
              <View style={styles.chatTopRow}>
                <View style={styles.nameRow}>
                  {item.pinned && (
                    <Ionicons name="pin" size={12} color={Colors.primary} style={{ transform: [{ rotate: "45deg" }] }} />
                  )}
                  <Text style={styles.chatName} numberOfLines={1}>
                    {item.contactName}
                  </Text>
                  {!item.isGroup && blockedPhones.has(item.contactId) && (
                    <Ionicons name="ban-outline" size={14} color={Colors.danger} />
                  )}
                  {!item.isGroup && !blockedPhones.has(item.contactId) && lekkerPhones.has(item.contactId) && (
                    <View style={styles.verifiedBadge}>
                      <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                    </View>
                  )}
                </View>
                <Text style={styles.chatTime}>
                  {item.lastMessageTime ? formatTime(item.lastMessageTime) : ""}
                </Text>
              </View>
              <View style={styles.chatBottomRow}>
                <View style={styles.lastMessageRow}>
                  <ReceiptIcon conversation={item} />
                  <Text style={styles.chatLastMessage} numberOfLines={1}>
                    {item.lastMessage || "Start a conversation"}
                  </Text>
                </View>
                {item.unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{item.unreadCount}</Text>
                  </View>
                )}
              </View>
            </View>
          </Pressable>
        )}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          searchQuery.trim() ? (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No results</Text>
              <Text style={styles.emptySubtitle}>
                No chats matching "{searchQuery}"
              </Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={64} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptySubtitle}>
                Start chatting with your contacts
              </Text>
              <Pressable
                style={({ pressed }) => [styles.emptyButton, pressed && { opacity: 0.8 }]}
                onPress={() => router.push("/new-chat")}
              >
                <Ionicons name="add" size={20} color={Colors.background} />
                <Text style={styles.emptyButtonText}>New Chat</Text>
              </Pressable>
            </View>
          )
        }
      />
    </View>
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
    paddingVertical: 12,
  },
  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 28,
    color: Colors.text,
  },
  headerActions: {
    flexDirection: "row",
    gap: 4,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: Colors.inputBackground,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    fontFamily: "Poppins_400Regular",
    paddingVertical: 0,
  },
  searchClear: {
    padding: 2,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
    gap: 14,
  },
  chatItemPressed: {
    backgroundColor: Colors.card,
    borderRadius: 12,
  },
  avatar: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: "Poppins_600SemiBold",
    color: "#fff",
  },
  chatInfo: {
    flex: 1,
  },
  chatTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
    gap: 4,
  },
  chatName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.text,
    flexShrink: 1,
  },
  verifiedBadge: {
    flexShrink: 0,
  },
  chatTime: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  chatBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lastMessageRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
    gap: 4,
  },
  chatLastMessage: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    flex: 1,
  },
  unreadBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    minWidth: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: Colors.background,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 120,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 20,
    color: Colors.text,
    marginTop: 8,
  },
  emptySubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  emptyButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  emptyButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.background,
  },
});
