import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
  Image,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { storage, Conversation } from "@/lib/storage";

function Avatar({ name, color, size = 50, photo }: { name: string; color: string; size?: number; photo?: string }) {
  if (photo) {
    return <Image source={{ uri: photo }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
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

export default function ChatsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadConversations();
    }, []),
  );

  async function loadConversations() {
    const convs = await storage.getConversations();
    setConversations(convs);
  }

  function handleDeleteConversation(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (Platform.OS === "web") {
      storage.deleteConversation(id).then(loadConversations);
      return;
    }
    Alert.alert("Delete Chat", "Are you sure you want to delete this chat?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await storage.deleteConversation(id);
          loadConversations();
        },
      },
    ]);
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
              router.push("/new-chat");
            }}
            style={styles.iconButton}
          >
            <Ionicons name="create-outline" size={24} color={Colors.primary} />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          Platform.OS === "web" ? { paddingBottom: 84 } : undefined,
        ]}
        contentInsetAdjustmentBehavior="automatic"
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.chatItem, pressed && styles.chatItemPressed]}
            onPress={() => router.push({ pathname: "/chat/[id]", params: { id: item.id } })}
            onLongPress={() => handleDeleteConversation(item.id)}
          >
            <Avatar name={item.contactName} color={item.contactAvatarColor} />
            <View style={styles.chatInfo}>
              <View style={styles.chatTopRow}>
                <Text style={styles.chatName} numberOfLines={1}>
                  {item.contactName}
                </Text>
                <Text style={styles.chatTime}>
                  {item.lastMessageTime ? formatTime(item.lastMessageTime) : ""}
                </Text>
              </View>
              <View style={styles.chatBottomRow}>
                <Text style={styles.chatLastMessage} numberOfLines={1}>
                  {item.lastMessage || "Start a conversation"}
                </Text>
                {item.unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{item.unreadCount}</Text>
                  </View>
                )}
              </View>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
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
  chatName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.text,
    flex: 1,
    marginRight: 8,
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
  chatLastMessage: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    flex: 1,
    marginRight: 8,
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
