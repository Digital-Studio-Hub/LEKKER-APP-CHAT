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
import { storage, BlockedUser } from "@/lib/storage";
import {
  fetchChats,
  deleteServerChat,
  getChatDisplayName,
  getChatAvatarColor,
  getChatProfilePhoto,
  getOtherParticipant,
  getPresenceColor,
  getPresenceLabel,
  isQuickNotesChat,
  type ServerChat,
} from "@/lib/chat-api";
import { isSmallScreen, fontScale, responsivePadding, responsiveAvatarSize } from "@/lib/responsive";
import { syncMeetAutoPresence } from "@/lib/meet-presence";

type PresenceStatus = "online" | "away" | "dnd" | "offline";

const QUICK_PRESENCE: { value: PresenceStatus; label: string; color: string }[] = [
  { value: "online", label: "Online", color: Colors.online },
  { value: "away", label: "Away", color: Colors.away },
  { value: "dnd", label: "Do Not Disturb", color: Colors.dnd },
  { value: "offline", label: "Offline", color: Colors.offline },
];

function Avatar({
  name,
  color,
  size = 50,
  photo,
  isGroup,
  isNotes,
  presence,
}: {
  name: string;
  color: string;
  size?: number;
  photo?: string | null;
  isGroup?: boolean;
  isNotes?: boolean;
  presence?: string | null;
}) {
  const dotSize = Math.max(10, size * 0.24);
  const showDot = !isGroup && !isNotes;

  const dot = showDot ? (
    <View style={{
      position: "absolute",
      bottom: 0,
      right: 0,
      width: dotSize,
      height: dotSize,
      borderRadius: dotSize / 2,
      backgroundColor: getPresenceColor(presence),
      borderWidth: 2,
      borderColor: Colors.background,
    }} />
  ) : null;

  if (photo) {
    return (
      <View style={{ width: size, height: size }}>
        <Image source={{ uri: photo }} style={{ width: size, height: size, borderRadius: size / 2 }} />
        {dot}
      </View>
    );
  }
  if (isNotes) {
    return (
      <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
        <Ionicons name="document-text" size={size * 0.42} color={Colors.background} />
      </View>
    );
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
    <View style={{ width: size, height: size }}>
      <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
        <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials}</Text>
      </View>
      {dot}
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

function ReceiptIcon({ chat, myUserId }: { chat: ServerChat; myUserId: string }) {
  if (!chat.lastMessage || chat.lastMessage.senderId !== myUserId) return null;
  const status = chat.lastMessage.status;
  if (!status || status === "sent") {
    return <Ionicons name="checkmark" size={14} color={Colors.textMuted} />;
  }
  if (status === "delivered") {
    return <Ionicons name="checkmark-done" size={14} color={Colors.textMuted} />;
  }
  return <Ionicons name="checkmark-done" size={14} color="#4CD964" />;
}

type EnquiryPreview = {
  id: string;
  summary?: string;
  serviceLabel?: string;
  status?: string;
  provider?: { businessName?: string; phone?: string | null };
  lastMessageAt?: string;
  updatedAt?: string;
  transcript?: Array<{ role?: string; content?: string }>;
};

export default function ChatsScreen() {
  const insets = useSafeAreaInsets();
  const { user, updateProfile } = useAuth();
  const [chats, setChats] = useState<ServerChat[]>([]);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [enquiries, setEnquiries] = useState<EnquiryPreview[]>([]);

  const filteredChats = useMemo(() => {
    const sorted = [...chats].sort((a, b) => {
      const aNotes = isQuickNotesChat(a) ? 1 : 0;
      const bNotes = isQuickNotesChat(b) ? 1 : 0;
      if (aNotes !== bNotes) return bNotes - aNotes;
      return 0; // keep server order otherwise
    });
    if (!searchQuery.trim()) return sorted;
    const q = searchQuery.toLowerCase().trim();
    return sorted.filter((c) => {
      const name = getChatDisplayName(c, user?.id || "");
      if (name.toLowerCase().includes(q)) return true;
      if (c.lastMessage?.content?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [chats, searchQuery, user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadChats();
      loadBlockedUsers();
      loadEnquiries();
      // Auto-DND while in Meet / active booking (lekkerpreneurs with synced workspace)
      if (user?.isVerifiedLekkerpreneur && user?.lekkerWorkspaceId) {
        syncMeetAutoPresence({
          enabled: true,
          currentPresence: user.presence,
          updatePresence: async (presence) => {
            await updateProfile({ presence });
          },
        });
      }
      const interval = setInterval(() => {
        loadChats();
        loadEnquiries();
      }, 5000);
      return () => clearInterval(interval);
    }, [user?.id, user?.presence, user?.isVerifiedLekkerpreneur, user?.lekkerWorkspaceId]),
  );

  function handleQuickStatus() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const current = (user?.presence as PresenceStatus) || "online";
    Alert.alert(
      "Your status",
      `Currently ${getPresenceLabel(current)}. During Lekker Meet, status can switch to Do Not Disturb automatically.`,
      [
        ...QUICK_PRESENCE.map((opt) => ({
          text: `${opt.label}${opt.value === current ? " ✓" : ""}`,
          onPress: async () => {
            Haptics.selectionAsync();
            await updateProfile({ presence: opt.value });
          },
        })),
        { text: "Cancel", style: "cancel" as const },
      ],
    );
  }

  async function loadChats() {
    const serverChats = await fetchChats();
    setChats(serverChats);
  }

  async function loadEnquiries() {
    try {
      const { getApiUrl } = await import("@/lib/query-client");
      const { getAuthToken } = await import("@/lib/auth-token");
      const res = await fetch(new URL("/api/enquiries", getApiUrl()).toString(), {
        headers: { Authorization: `Bearer ${getAuthToken() || ""}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const list = (data.leads || data.enquiries || []) as EnquiryPreview[];
      // Newest activity first
      const sorted = Array.isArray(list)
        ? [...list].sort((a, b) => {
            const ta = new Date(a.lastMessageAt || a.updatedAt || 0).getTime();
            const tb = new Date(b.lastMessageAt || b.updatedAt || 0).getTime();
            return tb - ta;
          })
        : [];
      setEnquiries(sorted.slice(0, 20));
    } catch {
      /* optional strip — ignore offline */
    }
  }

  function enquiryPreviewLine(e: EnquiryPreview): string {
    const turns = Array.isArray(e.transcript) ? e.transcript : [];
    const last = turns.length ? turns[turns.length - 1] : null;
    if (last?.content) {
      const who = last.role === "provider" ? "Them" : last.role === "system" ? "" : "You";
      return who ? `${who}: ${last.content}` : last.content;
    }
    return e.summary || e.serviceLabel || "Open thread";
  }

  function enquiryHasUnread(e: EnquiryPreview): boolean {
    const turns = Array.isArray(e.transcript) ? e.transcript : [];
    if (!turns.length) return false;
    const last = turns[turns.length - 1];
    return last?.role === "provider";
  }

  async function loadBlockedUsers() {
    const blocked = await storage.getBlockedUsers();
    setBlockedIds(new Set(blocked.map((b) => b.id)));
  }

  async function handleBlockUser(chat: ServerChat) {
    const other = getOtherParticipant(chat, user?.id || "");
    if (!other) return;
    const isBlocked = blockedIds.has(other.id);
    if (isBlocked) {
      await storage.unblockUser(other.id);
    } else {
      await storage.blockUser(getDisplayNameForChat(chat), other.id);
    }
    loadBlockedUsers();
  }

  function getDisplayNameForChat(chat: ServerChat): string {
    return getChatDisplayName(chat, user?.id || "");
  }

  function handleChatActions(chat: ServerChat) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const other = getOtherParticipant(chat, user?.id || "");
    const isBlocked = other ? blockedIds.has(other.id) : false;
    const name = getDisplayNameForChat(chat);
    const notes = isQuickNotesChat(chat);

    if (notes) {
      Alert.alert(
        "Quick Notes",
        "Your personal scratchpad — always pinned at the top. Open it to jot reminders to yourself.",
        [{ text: "OK", style: "cancel" }],
      );
      return;
    }

    const blockOption = chat.type === "group" ? [] : [
      {
        text: isBlocked ? "Unblock User" : "Block User",
        style: (isBlocked ? "default" : "destructive") as "default" | "destructive",
        onPress: () => {
          if (isBlocked) {
            handleBlockUser(chat);
          } else {
            Alert.alert(
              "Block " + name + "?",
              "Blocked users cannot send you messages. You can unblock them later from Settings.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Block", style: "destructive", onPress: () => handleBlockUser(chat) },
              ],
            );
          }
        },
      },
    ];

    Alert.alert(
      name,
      isBlocked ? "This user is blocked" : "",
      [
        { text: "Cancel", style: "cancel" },
        ...blockOption,
        {
          text: "Delete Chat",
          style: "destructive",
          onPress: async () => {
            await deleteServerChat(chat.id);
            loadChats();
          },
        },
      ],
    );
  }

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const myUserId = user?.id || "";

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable
          onPress={handleQuickStatus}
          style={styles.statusHit}
          hitSlop={8}
          testID="quick-status"
        >
          <Text style={styles.headerTitle}>Chats</Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: getPresenceColor(user?.presence) },
              ]}
            />
            <Text style={styles.statusLabel}>{getPresenceLabel(user?.presence)}</Text>
            <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
          </View>
        </Pressable>
        <View style={styles.headerActions}>
          {user?.isVerifiedLekkerpreneur && user?.lekkerWorkspaceId ? (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/schedule");
              }}
              style={styles.iconButton}
              testID="schedule-button"
            >
              <Ionicons name="calendar-outline" size={24} color={Colors.text} />
            </Pressable>
          ) : null}
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
        data={filteredChats}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Platform.OS === "web" ? 84 : 49 + insets.bottom + 8 },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS !== "web"}
        initialNumToRender={15}
        ListHeaderComponent={
          <View style={styles.enquiriesSection}>
            <View style={styles.enquiriesHeader}>
              <Text style={styles.enquiriesTitle}>Enquiries</Text>
              <Text style={styles.enquiriesHint}>
                {enquiries.length
                  ? "Directory & Marketplace — private until you reveal contact"
                  : "Enquire from Directory — replies appear here"}
              </Text>
            </View>
            {enquiries.length === 0 ? (
              <Pressable
                style={({ pressed }) => [styles.enquiryRow, pressed && styles.chatItemPressed]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push("/(tabs)/directory");
                }}
              >
                <View style={[styles.enquiryIcon, { backgroundColor: Colors.cardElevated }]}>
                  <Ionicons name="people-outline" size={18} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.chatName}>Find a lekkerpreneur</Text>
                  <Text style={styles.chatLastMessage}>Open Directory to send an anonymous enquiry</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </Pressable>
            ) : (
              enquiries.map((e) => {
                const unread = enquiryHasUnread(e);
                return (
                  <Pressable
                    key={e.id}
                    style={({ pressed }) => [styles.enquiryRow, pressed && styles.chatItemPressed]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push({ pathname: "/enquiry/[id]", params: { id: e.id } });
                    }}
                  >
                    <View style={styles.enquiryIcon}>
                      <Ionicons name="briefcase-outline" size={18} color={Colors.background} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.chatName} numberOfLines={1}>
                        {e.provider?.businessName || e.serviceLabel || "Marketplace enquiry"}
                      </Text>
                      <Text style={styles.chatLastMessage} numberOfLines={1}>
                        {enquiryPreviewLine(e)}
                      </Text>
                    </View>
                    {unread ? (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadText}>1</Text>
                      </View>
                    ) : (
                      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                    )}
                  </Pressable>
                );
              })
            )}
            <View style={styles.enquiriesDivider} />
          </View>
        }
        renderItem={({ item }) => {
          const chatName = getDisplayNameForChat(item);
          const avatarColor = getChatAvatarColor(item, myUserId);
          const photo = getChatProfilePhoto(item, myUserId);
          const other = getOtherParticipant(item, myUserId);
          const isBlocked = other ? blockedIds.has(other.id) : false;
          const isVerified = other?.isVerifiedLekkerpreneur || false;
          const notes = isQuickNotesChat(item);

          return (
            <Pressable
              style={({ pressed }) => [
                styles.chatItem,
                notes && styles.notesChatItem,
                pressed && styles.chatItemPressed,
              ]}
              onPress={() => router.push({ pathname: "/chat/[id]", params: { id: item.id } })}
              onLongPress={() => handleChatActions(item)}
              testID={notes ? "chat-item-quick-notes" : `chat-item-${item.id}`}
            >
              <Avatar
                name={chatName}
                color={avatarColor}
                photo={photo}
                isGroup={item.type === "group"}
                isNotes={notes}
                presence={other?.presence}
              />
              <View style={styles.chatInfo}>
                <View style={styles.chatTopRow}>
                  <View style={styles.nameRow}>
                    <Text style={styles.chatName} numberOfLines={1}>
                      {chatName}
                    </Text>
                    {notes && (
                      <Ionicons name="pin" size={14} color={Colors.primary} />
                    )}
                    {isBlocked && (
                      <Ionicons name="ban-outline" size={14} color={Colors.danger} />
                    )}
                    {!isBlocked && isVerified && (
                      <View style={styles.verifiedBadge}>
                        <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                      </View>
                    )}
                  </View>
                  <Text style={styles.chatTime}>
                    {item.lastMessage?.createdAt ? formatTime(item.lastMessage.createdAt) : ""}
                  </Text>
                </View>
                <View style={styles.chatBottomRow}>
                  <View style={styles.lastMessageRow}>
                    {!notes && <ReceiptIcon chat={item} myUserId={myUserId} />}
                    <Text style={styles.chatLastMessage} numberOfLines={1}>
                      {item.lastMessage?.content ||
                        (notes ? "Jot a reminder to yourself" : "Start a conversation")}
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
          );
        }}
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
    paddingHorizontal: responsivePadding(),
    paddingVertical: 12,
  },
  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: fontScale(28),
    color: Colors.text,
  },
  statusHit: {
    flexShrink: 1,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
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
    minWidth: 44,
    minHeight: 44,
  },
  enquiriesSection: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  enquiriesHeader: {
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  enquiriesTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: fontScale(13),
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  enquiriesHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  enquiryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  enquiryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  enquiriesDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginTop: 8,
    marginBottom: 4,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: isSmallScreen ? 12 : 16,
    marginBottom: 8,
    backgroundColor: Colors.inputBackground,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    minHeight: 40,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: fontScale(15),
    color: Colors.text,
    fontFamily: "Poppins_400Regular",
    paddingVertical: 0,
  },
  searchClear: {
    padding: 2,
  },
  listContent: {
    paddingHorizontal: isSmallScreen ? 12 : 16,
  },
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
    gap: isSmallScreen ? 10 : 14,
    minHeight: 64,
  },
  notesChatItem: {
    backgroundColor: "rgba(245,184,0,0.06)",
    borderRadius: 12,
    marginBottom: 4,
    borderBottomWidth: 0,
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
    fontSize: fontScale(16),
    color: Colors.text,
    flexShrink: 1,
  },
  verifiedBadge: {
    flexShrink: 0,
  },
  chatTime: {
    fontFamily: "Poppins_400Regular",
    fontSize: fontScale(12),
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
    fontSize: fontScale(14),
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
